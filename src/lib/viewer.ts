/**
 * Lazy-loaded Three.js viewer for meshopt-compressed GLB models.
 *
 * Efficiency contract:
 * - This module (and three.js) is a separate chunk fetched only once the page
 *   actually needs a viewer (see ModelViewer.astro); every viewer shares it.
 * - The rAF loop runs only while the model is auto-rotating **and on screen and
 *   the tab is visible**, or while the camera is moving. Otherwise the loop
 *   exits outright: zero CPU/GPU.
 * - Pixel ratio capped at 2; renderer disposed on teardown.
 *
 * Liveness contract — why `wake()` looks paranoid:
 * a backgrounded tab stops firing requestAnimationFrame *and* stops delivering
 * IntersectionObserver records. Any bookkeeping that means "a frame is already
 * scheduled" or "we are on screen" can therefore be left stale across a tab
 * switch, and a stale pair of those flags is what used to freeze every
 * turntable for good once the visitor came back. So: `wake()` never trusts that
 * bookkeeping and always reschedules from scratch, liveness is re-derived from
 * `document.visibilityState` rather than cached, and visibilitychange /
 * pageshow / webglcontextrestored all funnel back into `wake()`.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  Group,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * A movable joint, declared in a project's `axes` frontmatter. CAD mates are not
 * carried by STEP or glTF, so the kinematics are described here instead and
 * reconstructed at load time from the exported node names.
 */
interface AxisSpec {
  id: string;
  label: string;
  pivot: [number, number, number];
  axis: [number, number, number];
  range: [number, number];
  start: number;
  parent?: string;
  include: string[];
  exclude: string[];
}

/**
 * Node names as they arrive in the scene graph, not as the CAD tool wrote them.
 *
 * GLTFLoader runs every node name through three.js's `sanitizeNodeName`, which
 * turns whitespace into `_` and drops `[`, `]`, `.`, `:` and `/`. Axis configs
 * are written with the names `npm run convert` prints — i.e. the *original*
 * ones, spaces and all — so a pattern like `V-Axis Bed <1>` would never match
 * the `V-Axis_Bed_<1>` that is actually in the tree. Comparing both sides in a
 * normalized form keeps the frontmatter readable and copy-pasteable.
 */
function normalizeName(name: string): string {
  return name
    .replace(/[\s_]+/g, " ")
    .replace(/[[\].:/]/g, "")
    .trim()
    .toLowerCase();
}

/** Exact name match against {@link normalizeName}, with `*` as the only wildcard. */
function nameMatcher(pattern: string): RegExp {
  // Split on the wildcard first so every other character stays literal, and no
  // sentinel has to be smuggled through the string.
  const escaped = normalizeName(pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, (ch) => `\\${ch}`))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

// ---------------------------------------------------------------------------
// Shared model download queue
// ---------------------------------------------------------------------------
/**
 * Every project card owns a viewer and every viewer wants a multi-megabyte
 * `.glb`. Left to themselves they each start the moment they enter their
 * preload band, so one flick of the scroll wheel puts the whole set in flight
 * and the model the visitor is actually looking at ends up sharing the pipe
 * with six it cannot see.
 *
 * So downloads go through one queue instead: at most {@link MAX_IN_FLIGHT} at a
 * time, picked by priority and then by distance to the viewport, re-evaluated
 * every time a slot frees. That serialisation is what makes the rest of the
 * strategy safe — the preload band can reach far ahead of the viewport, and
 * idle time can be spent warming models nobody has scrolled to yet, without
 * either ever costing the on-screen model its bandwidth.
 */
const MAX_IN_FLIGHT = 2;

/** Priority tiers — lower wins. */
/** A project the visitor just opened: never queued, never made to wait. */
const URGENT = 0;
/** Inside the preload band, i.e. on its way to the viewport. */
const NEAR = 1;
/** Idle warm-up of a model that is nowhere near the viewport yet. */
const WARM = 2;

interface LoadRequest {
  container: HTMLElement;
  priority: number;
  start: () => void;
}

const pending: LoadRequest[] = [];
let inFlight = 0;
let urgentInFlight = 0;

/** Pixels of gap between a container and the viewport; 0 while it is on screen. */
function viewportDistance(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  if (rect.bottom < 0) return -rect.bottom;
  if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
  return 0;
}

