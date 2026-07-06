/**
 * Lazy-loaded Three.js viewer for meshopt-compressed GLB models.
 *
 * Efficiency contract:
 * - This module (and three.js) is a separate chunk fetched only on pages with a viewer
 *   (see ModelViewer.astro); it is cached across all project pages.
 * - The rAF loop runs only while the model is auto-rotating **and on screen**, or while
 *   the camera is moving. Offscreen or after interaction settles: zero CPU/GPU.
 * - Pixel ratio capped at 2; renderer disposed on pagehide.
 */
import {
  ACESFilmicToneMapping,
  Box3,
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

export function createViewer(container: HTMLElement): void {
  const src = container.dataset.modelSrc;
  if (!src) return;

  // ?capture — poster-capture helper: tighter framing, no toolbar overlay.
  const captureMode = new URLSearchParams(location.search).has("capture");

  const progressEl = container.querySelector<HTMLElement>("[data-viewer-progress]");
  const progressBar = container.querySelector<HTMLElement>("[data-viewer-progress-bar]");
  const controlsEl = container.querySelector<HTMLElement>("[data-viewer-controls]");
  const posterEl = container.querySelector<HTMLElement>("[data-viewer-poster]");
  if (progressEl) progressEl.hidden = false;

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
  // Turntable spin until the visitor grabs the model.
  controls.autoRotate = !captureMode;
  controls.autoRotateSpeed = 1.2;

  // --- Render on demand: run the loop only while something is changing. ---
  let rafId = 0;
  let running = false;
  let settled = 0;
  let inView = true;
  function frame() {
    if (!inView) {
      running = false;
      return;
    }
    const moved = controls.update();
    renderer.render(scene, camera);
    settled = moved ? 0 : settled + 1;
    if (settled > 2 && !pointerDown) {
      running = false;
      return;
    }
    rafId = requestAnimationFrame(frame);
  }
  function wake() {
    settled = 0;
    if (!running && inView) {
      running = true;
      rafId = requestAnimationFrame(frame);
    }
  }
  let pointerDown = false;
  controls.addEventListener("start", () => {
    pointerDown = true;
    controls.autoRotate = false;
    wake();
  });
  controls.addEventListener("end", () => {
    pointerDown = false;
    wake();
  });
  controls.addEventListener("change", wake);

  // Pause the spin (and all rendering) while the viewer is scrolled offscreen.
  const viewObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) wake();
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

  // --- Camera framing ---
  const home = { position: new Vector3(), target: new Vector3() };
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
    home.position.copy(camera.position);
    home.target.copy(controls.target);
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
      frameModel(gltf.scene);
      posterEl?.remove();
      if (progressEl) progressEl.hidden = true;
      if (controlsEl && !captureMode) controlsEl.hidden = false;
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

  // --- Toolbar ---
  container
    .querySelector("[data-viewer-reset]")
    ?.addEventListener("click", () => {
      camera.position.copy(home.position);
      controls.target.copy(home.target);
      wake();
    });
  container
    .querySelector("[data-viewer-fullscreen]")
    ?.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else container.requestFullscreen?.();
    });

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    viewObserver.disconnect();
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
  });
}
