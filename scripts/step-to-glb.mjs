/**
 * Convert a STEP assembly to a raw (uncompressed) GLB.
 *
 * Usage:
 *   node scripts/step-to-glb.mjs "input.step" [output.glb] [--deflection=0.1]
 *   node scripts/step-to-glb.mjs "input.step" [output.glb] --deflection-type=absolute --deflection=0.5
 *
 * Output defaults to assets/models-src/<input-name>.glb.
 * Run scripts/optimize-model.mjs afterwards to compress for the web.
 *
 * --deflection controls tessellation density (smaller = finer mesh = bigger file).
 * --deflection-type picks how it is interpreted:
 *   ratio    (default) — a fraction of the assembly bounding box; 0.05–0.5 is sensible.
 *   absolute — millimetres of chord error; 0.2–1.0 is sensible.
 *
 * If a run reports zero triangles, it is almost always the wasm heap rather than
 * the deflection: OCCT runs out of memory while reading the B-rep and then fails
 * every face silently. Run `npm run occt:4gb` once to double the ceiling, and
 * coarsen --deflection rather than refining it. See scripts/patch-occt-4gb.mjs.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { Document, NodeIO } from "@gltf-transform/core";

/**
 * occt-import-js ships a wasm32 build capped at a 2 GB heap, which large
 * assemblies exhaust while *reading* the B-rep — OCCT then returns success with
 * every face untriangulated. `npm run occt:4gb` writes a copy with the ceiling
 * raised to wasm32's real 4 GB limit; prefer it when present.
 */
const require = createRequire(import.meta.url);
const patchedDir = resolve(import.meta.dirname, "..", ".occt-4gb");
const usePatched = existsSync(join(patchedDir, "occt-import-js.wasm"));
const occtimportjs = usePatched
  ? require(join(patchedDir, "occt-import-js.cjs"))
  : require("occt-import-js");

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
const deflectionType = flags["deflection-type"] ?? "ratio";
if (deflectionType !== "ratio" && deflectionType !== "absolute") {
  console.error(`--deflection-type must be "ratio" or "absolute", got "${deflectionType}".`);
  process.exit(1);
}
const absolute = deflectionType === "absolute";
const deflection = Number(flags.deflection ?? (absolute ? 0.5 : 0.1));

console.log(`Reading ${input} ...`);
const stepBuffer = readFileSync(resolve(input));

console.log(`occt-import-js: ${usePatched ? "4 GB build (.occt-4gb)" : "stock 2 GB build"}`);
const occt = await occtimportjs(
  usePatched ? { locateFile: () => join(patchedDir, "occt-import-js.wasm") } : undefined,
);
console.log(
  `Tessellating (${deflectionType} deflection=${deflection}${absolute ? "mm" : ""}, this can take a while for large assemblies) ...`,
);
const result = occt.ReadStepFile(new Uint8Array(stepBuffer), {
  linearUnit: "millimeter",
  linearDeflectionType: absolute ? "absolute_value" : "bounding_box_ratio",
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
      // Tessellated B-reps are not reliably watertight: thin sheet parts lose their
      // edge walls when a face is smaller than the deflection, and OCCT's winding is
      // not always consistent across shells. Back-face culling then makes those parts
      // vanish when viewed from behind, which reads as the whole model being
      // transparent. CAD viewers render imported geometry two-sided for this reason.
      .setDoubleSided(true)
      .setMetallicFactor(0.2)
      .setRoughnessFactor(0.55);
    materialCache.set(key, mat);
  }
  return mat;
}

let triangles = 0;

/**
 * Node names become the handle the site uses to articulate an assembly (see the
 * `axes` frontmatter in src/content/projects/*.md), so they have to be stable and
 * unique. Onshape sometimes emits mangled non-ASCII (a STEP `\X2\FFFD\X0\` escape
 * for "™"/"ö"), and repeated instances share a name — suffix those with " #2", " #3".
 */
const nameCounts = new Map();
function uniqueName(raw) {
  const base =
    String(raw ?? "")
      .replace(/�/g, "")
      .replace(/\s+/g, " ")
      .trim() || "part";
  const n = (nameCounts.get(base) ?? 0) + 1;
  nameCounts.set(base, n);
  return n === 1 ? base : `${base} #${n}`;
}

function meshFor(index) {
  const mesh = result.meshes[index];
  const position = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(Float32Array.from(mesh.attributes.position.array))
    .setBuffer(gltfBuffer);
  const indexArray = mesh.index.array;
  const indices = doc
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
    .setIndices(indices)
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
  return doc.createMesh(mesh.name || "part").addPrimitive(prim);
}

/**
 * Mirror the STEP product structure into glTF nodes. occt hands back a tree of
 * { name, meshes: number[], children: [] }; glTF allows one mesh per node, so a
 * node carrying several meshes becomes a group with one child per mesh. A plain
 * single-mesh leaf collapses to one node to avoid a pointless nesting level.
 *
 * Geometry is already in world space, so every node stays at identity — the
 * hierarchy is for selection, not placement.
 */
function buildNode(occtNode) {
  const meshes = occtNode.meshes ?? [];
  const children = occtNode.children ?? [];

  if (meshes.length === 1 && children.length === 0) {
    return doc
      .createNode(uniqueName(occtNode.name || result.meshes[meshes[0]].name))
      .setMesh(meshFor(meshes[0]));
  }

  const node = doc.createNode(uniqueName(occtNode.name));
  for (const index of meshes) {
    node.addChild(
      doc.createNode(uniqueName(result.meshes[index].name)).setMesh(meshFor(index)),
    );
  }
  for (const child of children) node.addChild(buildNode(child));
  return node;
}

for (const index of result.root.meshes ?? []) {
  root.addChild(
    doc.createNode(uniqueName(result.meshes[index].name)).setMesh(meshFor(index)),
  );
}
for (const child of result.root.children ?? []) root.addChild(buildNode(child));

// OCCT reports success even when every face failed to triangulate, which yields
// empty accessors and a GLB that no loader can read. Fail loudly instead.
if (triangles === 0) {
  console.error(
    `Tessellation produced 0 triangles from ${result.meshes.length} parts — refusing to write ${output}.`,
  );
  console.error(
    usePatched
      ? "The 4 GB build is already in use, so the assembly needs a coarser mesh —\n" +
          `retry with a larger --deflection (e.g. ${(deflection * 2).toFixed(1)}).`
      : "OCCT most likely exhausted its 2 GB wasm heap mid-read. Run `npm run occt:4gb`\n" +
          "once to raise the ceiling, then retry this command.",
  );
  process.exit(1);
}

mkdirSync(dirname(output), { recursive: true });
const io = new NodeIO();
const glb = await io.writeBinary(doc);
writeFileSync(output, glb);

const mb = glb.byteLength / 1e6;
console.log(
  `Wrote ${output} — ${result.meshes.length} parts, ${Math.round(triangles).toLocaleString()} triangles, ${mb.toFixed(1)} MB (raw).`,
);

// Print the node tree: these names are what `axes[].include/exclude` match on,
// so they are meant to be copied out of here rather than retyped from the CAD.
console.log("\nAssembly tree (copy these names for `axes` in the project's .md):");
(function printTree(node, depth) {
  for (const child of node.listChildren()) {
    console.log(`${"  ".repeat(depth)}${child.getName()}`);
    printTree(child, depth + 1);
  }
})(root, 1);

console.log(`\nNext: node scripts/optimize-model.mjs "${output}"`);
