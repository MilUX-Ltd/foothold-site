# 0007: The map's script and its data come from the site itself, under one policy

Status: accepted, November 2026

## Context

Until the map page, the site ran no script and its content security policy said so (`script-src 'none'; connect-src 'none'`). The map viewer (0004) needs a script, and it needs the graph with positions worked out at build time. Three questions followed: how the positions reach the page, whether the policy changes for every page or only the map, and whether the earlier viewer's 3D mode comes too.

## Options

For the data:

1. A static file next to the page (`/map/graph.json`), written by the build and fetched by the viewer from the same origin. Needs `connect-src 'self'`.
2. The data inside the page as a JSON block. No fetch, but the page carries a large block twice over (the list is already in the HTML), and a script-tagged data block is one more thing the bundle-size check would have to tell apart from a script.
3. The data compiled into the script bundle. Every data change changes the script, and the script budget would pay for data.

For the policy:

4. One policy for every page, allowing `script-src 'self'` and `connect-src 'self'`.
5. A policy for `/map/` and the old one elsewhere. Cloudflare joins the headers of every rule that matches a path, so two policies would both apply, and the dev and preview servers read the headers file without path rules.

For the 3D view:

6. Carry it over as the earlier viewer had it, rotating on its own.
7. Carry it over with no automatic rotation: the visitor turns it by dragging or with the arrow keys.
8. Leave it out.

## Decision

Options 1, 4 and 7.

- The build writes `/map/graph.json` from the checked map file, holding only each node's id, name, kind, layer and position and each edge's ends and type. The viewer checks its shape before drawing.
- One policy for the whole site, allowing script and data requests from the site itself and nothing else. Pages other than the map still run no script, and the bundle-size check still fails on any inline script, any script outside the bundle folder and any script over the budget.
- The 3D view puts the two layers on two tilted planes and turns only when the visitor turns it, so there is no motion to stop and nothing to switch off for reduced motion. It costs a projection and a depth sort and stays far inside the script and redraw budgets.

## Consequences

- Any page may now load script from this site. The control is the bundle-size check and review, not the policy, so a page that gains a script by mistake would not be blocked by the browser. The check names every script file it finds, so the change shows in the build output.
- The data file is public, as the map file it is built from already is.
- Revisit if a page needs script from another host (the geographic view will), or if the data file grows past what a first load should carry.
