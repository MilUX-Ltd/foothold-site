// The map's script: joins the four drawn views, the network canvas, the list,
// the panels, the path, the jobs and the address together so each drives the
// others. It moves the page from the landing state (the headline over the
// whole map) to the exploring state, and tells the whole map and the canvas
// which part of the stage the panels leave free, so nothing is fitted under
// them.
//
// - The view switcher shows one view at a time and puts it in the address.
//   The whole map is in the page already; the others are fetched from this
//   site the first time they are chosen (drawings.ts). The network canvas is
//   started only when its view is first shown.
// - One selection, one job and one path hold across every view. A view that
//   does not hold the selected page says so and offers the whole map.
//
// Text from the map file is only ever set as textContent, never as markup.
import { connectionsOf, typeLabel } from '../../lib/graph/connections';
import { freeArea, type Rect } from '../../lib/graph/fit';
import { kindName, layerLabel, type Graph } from '../../lib/graph/model';
import type { Layout } from '../../lib/graph/layout';
import { shortestPath, type PathResult } from '../../lib/graph/path';
import { readPayload } from '../../lib/graph/payload';
import { routeLit, routeView, type RouteInput, type RouteStep, type RouteView } from '../../lib/graph/routes';
import { DEFAULT_STATE, queryToState, stateToQuery, type MapState } from '../../lib/graph/url-state';
import { DRAWN_VIEWS, VIEW_LABELS, type DrawnView, type ViewName } from '../../lib/graph/view-common';
import { MapCamera } from './camera';
import { Drawings } from './drawings';
import { MapRenderer } from './render';

const DATA_URL = '/map/graph.json';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { className?: string; text?: string } = {}, ...children: Node[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const child of children) node.append(child);
  return node;
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`The map is missing #${id}`);
  return node as T;
}

/** The jobs as the page was built with them: each route's steps in the pack's order, read from an inert template. */
function readRoutes(): RouteInput[] {
  const template = document.getElementById('job-data');
  if (!(template instanceof HTMLTemplateElement)) return [];
  return [...template.content.querySelectorAll<HTMLElement>('ol[data-route]')].map((ol) => ({
    id: ol.dataset.route ?? '',
    name: ol.dataset.name ?? '',
    steps: [...ol.querySelectorAll<HTMLElement>('li[data-skill]')].map((li) => ({
      skill: li.dataset.skillName ?? '',
      skillId: li.dataset.skill ?? '',
      does: li.textContent?.trim() ?? '',
    })),
  }));
}

