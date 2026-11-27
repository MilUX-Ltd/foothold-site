// The map's script: fetches the settled graph from this site, starts the
// renderer, and joins the map, the list, the panels, the path controls, the
// jobs and the address together so each drives the others. It also moves the page from the
// landing state (the headline over the map) to the exploring state (the map
// with its panels), and tells the renderer which part of the canvas the panels
// leave free, so the drawing is never fitted underneath them.
//
// Text from the map file is only ever set as textContent, never as markup.
import { connectionsOf, typeLabel } from '../../lib/graph/connections';
import { freeArea, type Rect } from '../../lib/graph/fit';
import { kindName, layerLabel, type Graph } from '../../lib/graph/model';
import { shortestPath, type PathResult } from '../../lib/graph/path';
import { readPayload } from '../../lib/graph/payload';
import { routeLit, routeView, type RouteInput, type RouteStep, type RouteView } from '../../lib/graph/routes';
import { DEFAULT_STATE, queryToState, stateToQuery, type MapState } from '../../lib/graph/url-state';
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

export async function startViewer(): Promise<void> {
  const explorer = byId<HTMLElement>('explorer');
  const canvas = byId<HTMLCanvasElement>('map-canvas');
  const status = byId<HTMLElement>('map-status');
  const waiting = byId<HTMLElement>('map-waiting');
  const waitingText = byId<HTMLElement>('map-waiting-text');
  const search = byId<HTMLInputElement>('map-search');
  const stack = explorer.querySelector<HTMLElement>('.map-stack');
  const tools = explorer.querySelector<HTMLElement>('.map-tools');
  const list = byId<HTMLElement>('node-list');
  const lead = document.getElementById('lead');
  let renderer: MapRenderer | null = null;

  const say = (message: string) => {
    // Clear first so the same message twice is still announced.
    status.textContent = '';
    window.setTimeout(() => (status.textContent = message), 30);
  };

  // ---- the free part of the canvas -----------------------------------------
  // Panels lie over the map on a wide screen. Whatever of theirs overlaps the
  // canvas is cut away, and the drawing is fitted into what is left. On a
  // phone the panels sit below the map, overlap nothing, and the whole canvas
  // is free.
  function updateFreeArea(options: { animate?: boolean } = {}) {
    if (!renderer) return;
    const c = canvas.getBoundingClientRect();
    const container: Rect = { left: 0, top: 0, width: c.width, height: c.height };
    const obstacles: Rect[] = [];
    for (const node of [lead, list, tools, stack]) {
      if (!shown(node)) continue;
      const r = node.getBoundingClientRect();
      obstacles.push({ left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height });
    }
    renderer.setFreeArea(freeArea(container, obstacles, 20), { animate: options.animate && !renderer.reducedMotion });
  }

  // ---- landing and exploring ------------------------------------------------
  const isLanding = () => explorer.dataset.state === 'landing';
  function enterExploring(options: { focusSearch?: boolean } = {}) {
    if (!isLanding()) {
      if (options.focusSearch) search.focus();
      return;
    }
    explorer.dataset.state = 'exploring';
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

  // The list's heading becomes the button that folds it away.
  const listHeading = list.querySelector<HTMLElement>('h2[data-toggles]');
  if (listHeading) {
    const body = byId<HTMLElement>(listHeading.dataset.toggles!);
    const button = el('button', { className: 'list-toggle', text: listHeading.textContent?.trim() ?? '' });
    button.type = 'button';
    button.id = 'list-toggle';
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', body.id);
    listHeading.replaceChildren(button);
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
      list.classList.toggle('is-folded', !open);
      updateFreeArea({ animate: true });
    });
  }

  // ---- the data and the renderer -------------------------------------------
  let graph: Graph;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  try {
    const response = await fetch(DATA_URL, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`The map data answered ${response.status}`);
    const { graph: g, layout } = readPayload(await response.json());
    graph = g;
    renderer = new MapRenderer(canvas, graph, layout, motionQuery.matches);
  } catch (error) {
    waitingText.textContent = `The drawing could not start (${error instanceof Error ? error.message : 'unknown error'}). Every page is still in the list of every page on the map.`;
    return;
  }
  const r = renderer;
  waiting.hidden = true;
  canvas.dataset.motion = motionQuery.matches ? 'reduced' : 'full';
  motionQuery.addEventListener('change', () => {
    r.reducedMotion = motionQuery.matches;
    canvas.dataset.motion = motionQuery.matches ? 'reduced' : 'full';
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
      canvas.focus();
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

  function select(id: string | null, options: { announce?: boolean; move?: boolean } = {}) {
    const { announce = true, move = true } = options;
    // Choosing anything puts the headline away.
    if (id) enterExploring();
    if (state.node) listButtons.get(state.node)?.removeAttribute('aria-current');
    state = { ...state, node: id };
    if (id) listButtons.get(id)?.setAttribute('aria-current', 'true');
    renderSelection(id);
    selectionPanel.hidden = !id;
    r.setHighlight({ selected: id });
    updateFreeArea({ animate: true });
    if (id && move) r.focusOn(id);
    writeAddress();
    if (id && announce) {
      const node = graph.byId.get(id)!;
      const total = connectionsOf(graph, id).total;
      say(`Selected ${node.name}, ${kindName(node.kind)}. ${total} connection${total === 1 ? '' : 's'}, listed in the selected page panel.`);
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
      r.setHighlight({ path: [], pathEdges: [] });
      writeAddress();
      if (from || to) {
        pathResult.append(el('p', { text: 'Choose a page for both ends of the path.' }));
        if (announce) say('Choose a page for both ends of the path.');
      }
      return;
    }
    enterExploring();
    setPanel('path', true);
    const result: PathResult = shortestPath(graph, from, to);
    writeAddress();
    if (!result.nodes.length) {
      r.setHighlight({ path: [], pathEdges: [] });
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
    r.setHighlight({ path: result.nodes, pathEdges: result.edges });
    updateFreeArea();
    r.focusOnAll(result.nodes);
    if (announce) say(`Path found. ${summary} ${result.nodes.map(nameOf).join(', then ')}.`);
  }

  byId<HTMLButtonElement>('path-go').addEventListener('click', () => showPath(pathFrom.value || null, pathTo.value || null));
  byId<HTMLButtonElement>('path-clear').addEventListener('click', () => {
    pathFrom.value = '';
    pathTo.value = '';
    showPath(null, null);
    say('Path cleared.');
  });

  // ---- view mode and camera ---------------------------------------------
  function setMode(mode: MapState['view']) {
    state = { ...state, view: mode };
    r.setMode(mode);
    modeButton.setAttribute('aria-pressed', String(mode === '3d'));
    writeAddress();
  }
  modeButton.addEventListener('click', () => {
    setMode(state.view === '3d' ? '2d' : '3d');
    say(state.view === '3d' ? '3D view. Drag to turn the map; hold shift and drag to move it.' : 'Flat view.');
  });
  byId<HTMLButtonElement>('map-zoom-in').addEventListener('click', () => r.zoomBy(1.3));
  byId<HTMLButtonElement>('map-zoom-out').addEventListener('click', () => r.zoomBy(1 / 1.3));
  byId<HTMLButtonElement>('map-reset').addEventListener('click', () => r.fit({ animate: !r.reducedMotion }));

  // ---- the key's control: every "mentions" and "filed in" line, or only some
  const allEdges = byId<HTMLButtonElement>('edges-all');
  allEdges.addEventListener('click', () => {
    const on = allEdges.getAttribute('aria-pressed') !== 'true';
    allEdges.setAttribute('aria-pressed', String(on));
    r.setHighlight({ showAll: on });
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

  // ---- the canvas: pointer, wheel and keys ---------------------------------
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
    if (state.view === '3d' && !ev.shiftKey) r.turnBy(dx, dy);
    else r.panBy(dx, dy);
  });
  const release = (ev: PointerEvent) => {
    const had = pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (had && !dragged && pointers.size === 0 && ev.type === 'pointerup') {
      const p = local(ev);
      const id = r.nodeAt(p.x, p.y);
      select(id, { move: false });
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    if (hovered === null) return;
    hovered = null;
    canvas.classList.remove('is-pointing');
    r.setHighlight({ hovered: null });
  });
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const p = local(ev);
      r.zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const step = 60;
    const turn = state.view === '3d' && !ev.shiftKey;
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

  // The window or a panel changing size changes the free area.
  const resized = new ResizeObserver((entries) => {
    if (entries.some((e) => e.target === canvas)) r.resize();
    updateFreeArea();
  });
  for (const node of [canvas, lead, list, tools, stack]) if (node) resized.observe(node);

  // ---- jobs: a route from the pack, whole or one step at a time -------------
  // What a job lights, and what the panel lists for each step, comes from
  // src/lib/graph/routes.ts. Here the panel is filled in and kept in step with
  // the map and the address.
  const views = new Map<string, RouteView>();
  for (const input of readRoutes()) {
    if (input.id && input.steps.length && input.steps.every((s) => graph.byId.has(s.skillId))) views.set(input.id, routeView(graph, input));
  }
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

  function stepDetail(view: RouteView, step: RouteStep) {
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
    jobStep.dataset.route = view.id;
  }

  function showJob(routeId: string | null, step: number | null, options: { announce?: boolean; focus?: 'name' | 'step' | 'list' | 'keep'; move?: boolean } = {}) {
    const { announce = true, focus = 'keep', move = true } = options;
    const view = routeId ? views.get(routeId) : undefined;
    if (!view) {
      const was = state.route ?? null;
      const rest: MapState = { node: state.node, from: state.from, to: state.to, view: state.view };
      state = rest;
      shownRoute = null;
      jobView.hidden = true;
      jobsChoose.hidden = false;
      r.setHighlight({ route: null });
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
    const total = view.steps.length;
    const current = step !== null && step >= 1 && step <= total ? view.steps[step - 1] : null;
    state = { ...state, route: view.id, step: current ? current.number : null };
    setPanel('jobs', true);
    jobsChoose.hidden = true;
    jobView.hidden = false;
    if (shownRoute !== view.id) {
      shownRoute = view.id;
      jobName.textContent = view.name;
      jobSteps.replaceChildren();
      for (const s of view.steps) {
        const button = el('button', { className: 'job-step-button', text: s.skill });
        button.type = 'button';
        button.dataset.step = String(s.number);
        button.addEventListener('click', () => showJob(view.id, s.number, { focus: 'step' }));
        jobSteps.append(el('li', {}, button));
      }
    }
    for (const button of jobSteps.querySelectorAll<HTMLButtonElement>('button[data-step]')) {
      if (current && button.dataset.step === String(current.number)) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    jobCount.textContent = current ? `Step ${current.number} of ${total}` : plural(total, 'step', 'steps');
    jobStep.hidden = !current;
    if (current) stepDetail(view, current);
    else jobStep.replaceChildren();
    jobPrev.setAttribute('aria-disabled', String(!current || current.number === 1));
    jobNext.setAttribute('aria-disabled', String(current !== null && current.number === total));
    jobWhole.setAttribute('aria-disabled', String(!current));
    const lit = routeLit(graph, view, current ? current.number : null);
    r.setHighlight({ route: lit });
    writeAddress();
    // Fit to what is lit once the panel has its new size, so nothing lit sits under it.
    updateFreeArea();
    if (move) r.focusOnAll([...lit.strong, ...lit.soft]);
    if (focus === 'name') jobName.focus();
    else if (focus === 'step') (document.getElementById('job-step-heading') ?? jobName).focus();
    if (announce) {
      if (current) say(`Step ${current.number} of ${total}: ${current.skill}. ${current.does}`);
      else say(`${view.name}, the whole job: ${plural(total, 'step', 'steps')}, lit on the map.`);
    }
  }

  const stepNow = () => state.step ?? null;
  const goNext = () => {
    const view = state.route ? views.get(state.route) : undefined;
    if (!view) return;
    const k = stepNow();
    if (k === view.steps.length) return;
    showJob(view.id, k === null ? 1 : k + 1);
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

  // ---- restore from the address -----------------------------------------
  const restored = queryToState(window.location.search, (id) => graph.byId.has(id), (id) => views.get(id)?.steps.length ?? null);
  if (restored.node || restored.from || restored.to || restored.route) enterExploring();
  if (restored.view === '3d') setMode('3d');
  if (restored.from) pathFrom.value = restored.from;
  if (restored.to) pathTo.value = restored.to;
  updateFreeArea();
  select(restored.node, { announce: false });
  if (restored.from && restored.to) showPath(restored.from, restored.to, { announce: false });
  else state = { ...state, from: restored.from, to: restored.to };
  if (restored.route) showJob(restored.route, restored.step ?? null, { announce: false });
  writeAddress();

  r.draw();
  canvas.dataset.ready = 'true';
}
