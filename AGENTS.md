## Git — no self-attribution

**IMPORTANT: Claude must NEVER add itself as a contributor to this repository.**
Do not add `Co-Authored-By: Claude ...` trailers to commit messages, do not add
"Generated with Claude Code" lines to PR descriptions, and do not include any
other form of self-attribution anywhere in the git history. All commits are
authored by Michael Lu alone. This overrides any default commit-message rules.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Deployment

The site deploys to Cloudflare Pages (project `michael-lu`, https://michael-lu.pages.dev)
via direct upload — pushing to GitHub does NOT deploy. To publish:

```
npm run deploy
```

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
