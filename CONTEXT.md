# Foothold site: domain language and the data contract

## Glossary

- **Pack**: Foothold itself, the free set of markdown notes and AI skills that a founder installs. It lives in the public repository `MilUX-Ltd/foothold` and is the single source of truth. The site is a view of it.
- **Map**: the pack described as data: nodes, edges and routes in one file, `data/foothold-map.json`, built and checked by the pack repository.
- **Defence layer**: the part of the map that describes the defence world: organisations, programmes, frameworks, portals, event series, networks and clusters, and the connections between them. Reference material, not the user's own business.
- **Business layer**: the part of the map that describes the pack's own structure: its folders and skills, and what each skill reads and writes. This is where a business puts itself on the map.
- **Node**: one thing on the map. Each has an `id`, a `layer` (`defence` or `business`), a `kind`, a `name` and a `path` in the pack, and sometimes more (see the contract below).
- **Kind**: the sort of node. Seen so far: `organisation`, `programme`, `framework`, `portal`, `event-series`, `network`, `cluster`, `example-business` (the pack's own worked example) in the defence layer; `folder`, `skill`, `route`, `vault` in the business layer. The site accepts any kind except `contact`.
- **Edge**: a named connection from one node to another, with a `type` and an `origin`. Every edge is one an author wrote; none is inferred.
- **Edge types**:
  - `parent`: a folder to the folder that contains it.
  - `in_folder`: a page to the folder it sits in.
  - `mentions`: a page that links to another in its text.
  - `customer`, `operator`, `service`: relationships a framework or programme states about the organisations and services it involves.
  - `reads`, `writes`: a skill to a folder it reads from or files into.
  - `step`: a route to a skill it uses.
- **Edge origin**: where the author wrote the edge: `field` (a frontmatter field), `path` (where the page sits), `body` (a link in the text), `skill` (a skill's declarations), `folder` (a folder's own record) or `route` (a route's steps).
- **Route**: a job that takes more than one skill, as an ordered list of steps. Routes are data in the pack; the site only draws them.
- **Step**: one entry in a route: the skill to use (`skill`, with `skill_id` pointing at its node) and a sentence saying what it does (`does`).
- **Landing and exploring**: the two states of the map. The home page opens in the landing state, with the headline over the map; `/map/` opens in the exploring state, with the list and the panels over the map. One component serves both.
- **Map page**: `/map/`, the pack drawn as one map with two regions, the defence layer on the left and the business layer on the right, joined by the edges that cross between them (pages filed in folders). The same nodes are listed in text on the page, grouped by kind, so the map is never the only way in.
- **Layout**: the position of every node on the map, settled at build time by a seeded force simulation (`src/lib/graph/layout.ts`) and shipped in `/map/graph.json`. The same map file gives the same positions on every build.
- **Path**: the shortest chain of edges between two chosen nodes, following edges in either direction. Not to be confused with a node's `path` field (where the page sits in the pack) or a **route** (a job the pack defines).
- **Connections**: a node's edges, grouped by type, with edges leaving the node kept apart from edges arriving at it.
- **Views**: the four ways the map page draws the pack, each placing things by what they are: the whole map (`map`, the default: the defence reference as a wheel around the Ministry of Defence, joined by bands to the business structure as a tree), who buys (`buyers`), how a job runs (`jobs`) and at a glance (`glance`). The free-form network (`network`) is a fifth, under "More". Drawn at build time; see `docs/adr/0008-four-views-drawn-at-build-time.md`.
- **Named connection**: an edge of any type but `mentions` and `in_folder`. Pointing at a page lights its named neighbours; at a glance shades each page by how many it has (five or more, at least one, none yet).
- **View state**: what the map page holds in its address so a view can be shared: `view` (the view shown; `map` is the default and is not written; the network in 3D is written `view=3d`, and the earlier `view=2d` and `view=3d` are read as the network, flat or in 3D; an unknown view falls back to the whole map), `node` (the selected node's id), `from` and `to` (the ends of a path), and `route` and `step` (the job open on the map and the step shown, counting from 1). Ids the map does not hold are ignored; an unknown route is dropped with its step, a step outside the route's range is dropped and the route kept, and a job is dropped when the address holds both ends of a path.
- **Job**: a route opened on the map from the Jobs panel or a "See it on the map" link. Shown whole, it lights the route, its skills and every folder they read or write. At a step, it lights that skill and its folders strongly, the defence pages filed in those folders softly, and the job's other steps faintly. A skill that reads the whole vault lights the vault mark and no folders for that read. When a step reads or writes the folder the example business is filed in, the example business is lit and named. Worked out in `src/lib/graph/routes.ts`.
- **Connector**: a read-only service, planned for a later card, that lets a person's own AI tool look things up in the map. It returns structured fields from the map file and never skill files or instructions. See `docs/adr/0005-a-read-only-connector-with-no-model-behind-it.md`.
- **Fixture**: a small hand-made map file in `tests/fixtures/` that tests and CI build from, so they never touch the network.

## The data contract

### Where the file comes from

`scripts/fetch-data.mjs` fetches `https://raw.githubusercontent.com/MilUX-Ltd/foothold/<ref>/data/foothold-map.json`, where `<ref>` is the environment variable `FOOTHOLD_DATA_REF` (default `main`). With `FOOTHOLD_DATA_SOURCE=fixture` it reads `tests/fixtures/foothold-map.json` and touches no network. It checks the file with `src/lib/map-schema.mjs` and writes the checked copy to `.foothold/foothold-map.json` (not committed), which the build reads. A file that fails the check stops the build with a clear message and a non-zero exit.

### Fields

The file has five top-level keys:

| Key | Meaning |
|---|---|
| `schema_version` | The version of this contract, as `major.minor.patch`. |
| `pack_version` | The version of the pack the file was built from. |
| `nodes` | The list of nodes. |
| `edges` | The list of edges. |
| `routes` | The list of routes. |

A node always has `id`, `layer`, `kind`, `name` and `path`. It may have `acronym`, `abbreviation`, `status`, `category`, `website`, `region`, `audience`, `description` and `guide` (text), and `service` (a list of text). Any other field is dropped when the file is checked, so the site only ever holds fields named here.

An edge has `from` and `to` (node ids), `type` and `origin`. A route has `id`, `name` and `steps`; each step has `skill`, `skill_id` and `does`.

### What the check refuses

- A malformed file, or one missing a top-level key or a required field.
- A node of kind `contact`.
- A node whose keys include `email`, `phone`, `linkedin`, `led_by`, `role`, `lawful_basis` or `organisation`.
- Two nodes with the same id.
- An edge whose `from` or `to` is not a node, or a route step whose `skill_id` is not a node.
- A `schema_version` whose major version is not 1.

### Version rule

The site accepts major version 1 of `schema_version`. Minor and patch changes to the file add things the site ignores or already allows. **A major change to `schema_version` must be met by a change to this file, to `src/lib/map-schema.mjs` and to the pages in the same release**, so the site and the pack never disagree about the shape of the data. Until then the build refuses the new file rather than guess.

### What the map page reads

The map page builds its list, legend and path choices from the checked file at build time. Its viewer fetches `/map/graph.json`, which the build writes from the same checked file: each node's `id`, `name`, `kind`, `layer` and position, and each edge's ends and `type`. No other field reaches the browser through it. Edge types the viewer has no style for are drawn with a plain dashed line and still listed. The routes reach the browser in the page itself, not in that file: the Jobs panel carries each route's id, name and steps (skill id, skill name and the pack's sentence) in an inert `<template>`, built from the same checked file.

### What the site shows

The site shows only what the pack contains. It shows no organisation, programme, skill or route that is not in the map file, no person, and no content written into the site that an install of the pack lacks, other than the pages that explain the site itself. Counts, names and step text on a page are drawn from the file at build time; nothing is typed in by hand.
