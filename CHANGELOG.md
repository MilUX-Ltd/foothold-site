# Changelog

All notable changes to the Foothold site. Versions follow semantic versioning.

## [Unreleased]

### Added
- The walking skeleton, at version 0.1.0 (not yet released or deployed): one page built from the real map data, with the whole baseline in place so every later card follows the same path.
- `scripts/fetch-data.mjs` fetches `data/foothold-map.json` from the public pack repository (`FOOTHOLD_DATA_REF`, default `main`), or reads the committed fixture (`FOOTHOLD_DATA_SOURCE=fixture`), checks it against the schema in `src/lib/map-schema.mjs` and writes the checked copy to `.foothold/`. It refuses a malformed file, a contact node, a node with a field that can name a person, an edge or route step that points at a missing node, and a `schema_version` whose major version is not 1.
- `src/lib/map.ts`: counts by kind, the fact strip, routes with each step resolved to its skill name, and a node's edges grouped by type.
- The home page and a 404 page: the Foothold mark and name, the proposition, a fact strip drawn from the data, the pack's routes with their ordered steps, and a plain note that this is an early build. No client-side JavaScript.
- Security headers (`public/_headers`) with no inline script or style and no third-party host; the dev and preview servers send the same headers.
- Checks: bundle size (fails on any script), public-terms guard (decision-log ids, card references, vault paths, home paths, em-dashes), and a post-deploy header check that is not wired to run yet.
- Unit tests (schema, map functions, headers, guards) and Playwright tests with axe at WCAG 2.2 AA, including a 375px width check.
- The pipeline (`.github/workflows/ci.yml`) with every deploy step off until `DEPLOY_ENABLED` is set; Dependabot; code owners; the agent guard in `.claude/`.
- Repository documents: README, build context (`CLAUDE.md`), domain language and data contract (`CONTEXT.md`), lessons, six decision records and a threat model.
