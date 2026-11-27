# Architecture decisions

How the Foothold site is built, and why. Written for anyone learning the approach. Each record states the choice, the alternatives, and what would make us revisit it. The first six were taken in November 2026, before any code was written; later ones record choices made while building.

| ADR | Decision |
|---|---|
| [0001](0001-a-site-and-a-connector-not-a-link-alone.md) | Foothold gets a site and a connector, not a link alone |
| [0002](0002-static-site-on-cloudflare.md) | A static site on Cloudflare with one server route |
| [0003](0003-the-pack-states-its-schema-and-builds-its-map-data.md) | The pack states its own schema and builds its own map data |
| [0004](0004-our-own-map-viewer-with-a-geographic-second-view.md) | The map is drawn by our own viewer, with a geographic second view |
| [0005](0005-a-read-only-connector-with-no-model-behind-it.md) | A read-only connector with no model behind it |
| [0006](0006-install-by-zip-or-github-from-tagged-releases.md) | Install by zip or GitHub, built from tagged releases |
| [0007](0007-the-map-script-and-its-data-come-from-the-site-itself.md) | The map's script and its data come from the site itself, under one policy |