function pump() {
  // Speculative work stays parked while a visitor-initiated load is running.
  while (urgentInFlight === 0 && inFlight < MAX_IN_FLIGHT && pending.length > 0) {
    let best = 0;
    let bestDistance = viewportDistance(pending[0].container);
    for (let i = 1; i < pending.length; i++) {
      // Measured now rather than when queued: by the time a slot frees the page
      // has usually scrolled, and the nearest model has changed with it.
      const distance = viewportDistance(pending[i].container);
      const closer =
        pending[i].priority < pending[best].priority ||
        (pending[i].priority === pending[best].priority && distance < bestDistance);
      if (closer) {
        best = i;
        bestDistance = distance;
      }
    }
    const next = pending.splice(best, 1)[0];
    inFlight++;
    next.start();
  }
}

function enqueue(request: LoadRequest) {
  if (request.priority === URGENT) {
    // Somebody is watching a progress bar: admit it over the cap, and stop
    // feeding the queue until it lands so it has the connection to itself.
    urgentInFlight++;
    inFlight++;
    request.start();
    return;
  }
  pending.push(request);
  pump();
}

/** Hand the slot back. Called exactly once per admitted request. */
function release(priority: number) {
  inFlight--;
  if (priority === URGENT) urgentInFlight--;
  pump();
}

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** Data Saver, or a connection too slow to spend on models nobody asked for. */
function isFrugalConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return false;
  return Boolean(connection.saveData) || /2g/.test(connection.effectiveType ?? "");
}

/** Run once the page has finished loading and the main thread has a moment. */
function whenIdle(fn: () => void) {
  const schedule = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 4000 });
    else setTimeout(fn, 1500);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;


/**
 * Reparent the parts named by each axis under a pivot at that axis's centre of
 * rotation, so setting the pivot's rotation swings exactly the right subtree.
 *
 * Axes are built innermost-first (last declared = deepest) and pivots are skipped
 * when matching, so an outer axis never swallows an inner one by accident — the
 * `parent` field wires that nesting explicitly instead.
 */
function articulate(scene: Object3D, specs: AxisSpec[]): Map<string, Group> {
  // Descend past wrapper nodes (scene → unit-scale root → assembly) to the node
  // that actually holds the parts.
  let assembly = scene;
  while (assembly.children.length === 1 && assembly.children[0].children.length > 0) {
    assembly = assembly.children[0];
  }

  const pivots = new Map<string, Group>();

  for (const spec of [...specs].reverse()) {
    const include = spec.include.map(nameMatcher);
    const exclude = spec.exclude.map(nameMatcher);
    // Snapshot before attaching — attach() mutates assembly.children.
    const members = assembly.children.filter((child) => {
      if (child.userData.axisPivot) return false;
      const name = normalizeName(child.name);
      return include.some((re) => re.test(name)) && !exclude.some((re) => re.test(name));
    });
    if (members.length === 0) {
      console.warn(`Axis "${spec.id}" matched no parts.`);
      continue;
    }

    const pivot = new Group();
    pivot.name = `axis:${spec.id}`;
    pivot.userData.axisPivot = true;
    pivot.position.set(...spec.pivot);
    assembly.add(pivot);
    // attach() preserves each part's world transform while reparenting, which is
    // what makes this work on world-space CAD geometry with identity transforms.
    for (const member of members) pivot.attach(member);
    pivots.set(spec.id, pivot);
  }

  for (const spec of specs) {
    const pivot = pivots.get(spec.id);
    const parent = spec.parent ? pivots.get(spec.parent) : undefined;
    if (pivot && parent) parent.attach(pivot);
  }

  return pivots;
}

