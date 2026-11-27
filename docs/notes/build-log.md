# Build log

## 2026-11-27: the walking skeleton

What was stood up, locally, before the first commit:

- The repository, started from the baseline of an existing MilUX site on the same stack, with the pinned versions kept and the lockfile regenerated cleanly. Map, hexagon, island and connector packages were left out: the skeleton needs none of them.
- The data path: `scripts/fetch-data.mjs` fetches the pack's map file from a ref (or reads a committed fixture), checks it against a zod schema shared with the page code, and writes the checked copy to a git-ignored folder. The schema refuses contact nodes, fields that can name a person, edges and route steps that point at nothing, and a `schema_version` outside major version 1.
- `src/lib/map.ts`: counts by kind, the fact strip, routes with steps resolved to skill names, and a node's edges grouped by type, all unit tested.
- One page and a 404 page, with a shared layout, a skip link, landmarks and one h1. The page shows the proposition, a fact strip drawn from the data, the pack's routes with their steps, and a plain note that this is an early build. It ships no JavaScript.
- Security headers with no inline script or style and no third-party host, served by the dev and preview servers as well as production.
- Checks: bundle size (fails on any script), public-terms guard, and a post-deploy check that is not wired to run yet.
- Tests: unit tests for the schema, the map functions, the headers and the guards; Playwright with axe at WCAG 2.2 AA against a fixture build, including a 375px width check and the 404 page.
- The pipeline, with every deploy step off until a repository variable is set; Dependabot; code owners; the agent guard.
- Repository documents, six decision records and this threat model.

What the real data taught us on the first run: the pack's map file holds `service` as a list, not text. The fixture had it wrong, and the schema, run against the real file, said so. The schema now matches the real file, and the fixture carries a list too.

Not done on purpose: the map, the connector, analytics, the custom domain and any deploy.
