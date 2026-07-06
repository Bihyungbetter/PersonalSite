import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  href: string;
  title: string;
  summary: string;
  tags: string[];
  poster?: string;
  hasModel?: boolean;
}

// Rendered statically by Astro at build time — never hydrated, ships no JS.
export function ProjectCard({ href, title, summary, tags, poster, hasModel }: Props) {
  return (
    <a href={href} className="group block h-full outline-none">
      <Card className="h-full gap-3 transition-all group-hover:ring-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        {poster ? (
          <img
            src={poster}
            alt={`${title} preview`}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex aspect-[16/10] w-full items-center justify-center bg-[radial-gradient(ellipse_at_top,--theme(--color-muted/60%),transparent_70%)] [background-size:100%,24px_24px] [background-image:radial-gradient(ellipse_at_top,--theme(--color-muted/60%),transparent_70%),linear-gradient(to_right,--theme(--color-border/40%)_1px,transparent_1px),linear-gradient(to_bottom,--theme(--color-border/40%)_1px,transparent_1px)]"
          >
            <span className="font-mono text-3xl text-muted-foreground/50">
              {title.slice(0, 1)}
            </span>
          </div>
        )}
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {title}
            {hasModel && (
              <Badge variant="outline" className="font-mono text-[10px] tracking-wide">
                3D
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="line-clamp-2">{summary}</CardDescription>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[11px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>
      </Card>
    </a>
  );
}