/** Handle returned by {@link createViewer}, for callers that manage a viewer's lifetime. */
export interface Viewer {
  /** Stop rendering and release the rAF loop. The model stays in memory. */
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export function createViewer(container: HTMLElement): Viewer | undefined {
  const src = container.dataset.modelSrc;
  if (!src || container.dataset.viewerInit) return;
  container.dataset.viewerInit = "1";

  // ?capture — poster-capture helper: tighter framing, no toolbar overlay.
  const captureMode = new URLSearchParams(location.search).has("capture");
  // data-interactive="false" — pure turntable (home page cards): the canvas
  // ignores the pointer so clicks fall through to the card link and the page
  // keeps scrolling normally.
  const interactive = container.dataset.interactive !== "false";

  const progressEl = container.querySelector<HTMLElement>("[data-viewer-progress]");
  const progressBar = container.querySelector<HTMLElement>("[data-viewer-progress-bar]");
  const axesEl = container.querySelector<HTMLElement>("[data-viewer-axes]");
  const posterEl = container.querySelector<HTMLElement>("[data-viewer-poster]");

  const showError = (message: string) => {
    if (!progressEl) return;
    progressEl.hidden = false;
    progressEl.setAttribute("role", "status");
    progressEl.textContent = message;
  };

  const axisSpecs: AxisSpec[] = container.dataset.axes
    ? JSON.parse(container.dataset.axes)
    : [];

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    showError("3D preview is unavailable in this browser.");
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.domElement.classList.add("absolute", "inset-0", "h-full", "w-full");
  renderer.domElement.setAttribute("aria-label", "Interactive 3D model");
  if (!interactive) renderer.domElement.style.pointerEvents = "none";

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const camera = new PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.01,
    100,
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Turntable spin until the visitor grabs the model (~15s per revolution).
  controls.autoRotate = !captureMode;
  controls.autoRotateSpeed = 4;

  // --- Render on demand: run the loop only while something is changing. ---
  let rafId = 0;
  let inFrame = false;
  let settled = 0;
  let inView = true;
  let suspended = false;
  let contextLost = false;
  let disposed = false;
  let lastTime = 0;

  // Idle joint demo: while the camera turntable is auto-rotating (i.e. nobody's
  // touched the model), sliders sweep their own range too, so articulation shows
  // itself without requiring a visitor to find and drag a slider. Any real slider
  // input holds this off for a few seconds, the same cooldown the turntable uses.
  const idleAxes: Array<{
    pivot: Group;
    range: [number, number];
    axisVector: Vector3;
    slider: HTMLInputElement;
    readout: HTMLElement | null;
    phase: number;
  }> = [];
  let idleHoldUntil = 0;

  function canRun(): boolean {
    return (
      !disposed &&
      !suspended &&
      !contextLost &&
      inView &&
      // Read this live instead of caching it: a cached copy is exactly the kind
      // of state that goes stale while the tab sits in the background.
      document.visibilityState === "visible"
    );
  }

  function frame(now: number) {
    rafId = 0;
    if (!canRun()) return;
    inFrame = true;
    try {
      // Clamp the delta. Returning from another tab, `now - lastTime` can be
      // minutes, which would snap the turntable through dozens of revolutions.
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 20) : 1 / 60;
      lastTime = now;
      const moved = controls.update(dt);
      if (controls.autoRotate && idleAxes.length > 0 && now > idleHoldUntil) {
        const t = now / 1000;
        for (const a of idleAxes) {
          const mid = (a.range[0] + a.range[1]) / 2;
          const amp = (a.range[1] - a.range[0]) / 2;
          const degrees = mid + amp * Math.sin(t * 0.6 + a.phase);
          a.pivot.quaternion.setFromAxisAngle(a.axisVector, (degrees * Math.PI) / 180);
          a.slider.value = String(degrees);
          if (a.readout) a.readout.textContent = `${Math.round(degrees)}°`;
        }
      }
      renderer.render(scene, camera);
      settled = moved ? 0 : settled + 1;
    } finally {
      inFrame = false;
    }
    // Two idle frames with nobody holding the pointer → nothing left to draw.
    if (settled > 2 && !pointerDown) return;
    rafId = requestAnimationFrame(frame);
  }

