# Changelog

All notable changes to the Foothold site. Versions follow semantic versioning.

## [Unreleased]

### Added
- The map page, `/map/`: the pack drawn as one map with two regions, the defence reference and the business structure, joined by the edges that cross between them. Pan, zoom, hover and select on a canvas; layers told apart by shape and edge types by dash pattern and weight, not colour alone; a flat view by default and a 3D view that tilts the two layers apart (no automatic rotation). Beside it, in ordinary HTML built at build time: a searchable list of every node grouped by kind, a panel that lists the selected node's connections by type and direction, controls to find the shortest path between two nodes with the steps listed in text, and a live region that announces selection and path results. The map and the list drive each other; everything works by keyboard; nothing animates when reduced motion is asked for. The selected node, the path ends and the view mode are held in the address.
- `src/lib/graph/`: pure modules for the graph model, the build-time layout (seeded, sorted, deterministic), route-finding, connection grouping, the address state, the viewer's data file and the drawing styles, each unit tested. The layout is settled at build time and written to `/map/graph.json`, which the viewer fetches from the site itself.
- A link to the map in the site navigation and one line on the home page pointing to it.
- Tests: unit tests for the model, layout (including a real-size timing run), route-finding, connections, address state and data file; browser tests for the map page covering the list, keyboard selection, restoring from the address, paths, accessibility in three states, reduced motion, requests and the security policy, the redraw time at the real data size, the script budget and the earlier product's name.

### Changed
- The content security policy now allows script and data requests from the site itself (`script-src 'self'; connect-src 'self'`) and still nothing inline and no other host.
- The bundle-size check now allows bundled module scripts from `/_astro/`, fails on any inline script, script from anywhere else, `javascript:` link or inline handler, and holds all script to a 300 KB compressed budget.
- The fixture gains the pack's vault node, which has no edges, so the tests can ask for a path that does not exist.
- The walking skeleton, at version 0.1.0 (not yet released or deployed): one page built from the real map data, with the whole baseline in place so every later card follows the same path.
- `scripts/fetch-data.mjs` fetches `data/foothold-map.json` from the public pack repository (`FOOTHOLD_DATA_REF`, default `main`), or reads the committed fixture (`FOOTHOLD_DATA_SOURCE=fixture`), checks it against the schema in `src/lib/map-schema.mjs` and writes the checked copy to `.foothold/`. It refuses a malformed file, a contact node, a node with a field that can name a person, an edge or route step that points at a missing node, and a `schema_version` whose major version is not 1.
- `src/lib/map.ts`: counts by kind, the fact strip, routes with each step resolved to its skill name, and a node's edges grouped by type.
- The home page and a 404 page: the Foothold mark and name, the proposition, a fact strip drawn from the data, the pack's routes with their ordered steps, and a plain note that this is an early build. No client-side JavaScript.
- Security headers (`public/_headers`) with no inline script or style and no third-party host; the dev and preview servers send the same headers.
- Checks: bundle size (fails on any script), public-terms guard (decision-log ids, card references, vault paths, home paths, em-dashes), and a post-deploy header check that is not wired to run yet.
- Unit tests (schema, map functions, headers, guards) and Playwright tests with axe at WCAG 2.2 AA, including a 375px width check.
- The pipeline (`.github/workflows/ci.yml`) with every deploy step off until `DEPLOY_ENABLED` is set; Dependabot; code owners; the agent guard in `.claude/`.
- Repository documents: README, build context (`CLAUDE.md`), domain language and data contract (`CONTEXT.md`), lessons, six decision records and a threat model.
