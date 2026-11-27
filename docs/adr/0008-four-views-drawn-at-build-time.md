# 0008: Four views of the pack, drawn when the site is built

Status: accepted, November 2026

## Context

The free-form network (0004) places pages where a physics model settles them, so position means nothing and labels fight. The pack is now shown four more ways, each placing things by what they are: the whole map (a wheel of the defence reference joined to the business tree), who buys, how a job runs, and everything at a glance. The network stays as a fifth view.

Three questions follow: how the four are drawn, where the browser gets the views it does not show first, and how that stays inside the content security policy (0007), which allows no inline script or style.

## Options

For the drawing:

1. Draw each view on a canvas in the browser, as the network is. One more renderer per view, no text a screen reader or a search can read, and nothing without script.
2. Draw each view as SVG in the browser from the graph file. Real text, but layouts would run on the visitor's machine and ship in the script budget, and nothing shows without script.
3. Work out each view's layout and drawing when the site is built, from pure tested modules, and ship SVG. Real text, sharp at any zoom, the same drawing every build, and the default view reads without script.

For the views not shown first:

4. Put all four drawings in the page. Simple, but the page carries three drawings nobody asked for.
5. Write each of the other three as a static file next to the map page and fetch it when chosen. Either as markup to parse, or as an element tree built with the DOM.

## Decision

Options 3 and 5, as element trees.

- Pure modules in `src/lib/graph/view-*.ts` work out each view's positions, shapes and labels, and turn them into a drawing: a tree of elements, each a tag, its attributes and its children. Both the build and the tests check every drawing against one allow-list (`view-scene.ts`): known SVG and HTML elements only, no `style` attribute, no event handler, no link that leaves the site.
- The whole map is the default view, so Astro renders its drawing into the page at build time. Without script it is a picture with real text, beside the list of every page.
- Who buys, how a job runs and at a glance are written as `/map/views/<view>.json`. The viewer fetches one from this site when it is first chosen, checks it against the same allow-list, and builds it with `createElementNS` and `setAttribute`, setting every piece of text as text. Nothing is parsed as markup.
- Zoom on the whole map changes the drawing's viewBox only. Marks and labels keep their size on screen through classes for steps of a scale ladder, read by the stylesheet; labels are placed at build time for each step of a coarser ladder and shown from their own step upwards. No style attribute is ever written by script.
- The files hold only what the map file already gives the page: names, ids, kinds and positions, and counts worked out from the edges. A skill's group is read from the folder in its id.

## Consequences

- The content security policy is unchanged. The four drawings need no inline style and no new host.
- The script grows little: the layouts run at build time, so the browser carries only the switcher, the camera and the state classes.
- Each drawing file is public, as the map file it is built from already is.
- A change to a layout changes the built drawings, not the script, and is tested without a browser.
- Revisit if a view needs data the map file does not hold, or if a drawing file grows past what a first switch should fetch.
