/**
 * Produce a 4 GB-capable copy of occt-import-js in .occt-4gb/.
 *
 * occt-import-js ships a wasm32 build whose memory section declares
 * max = 32768 pages (2 GB), with a matching `getHeapMax()` in the JS glue.
 * Large assemblies exhaust that ceiling while OCCT is still *reading* the
 * B-rep, after which every face fails to triangulate but ReadStepFile still
 * reports success. wasm32 can address 65536 pages (4 GB), and both page counts
 * LEB128-encode to three bytes, so raising the ceiling is an in-place one-byte
 * edit plus a constant swap in the glue. node_modules is left untouched.
 *
 * Caveat: the build was not compiled for 4 GB, so its internal size arithmetic
 * is only trustworthy so far — very fine deflections still fault with "memory
 * access out of bounds" a little past 3 GB. Always check the triangle count and
 * bounding box that step-to-glb.mjs prints rather than trusting `success`.
 *
 * Usage: npm run occt:4gb
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const SRC = join(root, "node_modules", "occt-import-js", "dist");
const DST = join(root, ".occt-4gb");
mkdirSync(DST, { recursive: true });

// --- 1. Patch the wasm memory section ---
const wasm = readFileSync(join(SRC, "occt-import-js.wasm"));
let p = 8; // skip the magic number and version
const leb = () => {
  let r = 0, s = 0, x;
  do { x = wasm[p++]; r |= (x & 0x7f) << s; s += 7; } while (x & 0x80);
  return r >>> 0;
};

let patched = false;
while (p < wasm.length) {
  const id = wasm[p++];
  const size = leb();
  const end = p + size;
  if (id === 5) {
    const count = leb();
    for (let i = 0; i < count; i++) {
      const flags = leb();
      leb(); // initial
      if (flags & 1) {
        const maxAt = p;
        const max = leb();
        const width = p - maxAt;
        if (max !== 32768) throw new Error(`unexpected max ${max} pages`);
        if (width !== 3) throw new Error(`max field is ${width} bytes, expected 3`);
        // 32768 -> 80 80 02 ; 65536 -> 80 80 04. Same width, so patch in place.
        wasm[maxAt + 2] = 0x04;
        patched = true;
        console.log(`wasm: memory max 32768 -> 65536 pages (2 GB -> 4 GB) at offset ${maxAt}`);
      }
    }
  }
  p = end;
}
if (!patched) throw new Error("no bounded memory section found");
writeFileSync(join(DST, "occt-import-js.wasm"), wasm);

// --- 2. Patch the JS ceiling ---
const glue = readFileSync(join(SRC, "occt-import-js.js"), "utf8");
const needle = "getHeapMax=()=>2147483648";
if (!glue.includes(needle)) throw new Error(`could not find "${needle}" in glue`);
const out = glue.replaceAll(needle, "getHeapMax=()=>4294967296");
console.log(`js: getHeapMax 2147483648 -> 4294967296 (${glue.split(needle).length - 1} site(s))`);
// .cjs, because this repo is type:module and the glue is a UMD/CommonJS bundle.
writeFileSync(join(DST, "occt-import-js.cjs"), out);

copyFileSync(join(SRC, "license.occt.txt"), join(DST, "license.occt.txt"));
copyFileSync(join(SRC, "license.occt-import-js.txt"), join(DST, "license.occt-import-js.txt"));
console.log(`\nWrote ${DST} — scripts/step-to-glb.mjs picks this up automatically.`);
