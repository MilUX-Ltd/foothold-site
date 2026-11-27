// The map page's script: fetches the settled graph from this site, starts the
// renderer, and joins the map, the list, the selection panel, the path
// controls and the address together so each drives the others.
//
// Text from the map file is only ever set as textContent, never as markup.
import { connectionsOf, typeLabel } from '../../lib/graph/connections';
import { kindName, layerLabel, type Graph } from '../../lib/graph/model';
import { shortestPath, type PathResult } from '../../lib/graph/path';
import { readPayload } from '../../lib/graph/payload';
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
  if (!node) throw new Error(`The map page is missing #${id}`);
  return node as T;
}

export async function startViewer(): Promise<void> {
  const canvas = byId<HTMLCanvasElement>('map-canvas');
  const status = byId<HTMLElement>('map-status');
  const waiting = byId<HTMLElement>('map-waiting');
  let graph: Graph;
  let renderer: MapRenderer;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  try {
    const response = await fetch(DATA_URL, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`The map data answered ${response.status}`);
    const { graph: g, layout } = readPayload(await response.json());
    graph = g;
    renderer = new MapRenderer(canvas, graph, layout, motionQuery.matches);
  } catch (error) {
    waiting.textContent = `The drawing could not start (${error instanceof Error ? error.message : 'unknown error'}). Every page is still in the list of every page on the map.`;
    return;
  }
  waiting.hidden = true;
  canvas.dataset.motion = motionQuery.matches ? 'reduced' : 'full';
  motionQuery.addEventListener('change', () => {
    renderer.reducedMotion = motionQuery.matches;
    canvas.dataset.motion = motionQuery.matches ? 'reduced' : 'full';
  });

  const listButtons = new Map<string, HTMLButtonElement>();
  for (const button of document.querySelectorAll<HTMLButtonElement>('#node-list button[data-id]')) {
    if (button.dataset.id) listButtons.set(button.dataset.id, button);
  }
  const selectionBody = byId<HTMLElement>('selection-body');
  const pathFrom = byId<HTMLSelectElement>('path-from');
  const pathTo = byId<HTMLSelectElement>('path-to');
  const pathResult = byId<HTMLElement>('path-result');
  const modeButton = byId<HTMLButtonElement>('map-mode');

  let state: MapState = { ...DEFAULT_STATE };
  const say = (message: string) => {
    // Clear first so the same message twice is still announced.
    status.textContent = '';
    window.setTimeout(() => (status.textContent = message), 30);
  };
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
      pathFrom.value = id;
      pathFrom.focus();
      say(`Path start set to ${node.name}.`);
    });
    const toHere = el('button', { className: 'map-btn', text: 'Path to here' });
    toHere.type = 'button';
    toHere.addEventListener('click', () => {
      pathTo.value = id;
      pathTo.focus();
      say(`Path end set to ${node.name}.`);
    });
    const clear = el('button', { className: 'map-btn', text: 'Clear selection' });
    clear.type = 'button';
    clear.addEventListener('click', () => {
      select(null);
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
        const list = el('ul', { className: 'connection-list' });
        for (const other of group.nodes) {
          const button = el('button', { className: 'link-button', text: other.name });
          button.type = 'button';
          button.dataset.id = other.id;
          button.addEventListener('click', () => {
            select(other.id);
            document.getElementById('selected-name')?.focus();
          });
          list.append(el('li', {}, button));
        }
        block.append(list);
      }
      selectionBody.append(block);
    }
  }

  function select(id: string | null, options: { announce?: boolean; move?: boolean } = {}) {
    const { announce = true, move = true } = options;
    if (state.node) listButtons.get(state.node)?.removeAttribute('aria-current');
    state = { ...state, node: id };
    if (id) listButtons.get(id)?.setAttribute('aria-current', 'true');
    renderSelection(id);
    renderer.setHighlight({ selected: id });
    if (id && move) renderer.focusOn(id);
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
    pathResult.replaceChildren();
    state = { ...state, from, to };
    if (!from || !to) {
      renderer.setHighlight({ path: [], pathEdges: [] });
      writeAddress();
      if (from || to) {
        pathResult.append(el('p', { text: 'Choose a page for both ends of the path.' }));
        if (announce) say('Choose a page for both ends of the path.');
      }
      return;
    }
    const result: PathResult = shortestPath(graph, from, to);
    writeAddress();
    if (!result.nodes.length) {
      renderer.setHighlight({ path: [], pathEdges: [] });
      const message = `No path joins ${nameOf(from)} and ${nameOf(to)} on this map.`;
      pathResult.append(el('p', { className: 'path-none', text: message }));
      if (announce) say(message);
      return;
    }
    const steps = result.edges.length;
    const summary = steps === 0 ? `${nameOf(from)} is both ends of the path.` : `${steps} step${steps === 1 ? '' : 's'} from ${nameOf(from)} to ${nameOf(to)}.`;
    pathResult.append(el('p', { className: 'path-summary', text: summary }));
    const list = el('ol', { className: 'path-steps' });
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
      list.append(item);
    });
    pathResult.append(list);
    renderer.setHighlight({ path: result.nodes, pathEdges: result.edges });
    renderer.focusOnAll(result.nodes);
    if (announce) say(`Path found. ${summary} ${result.nodes.map(nameOf).join(', then ')}.`);
  }

  byId<HTMLButtonElement>('path-go').addEventListener('click', () => showPath(pathFrom.value || null, pathTo.value || null));
  byId<HTMLButtonElement>('path-clear').addEventListener('click', () => {
    pathFrom.value = '';
    pathTo.value = '';
    showPath(null, null);
    say('Path cleared.');
  });

  // ---- view mode --------------------------------------------------------
  function setMode(mode: MapState['view']) {
    state = { ...state, view: mode };
    renderer.setMode(mode);
    modeButton.setAttribute('aria-pressed', String(mode === '3d'));
    writeAddress();
  }
  modeButton.addEventListener('click', () => {
    setMode(state.view === '3d' ? '2d' : '3d');
    say(state.view === '3d' ? '3D view. Drag to turn the map; hold shift and drag to move it.' : 'Flat view.');
  });
  byId<HTMLButtonElement>('map-zoom-in').addEventListener('click', () => renderer.zoomBy(1.3));
  byId<HTMLButtonElement>('map-zoom-out').addEventListener('click', () => renderer.zoomBy(1 / 1.3));
  byId<HTMLButtonElement>('map-reset').addEventListener('click', () => renderer.fit());

  // ---- the list ---------------------------------------------------------
  for (const [id, button] of listButtons) button.addEventListener('click', () => select(id));
  const search = byId<HTMLInputElement>('map-search');
  const count = byId<HTMLElement>('list-count');
  let searchTimer = 0;
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const group of document.querySelectorAll<HTMLElement>('#node-list .list-group')) {
      let inGroup = 0;
      for (const button of group.querySelectorAll<HTMLButtonElement>('button[data-id]')) {
        const match = !q || button.textContent!.toLowerCase().includes(q) || button.dataset.id!.toLowerCase().includes(q);
        button.parentElement!.hidden = !match;
        if (match) inGroup++;
      }
      group.hidden = inGroup === 0;
      shown += inGroup;
    }
    const text = q ? `${shown} of ${graph.nodes.length} pages match` : `${graph.nodes.length} pages`;
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
      const over = renderer.nodeAt(p.x, p.y);
      if (over !== hovered) {
        hovered = over;
        canvas.classList.toggle('is-pointing', over !== null);
        renderer.setHighlight({ hovered: over });
      }
      return;
    }
    pointers.set(ev.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) renderer.zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d;
      dragged = true;
      return;
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
    if (state.view === '3d' && !ev.shiftKey) renderer.turnBy(dx, dy);
    else renderer.panBy(dx, dy);
  });
  const release = (ev: PointerEvent) => {
    const had = pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (had && !dragged && pointers.size === 0 && ev.type === 'pointerup') {
      const p = local(ev);
      const id = renderer.nodeAt(p.x, p.y);
      select(id, { move: false });
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    if (hovered === null) return;
    hovered = null;
    canvas.classList.remove('is-pointing');
    renderer.setHighlight({ hovered: null });
  });
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      const p = local(ev);
      renderer.zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const step = 60;
    const turn = state.view === '3d' && !ev.shiftKey;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (turn ? renderer.turnBy(-step / 2, 0) : renderer.panBy(step, 0)),
      ArrowRight: () => (turn ? renderer.turnBy(step / 2, 0) : renderer.panBy(-step, 0)),
      ArrowUp: () => (turn ? renderer.turnBy(0, -step / 2) : renderer.panBy(0, step)),
      ArrowDown: () => (turn ? renderer.turnBy(0, step / 2) : renderer.panBy(0, -step)),
      '+': () => renderer.zoomBy(1.3),
      '=': () => renderer.zoomBy(1.3),
      '-': () => renderer.zoomBy(1 / 1.3),
      '0': () => renderer.fit(),
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
  new ResizeObserver(() => renderer.resize()).observe(canvas);

  // ---- restore from the address -----------------------------------------
  const restored = queryToState(window.location.search, (id) => graph.byId.has(id));
  if (restored.view === '3d') setMode('3d');
  if (restored.from) pathFrom.value = restored.from;
  if (restored.to) pathTo.value = restored.to;
  select(restored.node, { announce: false });
  if (restored.from && restored.to) showPath(restored.from, restored.to, { announce: false });
  else state = { ...state, from: restored.from, to: restored.to };
  writeAddress();

  renderer.draw();
  canvas.dataset.ready = 'true';
}
