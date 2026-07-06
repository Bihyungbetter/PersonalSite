/**
 * Optimize a GLB for the web: dedup, weld, optional simplify, then
 * meshopt-compress (EXT_meshopt_compression). Writes to public/models/.
 *
 * Usage:
 *   node scripts/optimize-model.mjs input.glb [output.glb] [--simplify=0.5] [--error=0.001]
 *
 * --simplify=0.5 targets 50% of the original triangle count (visual error
 * bounded by --error, default 0.001 of the mesh extent). Omit to skip.
 */
import { mkdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

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
    "Usage: node scripts/optimize-model.mjs <input.glb> [output.glb] [--simplify=0.5] [--error=0.001]",
  );
  process.exit(1);
}
const output = args[1] ?? join("public", "models", basename(input));

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder,
  "meshopt.decoder": MeshoptDecoder,
});

const doc = await io.read(input);

const transforms = [dedup(), prune(), weld()];
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
transforms.push(meshopt({ encoder: MeshoptEncoder, level: "medium" }));

await doc.transform(...transforms);

mkdirSync(dirname(output), { recursive: true });
await io.write(output, doc);

const before = statSync(input).size / 1e6;
const after = statSync(output).size / 1e6;
console.log(`${input} (${before.toFixed(1)} MB) -> ${output} (${after.toFixed(2)} MB)`);
