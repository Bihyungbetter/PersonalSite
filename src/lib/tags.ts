/**
 * Deterministic tag → color chip classes: the same tag always gets the same
 * hue, on cards and project pages alike. Pure build-time helper, zero JS.
 */
const palettes = [
  "bg-teal-400/10 text-teal-300 ring-teal-400/25",
  "bg-violet-400/10 text-violet-300 ring-violet-400/25",
  "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  "bg-amber-400/10 text-amber-300 ring-amber-400/25",
  "bg-sky-400/10 text-sky-300 ring-sky-400/25",
  "bg-rose-400/10 text-rose-300 ring-rose-400/25",
];

export function tagClasses(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return `inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 ring-inset ${palettes[hash % palettes.length]}`;
}
