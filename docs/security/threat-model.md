# Threat model

A short model for a small public site. It is seeded from the decisions in `docs/adr/` and is revised when a card changes what the site does. Version 0.2.0, 27 November 2026: revised for the map page, the site's first script.

## What the site is

A static, read-only website that draws a public pack of notes and AI skills as a map. It has no accounts, no forms, no cookies, no stored visitor data and no server code. One page, the map (`/map/`), runs one script: a module bundled at build time and served from the site itself, which fetches one data file from the site itself (`/map/graph.json`, the graph with positions settled at build time) and draws it on a canvas. Every other page runs no script. Its content comes from one data file built by the pack's own repository. All of it is public and unclassified. A later card adds a read-only connector (`docs/adr/0005-a-read-only-connector-with-no-model-behind-it.md`).

## Assets

| Asset | Why it matters |
|---|---|
| The accuracy of what the site shows | The site is a promise that it shows what the pack contains and nothing else. |
| The absence of personal data | The site must never name a person or hold a visitor's data. |
| The pipeline and its deploy credential | Whoever controls the deploy controls what every visitor receives. |
| The pack as instructions | Strangers' AI tools will follow the pack's instructions, and the site sends them there. |
| The company's reputation | A defence-adjacent public site that misbehaves costs trust. |

## Threats and controls

| Threat | What could happen | Control |
|---|---|---|
| Content that names people reaches the site | A contact page or a personal field in the data file is published. | The pack's own build refuses contact pages and fields that can name a person. This site repeats the check: the schema refuses a node of kind `contact` and any node carrying `email`, `phone`, `linkedin`, `led_by`, `role`, `lawful_basis` or `organisation`, and drops every field the contract does not name. Tests cover each refusal. The build fails closed. No named individual is written into the site's own pages. |
| A compromised or malformed data file | A bad file, from a wrong ref, a tampered source or a faulty pack release, changes what the site shows or breaks the build. | The file is fetched over HTTPS from one named repository, and the ref is limited to plain branch, tag or commit names. It is checked against the schema (shape, version, every edge and route step pointing at a real node) before any page uses it, and a failed check stops the build. Page text is escaped; pack text is never rendered as HTML. Changes to the pack reach the site only through the maintainer's merge there. |
| A replaced release zip | Someone who can write to the pack repository replaces a release's zip and its published checksum, and the site sends visitors to it. | The release the site offers, with its checksum, is recorded in this repository (`data/release.json`), changed only by a pull request the maintainer reviews. Every build that holds a release fetches the checksum the release publishes and stops if it differs, so a replaced zip stops the site rather than being advertised by it. The page shows the committed checksum, never the fetched one, and its prompt tells the visitor's AI tool to check it before opening the zip. The file's address must be the release download for its own version tag; a branch, another host or another repository is refused. |
| Injected script | A script runs in a visitor's browser, through the data, a dependency or a page change. | The content security policy allows script from this site only (`script-src 'self'`), no inline script or style, no `unsafe-inline` or `unsafe-eval`, and no third-party host, and is asserted in unit tests and after every deploy. The bundle-size check fails the build on any inline script, any script outside the bundle folder, any `javascript:` link or inline handler, and any total over the script budget. Journey tests fail if the map page makes a request to another host or the browser reports a policy violation. The viewer writes pack text into the page only as plain text (`textContent`), never as markup, and draws names on the canvas as text. |
| A tampered or malformed map data file in the browser | The file the viewer fetches is altered or damaged and the viewer draws nonsense or misbehaves. | It is built from the checked map file at build time and served from the same origin; the viewer checks its shape (every node with an id, a name, a kind, a layer and a finite position; every edge pointing at a node) before drawing, and on failure shows a plain message while the list, which is ordinary HTML built at build time, keeps working. Ids read from the address are kept only if the map holds them. |
| The viewer as a way to slow or crash a visitor's browser | A very large or hostile graph, or a crafted address, makes the page hang. | The graph comes only from the checked pack data, layout is done at build time, and the page draws on demand rather than in a loop. Route-finding is a breadth-first search over at most the map's own edges. The address holds only ids, which are matched against the map, and a view mode from a fixed list. |
| The future connector | Text returned to a stranger's AI is acted on as an instruction, the route is abused, or it returns more than it should. | Decided in advance (`docs/adr/0005-a-read-only-connector-with-no-model-behind-it.md`): read-only, no model, structured fields from the checked data file only, never skill files or agent instructions, input validated, rate limited per address with a counter that stores no personal data. Its own card carries its own threat note and tests before it ships. |
| A compromised dependency or action | Malicious code runs in the build or the pipeline. | Dependencies and actions are pinned exactly (actions by commit), the lockfile is regenerated cleanly, an update tool proposes changes for review, and the repository's agent guard refuses unverified installs. |
| A leaked deploy credential | Someone else deploys to the site. | The credential lives only in the pipeline's secret store and is read only by the gated deploy steps. Secret scanning and push protection are on. Deploys happen only from the pipeline, never by hand, and are off until deliberately switched on. |
| A change to the pipeline or the guard slips through | Checks are weakened without review. | Code owners cover the pipeline, the guard, the acceptance tests and the build context; main is protected and changes go through pull requests. |

## Residual risk

- The site trusts the pack's data after the schema check. A wrong fact in the pack is shown as written. The pack's review and the maintainer's merge are the control.
- The schema cannot tell whether a free-text field, such as a skill's one-line description, contains a name. The pack's build and review hold that line, and this site never renders such text as markup.
- Hosting is a third party. The site is plain static files and would serve from any static host.

## Review

Revisit this model when a card adds script beyond the map viewer, a server route, a third-party host, analytics, or any input from a visitor. The address the map page reads (selected node, path ends, view mode) is the only visitor input so far, and it never leaves the browser.
