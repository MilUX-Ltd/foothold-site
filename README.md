# Foothold site

The website for [Foothold](https://github.com/MilUX-Ltd/foothold), a free pack of markdown notes and AI skills for founders of small UK defence businesses. It will live at **foothold.milux.co.uk**.

The pack describes itself as a map: a defence layer (organisations, programmes, frameworks, portals, events, networks and clusters), a business layer (the pack's folders and skills, with what each skill reads and writes) and routes (jobs that take several skills in order). This site draws that map. This repository holds only the site; the pack stays the single source of truth.

**Status: early build (0.1.0, unreleased).** A home page, the map page (`/map/`) and the install page (`/install/`), built from the real data, with the tests, checks, pipeline and security headers every later change follows. The job routes on the map, the connector and analytics are later cards. Nothing is deployed yet.

## How it is built

A static Astro site, TypeScript, Vitest, and Playwright with axe, served by a Cloudflare Worker that serves static assets. The map pages run one small bundled script, and the install page a smaller one for its copy button, with no third-party code; every other page runs none. The map's layout is worked out when the site is built and shipped as a static file next to the page. The reasoning is in [`docs/adr/`](docs/adr/); the security thinking is in [`docs/security/threat-model.md`](docs/security/threat-model.md).

It was built with AI, using MilUX's agentic engineering method: decisions recorded first, tests written before code, and every change through a pipeline and human review. To know more, get in touch at contact@milux.co.uk.

## Run it locally

You need Node 22 or later (CI uses 24).

```bash
npm ci
npm run dev
```

`npm run dev` fetches the map file first, then starts Astro. The dev server sends the same strict security headers as production, which block the inline style and script a dev server adds, so the dev page can look unstyled. For a faithful view run `npm run build && npm run preview`.

Checks:

```bash
npm run lint
npm run typecheck
npm run test:unit
FOOTHOLD_DATA_SOURCE=fixture npm run build
npm run check:public      # after a build, so the built site is checked too
npm run test:e2e          # builds from the fixture and starts a preview server
```

The browser tests are in `tests/e2e/` and `tests/acceptance/`; the unit tests in `tests/unit/`. The build prints how long the map layout took, and the bundle-size check prints the compressed size of the script.

The end-to-end tests need a Playwright browser: `npx playwright install chromium`.

## Where the data comes from

The site reads one file, `data/foothold-map.json`, built and checked by the pack repository. `scripts/fetch-data.mjs` fetches it at build time from `https://raw.githubusercontent.com/MilUX-Ltd/foothold/<ref>/data/foothold-map.json`, then checks it against the schema in `src/lib/map-schema.mjs`.

| Setting | Meaning |
|---|---|
| `FOOTHOLD_DATA_REF` | The branch, tag or commit of the pack to read. Default `main`. |
| `FOOTHOLD_DATA_SOURCE=fixture` | Read `tests/fixtures/foothold-map.json` instead. No network. Tests and CI use this. |

A file that fails the check stops the build. The contract, and the rule for changing it, are in [`CONTEXT.md`](CONTEXT.md).

The install page offers the pack release named in `data/release.json`, a file committed here and changed only by a reviewed pull request. While it says there is no release yet, the page says so and the build fetches nothing for it. When it names a release, the build fetches the checksum list that release publishes and stops if it differs from the committed checksum.

| Setting | Meaning |
|---|---|
| `FOOTHOLD_RELEASE_SOURCE=fixture` | Read `tests/fixtures/release.json` and compare it with `tests/fixtures/release-SHA256SUMS.txt`. No network. The browser tests' second build uses this. |
| `FOOTHOLD_OUT_DIR=dist-release` | Build into, and preview from, `dist-release/` instead of `dist/`. Only the browser tests' second build uses this. |

`npm run test:e2e` starts two preview servers: the committed state on port 4341 and the fixture release on port 4342.

## Contributing

Read [`CLAUDE.md`](CLAUDE.md) first: one card at a time, tests first, work on a branch, pull request only. Report a security problem as set out in [`SECURITY.md`](SECURITY.md).

## Licence

CC BY-NC 4.0 for this repository. See [LICENSE](LICENSE). The pack itself is a separate repository with its own licence.