/** Whether an element takes up room on screen. */
function shown(node: Element | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  const style = getComputedStyle(node);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

const isDrawn = (view: ViewName): view is DrawnView => (DRAWN_VIEWS as readonly string[]).includes(view);
const SWITCH_ORDER: DrawnView[] = [...DRAWN_VIEWS];

export async function startViewer(): Promise<void> {
  const explorer = byId<HTMLElement>('explorer');
  const stage = byId<HTMLElement>('map-views');
  const canvas = byId<HTMLCanvasElement>('map-canvas');
  const status = byId<HTMLElement>('map-status');
  const waiting = byId<HTMLElement>('map-waiting');
  const waitingText = byId<HTMLElement>('map-waiting-text');
  const search = byId<HTMLInputElement>('map-search');
  const stack = explorer.querySelector<HTMLElement>('.map-stack');
  const tools = explorer.querySelector<HTMLElement>('.map-tools');
  const list = byId<HTMLElement>('node-list');
  const lead = document.getElementById('lead');
  const switcher = byId<HTMLElement>('view-switch');
  const note = byId<HTMLElement>('view-note');
  const noteLink = byId<HTMLAnchorElement>('view-note-link');
  const svg = document.getElementById('map-drawing') as SVGSVGElement | null;
  const mvStage = byId<HTMLElement>('mv-stage');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrowQuery = window.matchMedia('(max-width: 760px)');
  let renderer: MapRenderer | null = null;
  let camera: MapCamera | null = null;
  stage.dataset.motion = motionQuery.matches ? 'reduced' : 'full';

  const say = (message: string) => {
    // Clear first so the same message twice is still announced.
    status.textContent = '';
    window.setTimeout(() => (status.textContent = message), 30);
  };

  // ---- the whole map's camera, started at once so the drawing is fitted before anything else ----
  if (svg) {
    camera = new MapCamera(svg, motionQuery.matches);
    camera.wheelOnly = narrowQuery.matches;
    camera.leading = explorer.dataset.state === 'landing';
  }

  // The landing view draws itself in once: rings, then marks, then lines. Not with reduced motion.
  if (svg && explorer.dataset.state === 'landing' && !motionQuery.matches) {
    svg.classList.add('drawing');
    window.setTimeout(() => svg.classList.remove('drawing'), 2200);
  }

  // ---- the free part of the stage ---------------------------------------------
  // Panels lie over the drawing on a wide screen. Whatever of theirs overlaps
  // the stage is cut away, and the drawing is fitted into what is left. On a
  // phone the panels sit below it and the whole stage is free.
  let view: ViewName = 'map';
  function updateFreeArea(options: { animate?: boolean } = {}) {
    const target = view === 'network' ? canvas : view === 'map' ? svg : null;
    if (!target) return;
    const c = target.getBoundingClientRect();
    if (c.width <= 0 || c.height <= 0) return;
    const container: Rect = { left: 0, top: 0, width: c.width, height: c.height };
    const obstacles: Rect[] = [];
    for (const node of [lead, list, tools, stack, switcher, note]) {
      if (!shown(node)) continue;
      const r = node.getBoundingClientRect();
      obstacles.push({ left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height });
    }
    const area = freeArea(container, obstacles, 20);
    if (view === 'network' && renderer) renderer.setFreeArea(area, { animate: options.animate && !renderer.reducedMotion });
    if (view === 'map' && camera) camera.setFree(area, { animate: options.animate && !camera.reducedMotion });
  }

  // ---- landing and exploring ------------------------------------------------
  const isLanding = () => explorer.dataset.state === 'landing';
  function enterExploring(options: { focusSearch?: boolean } = {}) {
    if (!isLanding()) {
      if (options.focusSearch) search.focus();
      return;
    }
    explorer.dataset.state = 'exploring';
    svg?.classList.remove('drawing');
    if (camera) camera.leading = false;
    updateFreeArea({ animate: true });
    if (options.focusSearch) search.focus();
  }
  document.getElementById('explore')?.addEventListener('click', () => enterExploring({ focusSearch: true }));

  // ---- panels that open and close ------------------------------------------
  const toggles = new Map<string, HTMLButtonElement>();
  for (const button of explorer.querySelectorAll<HTMLButtonElement>('button.panel-toggle[data-panel]')) toggles.set(button.dataset.panel!, button);
  /** What to do when a panel closes, by panel id; the jobs panel closes the job. */
  const onClose = new Map<string, () => void>();
  function setPanel(id: string, open: boolean, options: { focus?: 'toggle' } = {}) {
    const panel = byId<HTMLElement>(id);
    const toggle = toggles.get(id);
    if (panel.hidden === !open && toggle?.getAttribute('aria-expanded') === String(open)) return;
    panel.hidden = !open;
    toggle?.setAttribute('aria-expanded', String(open));
    if (!open) onClose.get(id)?.();
    updateFreeArea({ animate: true });
    if (options.focus === 'toggle') toggle?.focus();
  }
  for (const [id, button] of toggles) button.addEventListener('click', () => setPanel(id, button.getAttribute('aria-expanded') !== 'true'));
  for (const button of explorer.querySelectorAll<HTMLButtonElement>('button[data-close]')) {
    button.addEventListener('click', () => setPanel(button.dataset.close!, false, { focus: 'toggle' }));
  }
  for (const id of toggles.keys()) {
    byId<HTMLElement>(id).addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      setPanel(id, false, { focus: 'toggle' });
    });
  }

  // The list's heading becomes the button that folds it away. On a narrower
  // wide screen it starts folded, so the drawing has the room.
  const listHeading = list.querySelector<HTMLElement>('h2[data-toggles]');
  const listBody = listHeading ? byId<HTMLElement>(listHeading.dataset.toggles!) : null;
  let listToggle: HTMLButtonElement | null = null;
  const foldList = (open: boolean) => {
    if (!listToggle || !listBody) return;
    listToggle.setAttribute('aria-expanded', String(open));
    listBody.hidden = !open;
    list.classList.toggle('is-folded', !open);
    explorer.classList.toggle('list-folded', !open);
  };
  if (listHeading && listBody) {
    const button = el('button', { className: 'list-toggle', text: listHeading.textContent?.trim() ?? '' });
    button.type = 'button';
    button.id = 'list-toggle';
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', listBody.id);
    listHeading.replaceChildren(button);
    listToggle = button;
    button.addEventListener('click', () => {
      foldList(button.getAttribute('aria-expanded') !== 'true');
      updateFreeArea({ animate: true });
    });
    if (window.matchMedia('(min-width: 761px) and (max-width: 1199px)').matches) foldList(false);
  }
  const openList = () => {
    enterExploring();
    foldList(true);
    updateFreeArea();
    search.focus();
  };

  // ---- the data ----------------------------------------------------------------
  let graph: Graph;
  let layout: Layout;
  try {
    const response = await fetch(DATA_URL, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`The map data answered ${response.status}`);
    ({ graph, layout } = readPayload(await response.json()));
  } catch (error) {
    waitingText.textContent = `The drawing could not start (${error instanceof Error ? error.message : 'unknown error'}). Every page is still in the list of every page on the map.`;
    explorer.dataset.ready = 'true';
    return;
  }
  const drawings = new Drawings(stage, graph);
  motionQuery.addEventListener('change', () => {
    stage.dataset.motion = motionQuery.matches ? 'reduced' : 'full';
    if (renderer) renderer.reducedMotion = motionQuery.matches;
    if (camera) camera.reducedMotion = motionQuery.matches;
    if (renderer) canvas.dataset.motion = motionQuery.matches ? 'reduced' : 'full';
  });

  const listButtons = new Map<string, HTMLButtonElement>();
  for (const button of list.querySelectorAll<HTMLButtonElement>('button[data-id]')) {
    if (button.dataset.id) listButtons.set(button.dataset.id, button);
  }
  const selectionPanel = byId<HTMLElement>('selection');
  const selectionBody = byId<HTMLElement>('selection-body');
  const pathFrom = byId<HTMLSelectElement>('path-from');
  const pathTo = byId<HTMLSelectElement>('path-to');
  const pathResult = byId<HTMLElement>('path-result');
  const modeButton = byId<HTMLButtonElement>('map-mode');

  let state: MapState = { ...DEFAULT_STATE };
  const writeAddress = () => {
    const query = stateToQuery(state);
    window.history.replaceState(null, '', `${window.location.pathname}${query}${window.location.hash}`);
  };
  const nameOf = (id: string) => graph.byId.get(id)?.name ?? id;
  let lastPath: PathResult = { nodes: [], edges: [] };
  let litRoute: { id: string; step: number | null } | null = null;

  /** Starts the network canvas the first time its view is shown. */
  function ensureRenderer(): MapRenderer {
    if (renderer) return renderer;
    renderer = new MapRenderer(canvas, graph, layout, motionQuery.matches);
    canvas.dataset.motion = motionQuery.matches ? 'reduced' : 'full';
    waiting.hidden = true;
    renderer.setMode(state.mode);
    renderer.setHighlight({ selected: state.node, path: lastPath.nodes, pathEdges: lastPath.edges, route: litRoute ? routeLitFor(litRoute.id, litRoute.step) : null });
    renderer.draw();
    canvas.dataset.ready = 'true';
    return renderer;
  }

  // ---- the "not in this view" line --------------------------------------------
  function updateNote() {
    const missing = state.node !== null && isDrawn(view) && view !== 'map' && !drawings.holds(view, state.node);
    if (missing) noteLink.href = stateToQuery({ ...state, view: 'map', mode: '2d' }) || '?';
    if (note.hidden !== !missing) {
      note.hidden = !missing;
      updateFreeArea();
    }
  }
  noteLink.addEventListener('click', (ev) => {
    ev.preventDefault();
    void setView('map', { announce: true });
  });

  // ---- selection ------------------------------------------------------
  function renderSelection(id: string | null) {
    selectionBody.replaceChildren();
    if (!id) {
      selectionBody.append(el('p', { className: 'map-empty', text: 'Nothing is selected. Choose a page on the map or in the list.' }));
      return;
    }
    const node = graph.byId.get(id)!;
    const c = connectionsOf(graph, id);
    const heading = el('h3', { className: 'selected-name', text: node.name });
    heading.id = 'selected-name';
    heading.tabIndex = -1;
    const meta = el('p', { className: 'mono selected-meta', text: `${kindName(node.kind)} · ${layerLabel(node.layer)} · ${c.total} connection${c.total === 1 ? '' : 's'}` });
    selectionBody.append(heading, meta);
    const actions = el('div', { className: 'selected-actions' });
    const fromHere = el('button', { className: 'map-btn', text: 'Path from here' });
    fromHere.type = 'button';
    fromHere.addEventListener('click', () => {
      setPanel('path', true);
      pathFrom.value = id;
      pathFrom.focus();
      say(`Path start set to ${node.name}.`);
    });
    const toHere = el('button', { className: 'map-btn', text: 'Path to here' });
    toHere.type = 'button';
    toHere.addEventListener('click', () => {
      setPanel('path', true);
      pathTo.value = id;
      pathTo.focus();
      say(`Path end set to ${node.name}.`);
    });
    const clear = el('button', { className: 'map-btn', text: 'Clear selection' });
    clear.type = 'button';
    clear.addEventListener('click', () => {
      select(null);
      (view === 'network' ? canvas : stage.querySelector<HTMLElement>(`[data-view-pane="${view}"] .mk[tabindex="0"]`) ?? search).focus();
      say('Selection cleared.');
    });
    actions.append(fromHere, toHere, clear);
    selectionBody.append(actions);
    if (c.total === 0) {
      selectionBody.append(el('p', { className: 'map-note', text: 'This page has no connections on the map.' }));
      return;
    }
    for (const direction of ['outgoing', 'incoming'] as const) {
      const groups = c[direction];
      if (!groups.length) continue;
      const block = el('div', { className: 'connections' });
      block.dataset.direction = direction;
      block.append(el('h4', { text: direction === 'outgoing' ? 'From this page' : 'To this page' }));
      for (const group of groups) {
        block.append(el('p', { className: 'mono connection-type', text: `${typeLabel(group.type, direction)} (${group.nodes.length})` }));
        const items = el('ul', { className: 'connection-list' });
        for (const other of group.nodes) {
          const button = el('button', { className: 'link-button', text: other.name });
          button.type = 'button';
          button.dataset.id = other.id;
          button.addEventListener('click', () => {
            select(other.id);
            document.getElementById('selected-name')?.focus();
          });
          items.append(el('li', {}, button));
        }
        block.append(items);
      }
      selectionBody.append(block);
    }
  }

  /** Brings a page's mark into sight in the view shown. */
  function bringIntoView(id: string) {
    if (view === 'network') {
      renderer?.focusOn(id);
      return;
    }
    const marks = drawings.marksOf(view, id).filter((m) => m.getClientRects().length > 0);
    if (!marks.length) return;
    if (view === 'map' && camera) {
      // Bring the mark into sight; never shrink the drawing to make room for the panels.
      const m = marks.find((x) => (x as SVGElement).dataset.x !== undefined) as SVGElement | undefined;
      camera.moved = true;
      if (m) camera.focusOn([{ x: Number(m.dataset.x), y: Number(m.dataset.y) }]);
      return;
    }
    marks[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: motionQuery.matches ? 'auto' : 'smooth' });
  }

  function select(id: string | null, options: { announce?: boolean; move?: boolean } = {}) {
    const { announce = true, move = true } = options;
    // Choosing anything puts the headline away.
    if (id) enterExploring();
    // Once something is chosen, panels opening and closing no longer refit the whole map.
    if (id && camera && view === 'map') camera.moved = true;
    if (state.node) listButtons.get(state.node)?.removeAttribute('aria-current');
    state = { ...state, node: id };
    if (id) listButtons.get(id)?.setAttribute('aria-current', 'true');
    renderSelection(id);
    selectionPanel.hidden = !id;
    drawings.setSelected(id);
    renderer?.setHighlight({ selected: id });
    updateNote();
    updateFreeArea({ animate: true });
    if (id && move) bringIntoView(id);
    writeAddress();
    if (id && announce) {
      const node = graph.byId.get(id)!;
      const total = connectionsOf(graph, id).total;
      const elsewhere = isDrawn(view) && view !== 'map' && !drawings.holds(view, id) ? ' This page is not in this view.' : '';
      say(`Selected ${node.name}, ${kindName(node.kind)}. ${total} connection${total === 1 ? '' : 's'}, listed in the selected page panel.${elsewhere}`);
    }
  }

  // ---- path -------------------------------------------------------------
  function showPath(from: string | null, to: string | null, options: { announce?: boolean } = {}) {
    const { announce = true } = options;
    // Asking for a path closes the job.
    if (from && to && state.route) setPanel('jobs', false);
    pathResult.replaceChildren();
    state = { ...state, from, to };
    if (!from || !to) {
      lastPath = { nodes: [], edges: [] };
      drawings.setPath([], []);
      renderer?.setHighlight({ path: [], pathEdges: [] });
      writeAddress();
      if (from || to) {
        pathResult.append(el('p', { text: 'Choose a page for both ends of the path.' }));
        if (announce) say('Choose a page for both ends of the path.');
      }
      return;
    }
    enterExploring();
    if (camera && view === 'map') camera.moved = true;
    setPanel('path', true);
    const result: PathResult = shortestPath(graph, from, to);
    writeAddress();
    if (!result.nodes.length) {
      lastPath = { nodes: [], edges: [] };
      drawings.setPath([], []);
      renderer?.setHighlight({ path: [], pathEdges: [] });
      const message = `No path joins ${nameOf(from)} and ${nameOf(to)} on this map.`;
      pathResult.append(el('p', { className: 'path-none', text: message }));
      if (announce) say(message);
      return;
    }
    const steps = result.edges.length;
    const summary = steps === 0 ? `${nameOf(from)} is both ends of the path.` : `${steps} step${steps === 1 ? '' : 's'} from ${nameOf(from)} to ${nameOf(to)}.`;
    pathResult.append(el('p', { className: 'path-summary', text: summary }));
    const items = el('ol', { className: 'path-steps' });
    result.nodes.forEach((id, i) => {
      const button = el('button', { className: 'link-button', text: nameOf(id) });
      button.type = 'button';
      button.dataset.id = id;
      button.addEventListener('click', () => select(id));
      const item = el('li', {}, button);
      if (i > 0) {
        const edge = result.edges[i - 1];
        const forward = edge.from === result.nodes[i - 1];
        // Read from this step's node: "(read by build-dpia)", "(filed in organisations)".
        const relation = typeLabel(edge.type, forward ? 'incoming' : 'outgoing');
        item.append(el('span', { className: 'path-via', text: ` (${relation} ${nameOf(result.nodes[i - 1])})` }));
      }
      items.append(item);
    });
    pathResult.append(items);
    lastPath = result;
    drawings.setPath(result.nodes, result.edges);
    renderer?.setHighlight({ path: result.nodes, pathEdges: result.edges });
    updateFreeArea();
    if (view === 'network') renderer?.focusOnAll(result.nodes);
    if (view === 'map') focusMapOn(result.nodes);
    if (announce) say(`Path found. ${summary} ${result.nodes.map(nameOf).join(', then ')}.`);
  }

  /** Brings a set of pages into sight on the whole map. */
  function focusMapOn(ids: string[]) {
    if (!camera) return;
    const points: { x: number; y: number }[] = [];
    for (const id of ids) {
      const m = drawings.marksOf('map', id).find((x) => (x as SVGElement).dataset.x !== undefined) as SVGElement | undefined;
      if (m && m.getClientRects().length) points.push({ x: Number(m.dataset.x), y: Number(m.dataset.y) });
    }
    camera.focusOn(points);
  }

  byId<HTMLButtonElement>('path-go').addEventListener('click', () => showPath(pathFrom.value || null, pathTo.value || null));
  byId<HTMLButtonElement>('path-clear').addEventListener('click', () => {
    pathFrom.value = '';
    pathTo.value = '';
    showPath(null, null);
    say('Path cleared.');
  });

  // ---- the network's mode and the cameras --------------------------------------
  function setMode(mode: MapState['mode']) {
    state = { ...state, mode };
    renderer?.setMode(mode);
    modeButton.setAttribute('aria-pressed', String(mode === '3d'));
    writeAddress();
  }
  modeButton.addEventListener('click', () => {
    setMode(state.mode === '3d' ? '2d' : '3d');
    say(state.mode === '3d' ? '3D view. Drag to turn the map; hold shift and drag to move it.' : 'Flat view.');
  });
  byId<HTMLButtonElement>('map-zoom-in').addEventListener('click', () => (view === 'network' ? renderer?.zoomBy(1.3) : camera?.zoomBy(1.3)));
  byId<HTMLButtonElement>('map-zoom-out').addEventListener('click', () => (view === 'network' ? renderer?.zoomBy(1 / 1.3) : camera?.zoomBy(1 / 1.3)));
  byId<HTMLButtonElement>('map-reset').addEventListener('click', () => {
    if (view === 'network') renderer?.fit({ animate: !renderer.reducedMotion });
    else camera?.fit({ animate: !camera.reducedMotion });
  });

  // ---- the network key's control: every "mentions" and "filed in" line, or only some
  const allEdges = byId<HTMLButtonElement>('edges-all');
  allEdges.addEventListener('click', () => {
    const on = allEdges.getAttribute('aria-pressed') !== 'true';
    allEdges.setAttribute('aria-pressed', String(on));
    renderer?.setHighlight({ showAll: on });
    say(on ? 'All “mentions” and “filed in” lines shown.' : '“Mentions” and “filed in” lines hidden until you point at a page or choose one.');
  });

  // ---- the list ---------------------------------------------------------
  for (const [id, button] of listButtons) button.addEventListener('click', () => select(id));
  const count = byId<HTMLElement>('list-count');
  const countText = count.textContent ?? '';
  let searchTimer = 0;
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let found = 0;
    for (const group of list.querySelectorAll<HTMLElement>('.list-group')) {
      let inGroup = 0;
      for (const button of group.querySelectorAll<HTMLButtonElement>('button[data-id]')) {
        const match = !q || button.textContent!.toLowerCase().includes(q) || button.dataset.id!.toLowerCase().includes(q);
        button.parentElement!.hidden = !match;
        if (match) inGroup++;
      }
      group.hidden = inGroup === 0;
      found += inGroup;
    }
    const text = q ? `${found} of ${graph.nodes.length} pages match` : countText;
    count.textContent = text;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => say(text), 400);
  });

  // ---- the drawn views: pointing, choosing, the arrow keys -------------------------------
  let suppressClick = false;
  const markOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement | SVGElement>('.mk[data-id], .vl-btn[data-id], .vl-btn[data-route]') : null);
  stage.addEventListener('pointerover', (ev) => {
    if (view === 'network' || ev.pointerType === 'touch') return;
    const m = markOf(ev.target);
    if (m instanceof SVGElement) drawings.setPointed(m.dataset.id ?? null);
  });
  stage.addEventListener('pointerout', (ev) => {
    if (view === 'network') return;
    const from = markOf(ev.target);
    const to = markOf(ev.relatedTarget);
    if (from && from !== to) drawings.setPointed(to instanceof SVGElement ? (to.dataset.id ?? null) : null);
  });
  stage.addEventListener('focusin', (ev) => {
    const m = markOf(ev.target);
    if (m instanceof SVGElement) drawings.setPointed(m.dataset.id ?? null);
  });
  stage.addEventListener('focusout', (ev) => {
    if (!markOf(ev.relatedTarget)) drawings.setPointed(null);
  });
  stage.addEventListener(
    'click',
    (ev) => {
      if (suppressClick) {
        suppressClick = false;
        ev.stopPropagation();
        ev.preventDefault();
        return;
      }
      const target = ev.target instanceof Element ? ev.target : null;
      const link = target?.closest('a.list-link');
      if (link) {
        ev.preventDefault();
        openList();
        return;
      }
      const m = markOf(target);
      if (!m) return;
      const route = m.dataset.route;
      if (route && views.has(route)) {
        const step = m.dataset.step ? Number(m.dataset.step) : null;
        showJob(route, step, { focus: 'keep' });
        return;
      }
      if (m.dataset.id) select(m.dataset.id, { move: false });
    },
    true,
  );
  stage.addEventListener('keydown', (ev) => {
    if (view === 'network' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const m = markOf(ev.target);
    if (m instanceof SVGElement) {
      const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -Infinity, End: Infinity };
      if (ev.key in moves && !(ev.shiftKey && view === 'map')) {
        ev.preventDefault();
        const next = drawings.step(m, moves[ev.key]);
        if (next) {
          m.setAttribute('tabindex', '-1');
          next.setAttribute('tabindex', '0');
          next.focus();
          if (view === 'map' && camera && next.dataset.x !== undefined) camera.focusOn([{ x: Number(next.dataset.x), y: Number(next.dataset.y) }], { animate: false });
        }
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
    if (view === 'map' && camera) {
      const keys: Record<string, () => void> = {
        '+': () => camera!.zoomBy(1.3),
        '=': () => camera!.zoomBy(1.3),
        '-': () => camera!.zoomBy(1 / 1.3),
        '0': () => camera!.fit({ animate: !camera!.reducedMotion }),
      };
      if (ev.shiftKey && ev.key.startsWith('Arrow')) {
        const d = 60;
        const pan: Record<string, [number, number]> = { ArrowLeft: [d, 0], ArrowRight: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
        ev.preventDefault();
        camera.panBy(...pan[ev.key]);
        return;
      }
      if (keys[ev.key]) {
        ev.preventDefault();
        keys[ev.key]();
        return;
      }
    }
    if (ev.key === 'Escape' && state.node) {
      select(null);
      say('Selection cleared.');
    }
  });

  // ---- the whole map: drag, wheel and pinch ------------------------------------------------
  if (svg && camera) {
    const cam = camera;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let moved = 0;
    const local = (ev: { clientX: number; clientY: number }) => {
      const r = svg.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      pointers.set(ev.pointerId, local(ev));
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    svg.addEventListener('pointermove', (ev) => {
      const last = pointers.get(ev.pointerId);
      if (!last) return;
      const p = local(ev);
      pointers.set(ev.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) cam.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        moved += 10;
        return;
      }
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        if (!svg.hasPointerCapture(ev.pointerId)) svg.setPointerCapture(ev.pointerId);
        svg.classList.add('is-dragging');
        cam.panBy(dx, dy);
      }
    });
    const release = (ev: PointerEvent) => {
      if (!pointers.delete(ev.pointerId)) return;
      if (pointers.size < 2) pinch = 0;
      if (moved > 4) suppressClick = true;
      if (!pointers.size) {
        svg.classList.remove('is-dragging');
        window.setTimeout(() => (suppressClick = false), 0);
      }
    };
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    svg.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const p = local(ev);
        cam.zoomBy(Math.pow(1.0018, -ev.deltaY * (ev.deltaMode === 1 ? 16 : 1)), p.x, p.y);
      },
      { passive: false },
    );
    narrowQuery.addEventListener('change', () => {
      cam.wheelOnly = narrowQuery.matches;
      cam.fit();
    });
  }

  // ---- the network canvas: pointer, wheel and keys (unchanged from the single view) ----------
  {
    const pointers = new Map<number, { x: number; y: number }>();
    let dragged = false;
    let pinch = 0;
    let hovered: string | null = null;
    const local = (ev: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, local(ev));
      dragged = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    canvas.addEventListener('pointermove', (ev) => {
      const r = renderer;
      if (!r) return;
      const p = local(ev);
      const last = pointers.get(ev.pointerId);
      if (!last) {
        const over = r.nodeAt(p.x, p.y);
        if (over !== hovered) {
          hovered = over;
          canvas.classList.toggle('is-pointing', over !== null);
          r.setHighlight({ hovered: over });
        }
        return;
      }
      pointers.set(ev.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) r.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        dragged = true;
        return;
      }
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
      if (state.mode === '3d' && !ev.shiftKey) r.turnBy(dx, dy);
      else r.panBy(dx, dy);
    });
    const release = (ev: PointerEvent) => {
      const had = pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (renderer && had && !dragged && pointers.size === 0 && ev.type === 'pointerup') {
        const p = local(ev);
        select(renderer.nodeAt(p.x, p.y), { move: false });
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => {
      if (hovered === null) return;
      hovered = null;
      canvas.classList.remove('is-pointing');
      renderer?.setHighlight({ hovered: null });
    });
    canvas.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const p = local(ev);
        renderer?.zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (ev) => {
      const r = renderer;
      if (!r || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const step = 60;
      const turn = state.mode === '3d' && !ev.shiftKey;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => (turn ? r.turnBy(-step / 2, 0) : r.panBy(step, 0)),
        ArrowRight: () => (turn ? r.turnBy(step / 2, 0) : r.panBy(-step, 0)),
        ArrowUp: () => (turn ? r.turnBy(0, -step / 2) : r.panBy(0, step)),
        ArrowDown: () => (turn ? r.turnBy(0, step / 2) : r.panBy(0, -step)),
        '+': () => r.zoomBy(1.3),
        '=': () => r.zoomBy(1.3),
        '-': () => r.zoomBy(1 / 1.3),
        '0': () => r.fit(),
        Escape: () => {
          if (state.node) {
            select(null);
            say('Selection cleared.');
          }
        },
      };
      const action = keys[ev.key];
      if (action) {
        ev.preventDefault();
        action();
      }
    });
  }

  // The window or a panel changing size changes the free area.
  const resized = new ResizeObserver((entries) => {
    if (renderer && entries.some((e) => e.target === canvas)) renderer.resize();
    if (camera && svg && entries.some((e) => e.target === mvStage)) camera.refresh();
    updateFreeArea();
  });
  for (const node of [canvas, mvStage, lead, list, tools, stack, switcher]) if (node) resized.observe(node);

  // ---- jobs: a route from the pack, whole or one step at a time -------------
  // What a job lights, and what the panel lists for each step, comes from
  // src/lib/graph/routes.ts. Here the panel is filled in and kept in step with
  // the drawings, the canvas and the address.
  const views = new Map<string, RouteView>();
  for (const input of readRoutes()) {
    if (input.id && input.steps.length && input.steps.every((s) => graph.byId.has(s.skillId))) views.set(input.id, routeView(graph, input));
  }
  const routeLitFor = (id: string, step: number | null) => routeLit(graph, views.get(id)!, step);
  const jobsPanel = byId<HTMLElement>('jobs');
  const jobsHeading = byId<HTMLElement>('jobs-heading');
  const jobsChoose = byId<HTMLElement>('jobs-choose');
  const jobView = byId<HTMLElement>('job-view');
  const jobName = byId<HTMLElement>('job-name');
  const jobCount = byId<HTMLElement>('job-count');
  const jobSteps = byId<HTMLOListElement>('job-steps');
  const jobStep = byId<HTMLElement>('job-step');
  const jobPrev = byId<HTMLButtonElement>('job-prev');
  const jobNext = byId<HTMLButtonElement>('job-next');
  const jobWhole = byId<HTMLButtonElement>('job-whole');
  const jobClose = byId<HTMLButtonElement>('job-close');
  const jobButtons = new Map<string, HTMLButtonElement>();
  for (const button of jobsPanel.querySelectorAll<HTMLButtonElement>('.job-list button[data-route]')) jobButtons.set(button.dataset.route!, button);
  let shownRoute: string | null = null;

  const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
  // Folders are named by where they sit in the pack, which says more than their last part.
  const placeName = (id: string) => (graph.byId.get(id)?.kind === 'vault' ? 'the whole vault' : id);

  function stepDetail(rv: RouteView, step: RouteStep) {
    jobStep.replaceChildren();
    const title = el('h4', { className: 'job-step-title' });
    title.id = 'job-step-heading';
    title.tabIndex = -1;
    const skill = el('button', { className: 'link-button', text: step.skill });
    skill.type = 'button';
    skill.dataset.id = step.skillId;
    skill.addEventListener('click', () => {
      select(step.skillId);
      document.getElementById('selected-name')?.focus();
    });
    title.append(skill);
    jobStep.append(title, el('p', { className: 'job-does', text: step.does }));
    const lines = el('ul', { className: 'job-lines' });
    const line = (label: string, value: string) => lines.append(el('li', {}, el('span', { className: 'job-line-label', text: label }), document.createTextNode(` ${value}`)));
    // The whole vault first, then any folders, in the pack's own folder names.
    const reads = [...step.reads].sort((a, b) => Number(b.kind === 'vault') - Number(a.kind === 'vault'));
    if (reads.length) line('Reads:', reads.map((n) => placeName(n.id)).join(', '));
    if (step.writes.length) line('Writes:', step.writes.map((n) => placeName(n.id)).join(', '));
    if (step.defencePages.length) lines.append(el('li', { text: `Draws on ${plural(step.defencePages.length, 'defence page', 'defence pages')}` }));
    if (lines.childElementCount) jobStep.append(lines);
    if (step.exampleBusiness) jobStep.append(el('p', { className: 'job-example', text: `${step.exampleBusiness.name}, the example business, is filed here.` }));
    jobStep.dataset.route = rv.id;
  }

  /** Lights the open job in the view shown. */
  function lightJob() {
    const route = litRoute ? { ...litRoute, lit: routeLitFor(litRoute.id, litRoute.step) } : null;
    drawings.setRoute(route);
    renderer?.setHighlight({ route: route?.lit ?? null });
  }

  function showJob(routeId: string | null, step: number | null, options: { announce?: boolean; focus?: 'name' | 'step' | 'list' | 'keep'; move?: boolean } = {}) {
    const { announce = true, focus = 'keep', move = true } = options;
    const rv = routeId ? views.get(routeId) : undefined;
    if (!rv) {
      const was = state.route ?? null;
      const rest: MapState = { node: state.node, from: state.from, to: state.to, view: state.view, mode: state.mode };
      state = rest;
      shownRoute = null;
      litRoute = null;
      jobView.hidden = true;
      jobsChoose.hidden = false;
      lightJob();
      writeAddress();
      updateFreeArea();
      if (focus === 'list' && was) jobButtons.get(was)?.focus();
      if (announce && was) say('Job closed. The map shows every page again.');
      return;
    }
    enterExploring();
    if (state.from || state.to) {
      pathFrom.value = '';
      pathTo.value = '';
      showPath(null, null, { announce: false });
    }
    const total = rv.steps.length;
    const current = step !== null && step >= 1 && step <= total ? rv.steps[step - 1] : null;
    state = { ...state, route: rv.id, step: current ? current.number : null };
    if (camera && view === 'map') camera.moved = true;
    setPanel('jobs', true);
    jobsChoose.hidden = true;
    jobView.hidden = false;
    if (shownRoute !== rv.id) {
      shownRoute = rv.id;
      jobName.textContent = rv.name;
      jobSteps.replaceChildren();
      for (const s of rv.steps) {
        const button = el('button', { className: 'job-step-button', text: s.skill });
        button.type = 'button';
        button.dataset.step = String(s.number);
        button.addEventListener('click', () => showJob(rv.id, s.number, { focus: 'step' }));
        jobSteps.append(el('li', {}, button));
      }
    }
    for (const button of jobSteps.querySelectorAll<HTMLButtonElement>('button[data-step]')) {
      if (current && button.dataset.step === String(current.number)) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    jobCount.textContent = current ? `Step ${current.number} of ${total}` : plural(total, 'step', 'steps');
    jobStep.hidden = !current;
    if (current) stepDetail(rv, current);
    else jobStep.replaceChildren();
    jobPrev.setAttribute('aria-disabled', String(!current || current.number === 1));
    jobNext.setAttribute('aria-disabled', String(current !== null && current.number === total));
    jobWhole.setAttribute('aria-disabled', String(!current));
    litRoute = { id: rv.id, step: current ? current.number : null };
    lightJob();
    writeAddress();
    // Fit to what is lit once the panel has its new size, so nothing lit sits under it.
    updateFreeArea();
    if (move) {
      const lit = routeLitFor(rv.id, litRoute.step);
      if (view === 'network') renderer?.focusOnAll([...lit.strong, ...lit.soft]);
      if (view === 'map') focusMapOn([...lit.strong, ...lit.soft]);
    }
    if (focus === 'name') jobName.focus();
    else if (focus === 'step') (document.getElementById('job-step-heading') ?? jobName).focus();
    if (announce) {
      if (current) say(`Step ${current.number} of ${total}: ${current.skill}. ${current.does}`);
      else say(`${rv.name}, the whole job: ${plural(total, 'step', 'steps')}, lit on the map.`);
    }
  }

  const stepNow = () => state.step ?? null;
  const goNext = () => {
    const rv = state.route ? views.get(state.route) : undefined;
    if (!rv) return;
    const k = stepNow();
    if (k === rv.steps.length) return;
    showJob(rv.id, k === null ? 1 : k + 1);
  };
  const goPrevious = () => {
    const k = stepNow();
    if (!state.route || k === null || k <= 1) return;
    showJob(state.route, k - 1);
  };
  for (const [id, button] of jobButtons) button.addEventListener('click', () => showJob(id, null, { focus: 'name' }));
  jobNext.addEventListener('click', goNext);
  jobPrev.addEventListener('click', goPrevious);
  jobWhole.addEventListener('click', () => {
    if (state.route && stepNow() !== null) showJob(state.route, null, { focus: 'name' });
  });
  jobClose.addEventListener('click', () => showJob(null, null, { focus: 'list' }));
  onClose.set('jobs', () => showJob(null, null));
  toggles.get('jobs')?.addEventListener('click', () => {
    if (!jobsPanel.hidden) jobsHeading.focus();
  });
  // With focus in the panel, the left and right arrow keys move through the steps.
  jobsPanel.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey || jobView.hidden) return;
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLTextAreaElement) return;
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      goNext();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      goPrevious();
    }
  });

  // ---- the view switcher ---------------------------------------------------------------
  const viewButtons = [...switcher.querySelectorAll<HTMLButtonElement>('button[data-view-button]')];
  const moreButton = byId<HTMLButtonElement>('view-more');
  const moreMenu = byId<HTMLElement>('view-more-menu');
  const rowButtons = viewButtons.filter((b) => b.closest('.switch-row'));
  const setMore = (open: boolean) => {
    moreButton.setAttribute('aria-expanded', String(open));
    moreMenu.hidden = !open;
  };
  moreButton.addEventListener('click', () => setMore(moreMenu.hidden === true));
  moreMenu.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      setMore(false);
      moreButton.focus();
    }
  });
  document.addEventListener('click', (ev) => {
    if (!moreMenu.hidden && ev.target instanceof Node && !switcher.contains(ev.target)) setMore(false);
  });
  let switching = 0;

  async function setView(next: ViewName, options: { announce?: boolean; focusButton?: boolean } = {}) {
    const ticket = ++switching;
    explorer.dataset.ready = 'false';
    if (next !== 'map') enterExploring();
    if (isDrawn(next)) {
      try {
        await drawings.ensure(next);
      } catch (error) {
        if (ticket !== switching) return;
        say(`That view could not be drawn (${error instanceof Error ? error.message : 'unknown error'}). Every page is still in the list of every page on the map.`);
        explorer.dataset.ready = 'true';
        return;
      }
    }
    if (ticket !== switching) return;
    view = next;
    state = { ...state, view: next };
    explorer.dataset.view = next;
    for (const pane of stage.querySelectorAll<HTMLElement>('[data-view-pane]')) pane.hidden = pane.dataset.viewPane !== next;
    for (const b of viewButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.viewButton === next));
      if (b.closest('.switch-row')) b.tabIndex = b.dataset.viewButton === (next === 'network' ? 'map' : next) ? 0 : -1;
    }
    moreButton.classList.toggle('is-current', next === 'network');
    setMore(false);
    for (const node of explorer.querySelectorAll<HTMLElement>('[data-views]')) node.hidden = !(node.dataset.views ?? '').split(' ').includes(next);
    drawings.show(next);
    drawings.setPointed(null);
    drawings.setSelected(state.node);
    drawings.setPath(lastPath.nodes, lastPath.edges);
    lightJob();
    if (next === 'network') {
      ensureRenderer();
      renderer!.resize();
    }
    if (next === 'map') camera?.refresh();
    updateNote();
    updateFreeArea();
    writeAddress();
    if (options.focusButton) viewButtons.find((b) => b.dataset.viewButton === next)?.focus();
    if (options.announce) {
      const position = SWITCH_ORDER.indexOf(next as DrawnView);
      say(`${VIEW_LABELS[next]}${position >= 0 ? `, view ${position + 1} of ${SWITCH_ORDER.length}` : ''}.${!note.hidden ? ' This page is not in this view.' : ''}`);
    }
    explorer.dataset.ready = 'true';
  }

  for (const b of viewButtons) b.addEventListener('click', () => void setView(b.dataset.viewButton as ViewName, { announce: true }));
  switcher.querySelector('.switch-row')?.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const target = e.target instanceof HTMLButtonElement ? e.target : null;
    if (!target?.dataset.viewButton) return;
    const i = rowButtons.indexOf(target);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % rowButtons.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + rowButtons.length) % rowButtons.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = rowButtons.length - 1;
    if (j < 0) return;
    e.preventDefault();
    void setView(rowButtons[j].dataset.viewButton as ViewName, { announce: true, focusButton: true });
  });

  // ---- restore from the address -----------------------------------------
  const restored = queryToState(window.location.search, (id) => graph.byId.has(id), (id) => views.get(id)?.steps.length ?? null);
  if (restored.node || restored.from || restored.to || restored.route || restored.view !== 'map') enterExploring();
  state = { ...state, mode: restored.mode };
  modeButton.setAttribute('aria-pressed', String(restored.mode === '3d'));
  if (restored.from) pathFrom.value = restored.from;
  if (restored.to) pathTo.value = restored.to;
  drawings.show('map');
  await drawings.ensure('map');
  await setView(restored.view);
  updateFreeArea();
  if (camera) camera.fit();
  select(restored.node, { announce: false });
  if (restored.from && restored.to) showPath(restored.from, restored.to, { announce: false });
  else state = { ...state, from: restored.from, to: restored.to };
  if (restored.route) showJob(restored.route, restored.step ?? null, { announce: false });
  writeAddress();
  explorer.dataset.ready = 'true';
}
