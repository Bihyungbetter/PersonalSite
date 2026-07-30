/**
 * Optimize a GLB for the web: dedup, weld, optional simplify, then
 * meshopt-compress (EXT_meshopt_compression). Writes to public/models/.
 *
 * Usage:
 *   node scripts/optimize-model.mjs input.glb [output.glb] [--simplify=0.5] [--error=0.001]
 *
 * --simplify=0.5 targets 50% of the original triangle count (visual error
 * bounded by --error, default 0.001 of the mesh extent). Omit to skip.
 *
 * --level=medium|high controls meshopt's quantization. `high` drops position and
 * normal precision noticeably further; it is worth it for assemblies of a few
 * hundred parts, where per-primitive vertex data dominates the file size and
 * simplification alone stalls against the error bound.
 *
 * --join merges primitives that share a material before simplifying. A CAD tool's
 * own GLTF export (as opposed to this repo's STEP route) typically emits one
 * primitive per face per instance — tens of thousands of them for a real
 * assembly — and `simplify()` operates per primitive, so it can barely touch
 * geometry that fragmented. Joining first collapses that down to roughly one
 * primitive per material, which is both what actually lets simplification bite
 * and removes most of the per-primitive accessor overhead driving up file size.
 * Note it bakes every instance's transform into its own copy of the vertex data,
 * so a part reused 50 times becomes 50x the vertices before simplification — an
 * increase in raw triangle count from this step alone is expected, not a bug.
 *
 * `--join` also strips any primitive left with zero extent along an axis after
 * baking (typically a handful of triangles out of millions — degenerate
 * reference geometry, not visible parts). gltf-transform's quantization can't
 * build a decode volume for an exactly-flat bounding box: instead of erroring,
 * it silently emits a garbage scale for that primitive, which reads as a wildly
 * wrong bounding box for the whole scene once quantized (parts scattered meters
 * from where they belong). Pre-filtering those primitives out is the workaround
 * until gltf-transform guards against a degenerate quantization volume itself.
 */
import { mkdirSync, statSync } from "node:fs";
import { basename, dirname, join as joinPath } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, join, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

function pruneDegeneratePrimitives() {
  return (document) => {
    const v = [0, 0, 0];
    let removed = 0;
    for (const mesh of document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const position = prim.getAttribute("POSITION");
        if (!position) continue;
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < position.getCount(); i++) {
          position.getElement(i, v);
          for (let c = 0; c < 3; c++) {
            if (v[c] < min[c]) min[c] = v[c];
            if (v[c] > max[c]) max[c] = v[c];
          }
        }
        const extent = Math.min(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        if (extent < 1e-5) {
          mesh.removePrimitive(prim);
          removed++;
        }
      }
    }
    if (removed > 0) console.log(`join: dropped ${removed} degenerate (zero-extent) primitive(s)`);
  };
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.replace(/^--/, "").split("=")),
);

const input = args[0];
if (!input) {
  console.error(
    "Usage: node scripts/optimize-model.mjs <input.glb> [output.glb] [--simplify=0.5] [--error=0.001] [--join]",
  );
  process.exit(1);
}
const output = args[1] ?? joinPath("public", "models", basename(input));

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder,
  "meshopt.decoder": MeshoptDecoder,
});

const doc = await io.read(input);

const transforms = [dedup()];
if ("join" in flags) transforms.push(join(), pruneDegeneratePrimitives());
transforms.push(prune(), weld());
if (flags.simplify) {
  await MeshoptSimplifier.ready;
  transforms.push(
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: Number(flags.simplify),
      error: Number(flags.error ?? 0.001),
    }),
  );
}
const level = flags.level ?? "medium";
if (level !== "medium" && level !== "high") {
  console.error(`--level must be "medium" or "high", got "${level}".`);
  process.exit(1);
}
transforms.push(meshopt({ encoder: MeshoptEncoder, level }));

await doc.transform(...transforms);

mkdirSync(dirname(output), { recursive: true });
await io.write(output, doc);

const before = statSync(input).size / 1e6;
const after = statSync(output).size / 1e6;
console.log(`${input} (${before.toFixed(1)} MB) -> ${output} (${after.toFixed(2)} MB)`);
