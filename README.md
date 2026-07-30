# Personal Site

Portfolio for CAD and hardware projects with interactive 3D viewers.
Built with [Astro](https://astro.build), [shadcn/ui](https://ui.shadcn.com) (Tailwind v4 + React,
statically rendered), and a lazy-loaded vanilla [Three.js](https://threejs.org) viewer.

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Dev server at `localhost:4321` |
| `npm run build` | Production build to `./dist/` |
| `npm run preview` | Preview the production build |
| `npm run check` | Type-check `.astro`/`.ts` files |
| `npm run convert -- "file.step"` | Tessellate a STEP file to a raw GLB (`assets/models-src/`) |
| `npm run optimize -- file.glb` | Compress a GLB for the web (`public/models/`) |
| `npm run occt:4gb` | One-off: give the STEP tessellator a 4 GB heap (see below) |

## Adding a project

1. **Export the model.**
   - **Onshape:** right-click the Part Studio / Assembly tab → *Export* → format **GLTF** (binary) — or **STEP** and use the convert script.
     Prefer GLTF directly for large assemblies (roughly 5000+ faces): OCCT (the STEP
     route's tessellator, see step 2) can silently fail to triangulate a flat face
     that has small features on it — a plate with a few lightening holes comes back
     missing most of its surface, leaving only the holes' own walls, which reads as
     the model being "see-through" — and there is no deflection setting that reliably
     avoids it once a compound gets this large. Onshape's own exporter doesn't hit
     this. Its GLTF export is already in meters, but — despite the glTF spec calling
     for Y-up — still keeps Onshape's native Z-up orientation, so `up: z` is still
     needed in the project's frontmatter, the same as the STEP route.
   - **Fusion 360:** *File → Export* → **STEP**, then convert locally (see below). (Fusion's mesh export also works: export **OBJ/GLB** where available.)
2. **Convert (STEP only)** — tessellates with OpenCascade (WASM), preserving part colors:
   ```sh
   npm run convert -- "Master Assembly.step"                 # -> assets/models-src/master-assembly.glb
   npm run convert -- "file.step" out.glb --deflection=0.05  # finer mesh (default 0.1)
   ```
   **Large assemblies (roughly 5000+ faces):** `occt-import-js` is a wasm32 build with
   a 2 GB heap, and OCCT exhausts it while *reading* the B-rep — after which it reports
   success but silently triangulates nothing. Run `npm run occt:4gb` once; the convert
   script picks the patched build up automatically. Then use absolute deflection and
   coarsen rather than refine, because the patched build still faults a little past 3 GB:
   ```sh
   npm run occt:4gb
   npm run convert -- "Full Robot.step" --deflection-type=absolute --deflection=3.0
   ```
3. **Optimize for the web** — dedup/weld + meshopt compression (typically 3–4× smaller):
   ```sh
   npm run optimize -- assets/models-src/master-assembly.glb public/models/my-project.glb
   npm run optimize -- in.glb out.glb --simplify=0.5         # optionally halve triangle count
   npm run optimize -- in.glb out.glb --simplify=0.35 --error=0.005 --level=high  # large assemblies
   ```
   Aim for ≤ 2–3 MB per model.

   **A CAD tool's own GLTF export needs `--join` first.** Unlike this repo's STEP
   route (which emits one primitive per part), Onshape's exporter emits one
   primitive per face per instance — tens of thousands for a real assembly — and
   `simplify()` operates per primitive, so it can barely touch geometry that
   fragmented; the file stays 30–40 MB regardless of `--simplify`. `--join` merges
   same-material primitives first, which is what actually lets simplification and
   quantization bite:
   ```sh
   npm run optimize -- "Full Robot.gltf" public/models/my-project.glb --join --simplify=0.025 --error=0.005 --level=high
   ```
   `--join` bakes every instance's transform into its own copy of the vertex data
   (a part reused 50 times becomes 50x the vertices — expect the pre-simplify
   triangle count to jump, that's normal), and drops any primitive left with zero
   extent along an axis afterward (harmless reference geometry that breaks
   quantization otherwise — see the comment in `optimize-model.mjs` if a model comes
   out of `--join` with parts scattered far from where they belong; that's the
   signature of hitting this bug on a primitive the built-in filter didn't catch).

   A several-hundred-part assembly will not get to 2–3 MB without `--join` — most of
   the file is then per-part vertex data that neither simplification nor compression
   can remove — so `--level=high` and `--join` are the levers that still pay (the FTC
   robot, 816 parts from a native GLTF export, lands at 2.8 MB).

   Keep `--error` tight (≤ 0.005). It is a fraction of each part's own extent, so on a
   400 mm plate `--error=0.02` is an 8 mm budget — several times the plate's thickness,
   and the simplifier will happily collapse it. Check the result with a per-part
   triangle count: healthy output sits at the `--simplify` ratio uniformly, whereas
   parts pushed well below it are being deformed by the error bound, not decimated.
4. **Write the entry:** add `src/content/projects/my-project.md` with frontmatter
   (`title`, `summary`, `date`, `tags`, `tools`, `model: /models/my-project.glb`,
   optional `poster`, `specs`, `links`) and a markdown writeup. The page is generated
   automatically at `/projects/my-project/`.
5. **Optional poster:** open the project page with `?capture` appended (tighter framing,
   no toolbar), screenshot the viewer, save as WebP to `public/posters/`, and set
   `poster: /posters/my-project.webp`. The poster paints instantly before the 3D viewer
   loads; without one, a placeholder grid is shown.

## Making an assembly movable

CAD mates do not survive export. glTF has no concept of a constraint at all, and
STEP does not carry one in practice either — Onshape and SolidWorks both write the
*solved* geometry, so a part's pose comes through but the rule that put it there does
not. Joints are therefore declared in the project's frontmatter and rebuilt in the
viewer, where they show up as sliders.

`npm run convert` preserves the STEP assembly tree and prints it when it finishes.
Those printed names are what the config matches on — copy them from there rather than
retyping them from the CAD, since repeated instances get a ` #2`, ` #3` suffix to keep
them unique:

```yaml
axes:
  - id: u
    label: U · cradle tilt
    pivot: [0, 0.51, 84.19]   # a point on the axis, in CAD millimetres
    axis: [1, 0, 0]           # its direction
    range: [-90, 90]          # slider limits in degrees
    include: ["*"]            # everything...
    exclude: [Y-Gantry]       # ...except the fixed frame
  - id: v
    label: V · bed rotation
    parent: u                 # rides on the u axis
    pivot: [-5.19, 1.99, 45.71]
    axis: [0, 0, 1]
    include: ["V-Axis Bed <1>"]
```

Matching is exact, with `*` as the only wildcard. Declare axes outermost-first; a
`parent` nests one joint inside another so the child is carried by the parent's motion.
To find a pivot, look at the part that defines the joint — a shaft or bearing bore —
and read its centre off the part list the convert script prints.

`src/content/projects/pentos.md` is the worked example: two rotary axes on a 5-axis
printer, driven by the trunnion bearing centres.

## Personal info

Edit `src/lib/site.ts` (name, role, tagline, email, GitHub, resume link).

## How the 3D viewer stays fast

- Pages are fully static; no JavaScript ships on the index page at all.
- On project pages the viewer is two-stage: a poster/placeholder renders instantly,
  and Three.js is only fetched on tap — or automatically on fast connections when the
  viewer scrolls into view. The chunk is cached across all project pages.
- The viewer renders on demand: zero CPU/GPU while you're not interacting.
- Models use `EXT_meshopt_compression`; `public/_headers` gives them immutable caching.

## Deploying (Cloudflare Pages)

Create a Pages project pointed at this repo with:

- **Build command:** `npm run build`
- **Build output directory:** `dist`

`public/_headers` is picked up automatically for CDN cache rules.

## shadcn MCP server

`.mcp.json` registers the shadcn MCP server for Claude Code — restart a Claude Code
session in this directory and approve it, then components can be browsed/added
conversationally (or use `npx shadcn@latest add <component>`).
