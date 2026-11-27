# Threat model

A short model for a small public site. It is seeded from the decisions in `docs/adr/` and is revised when a card changes what the site does. Version 0.1.0, 27 November 2026.

## What the site is

A static, read-only website that draws a public pack of notes and AI skills as a map. It has no accounts, no forms, no cookies, no stored visitor data and, at this version, no client-side script and no server code. Its content comes from one data file built by the pack's own repository. All of it is public and unclassified. A later card adds a read-only connector (`docs/adr/0005-a-read-only-connector-with-no-model-behind-it.md`).

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
| Injected script | A script runs in a visitor's browser, through the data, a dependency or a page change. | The content security policy allows no script at all, no inline style and no third-party host, and is asserted in unit tests and after every deploy. The bundle-size check fails the build if any script file, tag, `javascript:` link or inline handler appears. A journey test fails if the page loads any script or any request to another host. |
| The future connector | Text returned to a stranger's AI is acted on as an instruction, the route is abused, or it returns more than it should. | Decided in advance (`docs/adr/0005-a-read-only-connector-with-no-model-behind-it.md`): read-only, no model, structured fields from the checked data file only, never skill files or agent instructions, input validated, rate limited per address with a counter that stores no personal data. Its own card carries its own threat note and tests before it ships. |
| A compromised dependency or action | Malicious code runs in the build or the pipeline. | Dependencies and actions are pinned exactly (actions by commit), the lockfile is regenerated cleanly, an update tool proposes changes for review, and the repository's agent guard refuses unverified installs. |
| A leaked deploy credential | Someone else deploys to the site. | The credential lives only in the pipeline's secret store and is read only by the gated deploy steps. Secret scanning and push protection are on. Deploys happen only from the pipeline, never by hand, and are off until deliberately switched on. |
| A change to the pipeline or the guard slips through | Checks are weakened without review. | Code owners cover the pipeline, the guard, the acceptance tests and the build context; main is protected and changes go through pull requests. |

## Residual risk

- The site trusts the pack's data after the schema check. A wrong fact in the pack is shown as written. The pack's review and the maintainer's merge are the control.
- The schema cannot tell whether a free-text field, such as a skill's one-line description, contains a name. The pack's build and review hold that line, and this site never renders such text as markup.
- Hosting is a third party. The site is plain static files and would serve from any static host.

## Review

Revisit this model when a card adds script, a server route, a third-party host, analytics, or any input from a visitor.
