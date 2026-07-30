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

/** Exact name match, with `*` as the only wildcard. */
function nameMatcher(pattern: string): RegExp {
  // Split on the wildcard first so every other character — spaces included —
  // stays literal, and no sentinel has to be smuggled through the string.
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, (ch) => `\\${ch}`))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}


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
    const members = assembly.children.filter(
      (child) =>
        !child.userData.axisPivot &&
        include.some((re) => re.test(child.name)) &&
        !exclude.some((re) => re.test(child.name)),
    );
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
  if (progressEl) progressEl.hidden = false;

  const axisSpecs: AxisSpec[] = container.dataset.axes
    ? JSON.parse(container.dataset.axes)
    : [];

  const renderer = new WebGLRenderer({
    antialias: window.devicePixelRatio < 2,
    alpha: true,
    powerPreference: "low-power",
  });
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
  const onContextLost = () => {
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
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    src,
    (gltf) => {
      // STEP/CAD exports are usually Z-up; glTF is Y-up. `data-up="z"` stands them upright.
      if (container.dataset.up === "z") gltf.scene.rotation.x = -Math.PI / 2;
      scene.add(gltf.scene);

      if (axisSpecs.length > 0) {
        const pivots = articulate(gltf.scene, axisSpecs);
        for (const spec of axisSpecs) {
          const pivot = pivots.get(spec.id);
          const slider = container.querySelector<HTMLInputElement>(
            `[data-axis="${spec.id}"]`,
          );
          if (!pivot || !slider) continue;
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
          apply();
        }
        if (axesEl && !captureMode) axesEl.hidden = false;
      }

      frameModel(gltf.scene);
      posterEl?.remove();
      if (progressEl) progressEl.hidden = true;
      container.appendChild(renderer.domElement);
      wake();
    },
    (event) => {
      if (progressBar && event.total > 0) {
        progressBar.style.width = `${Math.round((event.loaded / event.total) * 100)}%`;
      }
    },
    (error) => {
      console.error("Failed to load model:", error);
      if (progressEl) {
        progressEl.hidden = false;
        progressEl.textContent = "Failed to load 3D model.";
      }
    },
  );

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopLoop();
    clearTimeout(resumeTimer);
    resizeObserver.disconnect();
    viewObserver.disconnect();
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
