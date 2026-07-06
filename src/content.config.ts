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
  }),
});

export const collections = { projects };
