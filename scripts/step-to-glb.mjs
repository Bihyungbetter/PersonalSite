/**
 * Convert a STEP assembly to a raw (uncompressed) GLB.
 *
 * Usage:
 *   node scripts/step-to-glb.mjs "input.step" [output.glb] [--deflection=0.1]
 *
 * Output defaults to assets/models-src/<input-name>.glb.
 * Run scripts/optimize-model.mjs afterwards to compress for the web.
 *
 * --deflection controls tessellation density as a ratio of the model's
 * bounding box (smaller = finer mesh = bigger file). 0.05–0.5 is sensible.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import occtimportjs from "occt-import-js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.replace(/^--/, "").split("=")),
);

const input = args[0];
if (!input) {
  console.error("Usage: node scripts/step-to-glb.mjs <input.step> [output.glb] [--deflection=0.1]");
  process.exit(1);
}

const slug = basename(input)
  .replace(/\.(step|stp)$/i, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");
const output = args[1] ?? join("assets", "models-src", `${slug}.glb`);
const deflection = Number(flags.deflection ?? 0.1);

console.log(`Reading ${input} ...`);
const stepBuffer = readFileSync(resolve(input));

const occt = await occtimportjs();
console.log(`Tessellating (deflection=${deflection}, this can take a while for large assemblies) ...`);
const result = occt.ReadStepFile(new Uint8Array(stepBuffer), {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: deflection,
  angularDeflection: 0.5,
});

if (!result.success || result.meshes.length === 0) {
  console.error("STEP import failed or produced no meshes.");
  process.exit(1);
}

console.log(`Tessellated ${result.meshes.length} meshes. Building GLB ...`);

const doc = new Document();
const gltfBuffer = doc.createBuffer();
const scene = doc.createScene("scene");

// STEP files are almost always millimeters; glTF units are meters.
const root = doc.createNode("root").setScale([0.001, 0.001, 0.001]);
scene.addChild(root);

const DEFAULT_COLOR = [0.62, 0.64, 0.67];
const materialCache = new Map();
function materialFor(color) {
  const rgb = color && color.length === 3 ? color : DEFAULT_COLOR;
  const key = rgb.map((c) => c.toFixed(3)).join(",");
  let mat = materialCache.get(key);
  if (!mat) {
    mat = doc
      .createMaterial(`mat-${materialCache.size}`)
      .setBaseColorFactor([rgb[0], rgb[1], rgb[2], 1])
      .setMetallicFactor(0.2)
      .setRoughnessFactor(0.55);
    materialCache.set(key, mat);
  }
  return mat;
}

let triangles = 0;
for (const mesh of result.meshes) {
  const position = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(Float32Array.from(mesh.attributes.position.array))
    .setBuffer(gltfBuffer);
  const indexArray = mesh.index.array;
  const index = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(
      position.getCount() > 65535
        ? Uint32Array.from(indexArray)
        : Uint16Array.from(indexArray),
    )
    .setBuffer(gltfBuffer);

  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setIndices(index)
    .setMaterial(materialFor(mesh.color));

  if (mesh.attributes.normal) {
    prim.setAttribute(
      "NORMAL",
      doc
        .createAccessor()
        .setType("VEC3")
        .setArray(Float32Array.from(mesh.attributes.normal.array))
        .setBuffer(gltfBuffer),
    );
  }

  triangles += indexArray.length / 3;
  const gltfMesh = doc.createMesh(mesh.name || "part").addPrimitive(prim);
  root.addChild(doc.createNode(mesh.name || "part").setMesh(gltfMesh));
}

mkdirSync(dirname(output), { recursive: true });
const io = new NodeIO();
const glb = await io.writeBinary(doc);
writeFileSync(output, glb);

const mb = glb.byteLength / 1e6;
console.log(
  `Wrote ${output} — ${result.meshes.length} parts, ${Math.round(triangles).toLocaleString()} triangles, ${mb.toFixed(1)} MB (raw).`,
);
console.log(`Next: node scripts/optimize-model.mjs "${output}"`);
