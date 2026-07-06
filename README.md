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

## Adding a project

1. **Export the model.**
   - **Onshape:** right-click the Part Studio / Assembly tab → *Export* → format **GLTF** (binary) — or **STEP** and use the convert script.
   - **Fusion 360:** *File → Export* → **STEP**, then convert locally (see below). (Fusion's mesh export also works: export **OBJ/GLB** where available.)
2. **Convert (STEP only)** — tessellates with OpenCascade (WASM), preserving part colors:
   ```sh
   npm run convert -- "Master Assembly.step"                 # -> assets/models-src/master-assembly.glb
   npm run convert -- "file.step" out.glb --deflection=0.05  # finer mesh (default 0.1)
   ```
3. **Optimize for the web** — dedup/weld + meshopt compression (typically 3–4× smaller):
   ```sh
   npm run optimize -- assets/models-src/master-assembly.glb public/models/my-project.glb
   npm run optimize -- in.glb out.glb --simplify=0.5         # optionally halve triangle count
   ```
   Aim for ≤ 2–3 MB per model.
4. **Write the entry:** add `src/content/projects/my-project.md` with frontmatter
   (`title`, `summary`, `date`, `tags`, `tools`, `model: /models/my-project.glb`,
   optional `poster`, `specs`, `links`) and a markdown writeup. The page is generated
   automatically at `/projects/my-project/`.
5. **Optional poster:** open the project page with `?capture` appended (tighter framing,
   no toolbar), screenshot the viewer, save as WebP to `public/posters/`, and set
   `poster: /posters/my-project.webp`. The poster paints instantly before the 3D viewer
   loads; without one, a placeholder grid is shown.

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
