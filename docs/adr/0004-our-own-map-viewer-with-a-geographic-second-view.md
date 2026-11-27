# 0004: The map is drawn by our own viewer, with a geographic second view

Status: accepted, November 2026

## Context

The main view is one map with two layers, the defence reference and the business structure, with jobs shown as routes across both. The data is a graph of several hundred nodes, not a set of points on the ground, so the map stack used for geographic data on Tally does not answer the main view.

A second view was added: the pack names real places, such as a training centre or a laboratory, and those should be visible on a geographic map. The graph stays primary and the geographic map is secondary.

A previous demonstration holds a viewer that its own review called the valuable part: one hand-written file with no dependencies that draws a force-directed graph in two and three dimensions, with guided tours, route-finding and a keyboard and screen-reader path. It has no tests, is branded with a name now used by another product, and its inline script breaks this site's content security policy.

## Options

For the graph:

1. Carry the old viewer over, rewritten as a tested TypeScript module. Keeps the behaviour that already works. Positions are worked out when the site is built, so the map is correct on the first frame.
2. A graph library such as Cytoscape or Sigma. Mature and documented, but it adds a large dependency for features this map does not use, and tours, routes and the accessible path would still be written by hand.
3. Use the old viewer file as it is. No work, but it is untested, branded wrongly and blocked by the policy.

For the geographic view:

4. Reuse Tally's map module: MapLibre with OpenFreeMap tiles, loaded only when the view is opened.
5. A static picture of the UK with markers, drawn at build time. Lighter, but no zoom, and a different thing to maintain.

## Decision

Options 1 and 4.

- **Graph.** The viewer is rewritten as a module in the site repository with unit tests on layout, route-finding and the two-layer model, and journey tests on the launch routes. Layout is computed at build time in the same toolchain as the site, with a fixed node order so every build gives the same picture. Colours and sizes in drawing code are literal values. The old branding is removed.
- **Geographic view.** Tally's map module is reused and loaded only on demand, so it does not count against the first-load budget. It shows the pages that carry a place (0003).
- **Neither view is the only route.** A list and the per-page pages reach everything both maps show, by keyboard and screen reader.

The geographic view is held for the second release. The first release ships the graph with job routes. The optional place field still goes into the schema in the first pack release, so the data is ready.

## Consequences

- The rewrite is the riskiest piece of the build and gets the most test attention.
- The first load carries the graph only. The geographic view adds its weight when opened.
- A second third-party host (map tiles) will appear in the content security policy, as on Tally. Until the geographic view is built, the policy names no host at all.
- The geographic view depends on enough pages carrying a public location to be worth showing. That is an assumption to confirm before that card is built.
- One piece of novelty is spent, the only one in the product: the two-layer graph with job routes. The geographic view spends none, because it reuses a proven module.
- Reversible: the viewer reads the published data file and nothing else, so it can be replaced by a library without touching the pack or the connector. The risk to avoid is letting route logic live in the viewer. Routes are data in the pack, and the viewer only draws them.

## Revisit when

The graph passes about two thousand nodes, the layout step takes more than a couple of minutes of build time, or route-finding needs behaviour the hand-written module cannot give without a rewrite.