  function wake() {
    settled = 0;
    // Reached from inside controls.update()? The running frame reschedules
    // itself; scheduling here as well would double up the loop.
    if (inFrame || !canRun()) return;
    // Never trust an "already scheduled" flag — see the liveness contract at the
    // top of this file. Cancelling a stale id is free, and rescheduling
    // unconditionally is what makes the loop self-healing after a tab switch.
    if (rafId) cancelAnimationFrame(rafId);
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  let pointerDown = false;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  controls.addEventListener("start", () => {
    pointerDown = true;
    // Pause the turntable while the visitor is in control (a wheel-zoom over
    // the canvas fires this too) — it resumes shortly after they let go.
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    wake();
  });
  controls.addEventListener("end", () => {
    pointerDown = false;
    if (!captureMode) {
      resumeTimer = setTimeout(() => {
        controls.autoRotate = true;
        wake();
      }, 3000);
    }
    wake();
  });
  controls.addEventListener("change", wake);

  // Pause the spin (and all rendering) while the viewer is scrolled offscreen.
  // Take the *last* record, not the first: several can be delivered at once —
  // which is what happens on the first rendering update after the tab is
  // refocused — and the earlier ones describe a state the page has already left.
  const viewObserver = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    if (inView) wake();
    else stopLoop();
  });
  viewObserver.observe(container);

  const resizeObserver = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = container;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    wake();
  });
  resizeObserver.observe(container);

  // A hidden tab stops firing rAF entirely; this is what restarts the loop when
  // the visitor comes back — the fix for models sitting frozen after a tab switch.
  const onVisibility = () => {
    if (document.visibilityState === "visible") wake();
    else stopLoop();
  };
  document.addEventListener("visibilitychange", onVisibility);

  // Restoring from the bfcache (back button) leaves the loop stopped the same way.
  const onPageShow = () => wake();
  window.addEventListener("pageshow", onPageShow);

  // The GPU process can drop contexts while a tab is backgrounded. Three.js
  // reinitialises itself on restore; we only have to restart the loop.
  const onContextLost = (event: Event) => {
    // Opt in to the browser's context restoration path. Without preventing the
    // default action, webglcontextrestored may never be dispatched.
    event.preventDefault();
    contextLost = true;
    stopLoop();
  };
  const onContextRestored = () => {
    contextLost = false;
    wake();
  };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

  // --- Camera framing ---
  function frameModel(object: import("three").Object3D) {
    const box = new Box3().setFromObject(object);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.position
      .copy(center)
      .add(new Vector3(1, 0.6, 1).normalize().multiplyScalar(dist * (captureMode ? 1.05 : 1.15)));
    camera.near = maxDim / 100;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance = maxDim * 0.2;
    controls.maxDistance = dist * 6;
    controls.update();
  }

  // --- Load model ---
  // Deferred until the viewer is near the viewport. Constructing a viewer is
  // cheap; fetching its .glb is not, and the home page has one per project card
  // — starting them all at page load put several MB of models in flight at once,
  // so the one card actually on screen was left fighting the other six for
  // bandwidth. The poster holds the frame until its own model arrives.
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  let loadStarted = false;
  let request: LoadRequest | null = null;

  /**
   * Ask for this model at `priority`. Repeat calls only ever promote it: a
   * viewer sitting in the idle warm-up batch that then scrolls into the preload
   * band jumps the rest of that batch instead of waiting its turn behind it.
   */
  const requestLoad = (priority: number) => {
    if (loadStarted || disposed) return;
    if (request) {
      if (priority >= request.priority) return;
      const index = pending.indexOf(request);
      // Not in the queue means it is already running, and `loadStarted` above
      // has normally caught that first.
      if (index === -1) return;
      pending.splice(index, 1);
      request.priority = priority;
      enqueue(request);
      return;
    }
    request = { container, priority, start: () => startLoad(priority) };
    enqueue(request);
  };

  // An arrow rather than a declaration so `src` keeps the narrowing from the
  // guard at the top of this function.
  const startLoad = (priority: number) => {
    if (loadStarted || disposed) {
      release(priority);
      return;
    }
    loadStarted = true;
    loadObserver.disconnect();
    if (progressEl) progressEl.hidden = false;

    // GLTFLoader routes an exception thrown inside its onLoad callback to
    // onError, so both can run for a single request. The slot must come back
    // exactly once either way, or `inFlight` drifts and the cap stops capping.
    let released = false;
    const releaseSlot = () => {
      if (released) return;
      released = true;
      release(priority);
    };

    loader.load(
      src,
      (gltf) => {
        // Free the slot before any of the work below, so the next model starts
        // downloading while this one is being articulated and framed.
        releaseSlot();
        if (disposed) return;
        // STEP/CAD exports are usually Z-up; glTF is Y-up. `data-up="z"` stands them upright.
        if (container.dataset.up === "z") gltf.scene.rotation.x = -Math.PI / 2;
        scene.add(gltf.scene);

        if (axisSpecs.length > 0) {
          const pivots = articulate(gltf.scene, axisSpecs);
          axisSpecs.forEach((spec, index) => {
            const pivot = pivots.get(spec.id);
            const slider = container.querySelector<HTMLInputElement>(
              `[data-axis="${spec.id}"]`,
            );
            if (!pivot || !slider) return;
            const readout = container.querySelector<HTMLElement>(
              `[data-axis-value="${spec.id}"]`,
            );
            const axisVector = new Vector3(...spec.axis).normalize();
            const apply = () => {
              const degrees = Number(slider.value);
              pivot.quaternion.setFromAxisAngle(axisVector, (degrees * Math.PI) / 180);
              if (readout) readout.textContent = `${degrees}°`;
              wake();
            };
            slider.addEventListener("input", apply);
            // A real drag (native "input", never fired by the idle demo itself,
            // which sets .value directly) holds the demo off for a few seconds —
            // otherwise the very next idle-animated frame would fight the visitor
            // over the slider they're mid-drag on.
            slider.addEventListener("input", () => {
              idleHoldUntil = performance.now() + 3000;
            });
            apply();
            if (!captureMode) {
              idleAxes.push({
                pivot,
                range: spec.range,
                axisVector,
                slider,
                readout,
                phase: index * 1.7,
              });
            }
          });
          if (axesEl && !captureMode) axesEl.hidden = false;
        }

        frameModel(gltf.scene);
        if (progressEl) progressEl.hidden = true;
        // Draw once before the canvas is on screen. Appending it and letting the
        // rAF loop catch up would show an empty rectangle for a frame first,
        // which reads as a flicker at exactly the moment the model arrives.
        renderer.render(scene, camera);
        container.appendChild(renderer.domElement);
        revealCanvas();
        wake();
      },
      (event) => {
        if (progressBar && event.total > 0) {
          progressBar.style.width = `${Math.round((event.loaded / event.total) * 100)}%`;
        }
      },
      (error) => {
        releaseSlot();
        console.error("Failed to load model:", error);
        showError("Failed to load 3D model.");
      },
    );
  };

  /**
   * Cross-fade the model in over its poster instead of swapping them on a
   * single frame. The poster is a still of the same model from the same angle,
   * so a fade reads as the image sharpening into something you can grab rather
   * than as a page element being replaced.
   */
  function revealCanvas() {
    const canvas = renderer.domElement;
    if (!posterEl || prefersReducedMotion) {
      posterEl?.remove();
      return;
    }
    const poster = posterEl;
    const FADE_MS = 450;
    canvas.style.opacity = "0";
    canvas.style.transition = `opacity ${FADE_MS}ms ease`;
    poster.style.transition = `opacity ${FADE_MS}ms ease`;
    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
      poster.style.opacity = "0";
    });
    setTimeout(() => {
      poster.remove();
      canvas.style.transition = "";
      canvas.style.opacity = "";
    }, FADE_MS + 60);
  }

  // Deliberately separate from viewObserver above: that one gates *rendering*
  // and wants true visibility, while this wants a head start, so the model is
  // usually decoded and framed by the time the card is scrolled to.
  //
  // The band is a viewport and a half of runway rather than a flat 400px, which
  // at ordinary scroll speeds is a second or two of warning. It can afford to be
  // this greedy because the queue admits two downloads at a time and always
  // picks the nearest — a wider band changes what is *queued*, not what is in
  // flight, so an early request can never crowd out a closer one.
  const loadObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) requestLoad(NEAR);
    },
    { rootMargin: `${Math.round(Math.max(600, window.innerHeight * 1.5))}px 0px` },
  );

  // A manual viewer is a project overlay panel, built only once the visitor has
  // opened that project — there is nothing left to defer, and waiting for the
  // observer would just cost a frame before its model even starts downloading.
  if (container.dataset.viewerManual !== undefined) {
    requestLoad(URGENT);
  } else {
    loadObserver.observe(container);
    // Everything the visitor has not scrolled anywhere near yet still gets
    // fetched, just last and only once the page has gone quiet. Scrolling on to
    // a card whose model is already decoded is the whole point: the wait moves
    // off the critical path and into time that was idle anyway.
    if (!isFrugalConnection()) whenIdle(() => requestLoad(WARM));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopLoop();
    clearTimeout(resumeTimer);
    resizeObserver.disconnect();
    viewObserver.disconnect();
    loadObserver.disconnect();
    // Drop a queued-but-unstarted load, so a torn-down viewer cannot be handed
    // a slot ahead of one that is still on screen.
    if (request) {
      const index = pending.indexOf(request);
      if (index !== -1) pending.splice(index, 1);
      request = null;
    }
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
    controls.dispose();
    scene.environment?.dispose();
    scene.traverse((obj) => {
      const mesh = obj as import("three").Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
    delete container.dataset.viewerInit;
  }

  // Only tear down on a real unload. `pagehide` also fires when the page is
  // frozen into the bfcache, and disposing there left a dead viewer behind for
  // anyone who pressed the back button.
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) stopLoop();
    else dispose();
  });

  return {
    suspend() {
      suspended = true;
      stopLoop();
    },
    resume() {
      suspended = false;
      wake();
    },
    dispose,
  };
}
