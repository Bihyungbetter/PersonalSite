import { defineCollection } from "astro:content";
import { z } from "astro:schema";
import { glob } from "astro/loaders";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    // CAD/design tools used, e.g. ["Onshape", "Fusion 360", "KiCad"]
    tools: z.array(z.string()).default([]),
    // Path under /public to a meshopt-compressed GLB, e.g. "/models/gearbox.glb"
    model: z.string().optional(),
    // CAD exports are usually Z-up; glTF is Y-up. "z" stands the model upright.
    up: z.enum(["y", "z"]).default("y"),
    // Path under /public to a WebP poster shown before the viewer loads
    poster: z.string().optional(),
    featured: z.boolean().default(false),
    links: z
      .array(z.object({ label: z.string(), url: z.string().url() }))
      .default([]),
    // Key facts shown beside the viewer, e.g. [{ label: "Mass", value: "412 g" }]
    specs: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .default([]),
    /**
     * Movable joints, exposed as sliders under the viewer.
     *
     * CAD mates do not survive export — neither STEP nor glTF carries them — so
     * articulation is declared here instead. `include`/`exclude` match the node
     * names printed by `npm run convert` (exact match; `*` wildcards allowed).
     * `pivot` and `axis` are in the model's own CAD coordinates (millimetres,
     * pre-scale), which is what the convert script's part centres report.
     */
    axes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          pivot: z.tuple([z.number(), z.number(), z.number()]),
          axis: z.tuple([z.number(), z.number(), z.number()]),
          // Slider limits in degrees — a display range, not a machine limit.
          range: z.tuple([z.number(), z.number()]).default([-180, 180]),
          start: z.number().default(0),
          // id of another axis this one rides on (e.g. a bed carried by a tilt).
          parent: z.string().optional(),
          include: z.array(z.string()).default(["*"]),
          exclude: z.array(z.string()).default([]),
        }),
      )
      .default([]),
  }),
});

export const collections = { projects };
