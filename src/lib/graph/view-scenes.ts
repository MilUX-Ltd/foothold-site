// The four views as drawings: each layout turned into an element tree (see
// scene.ts). Geometry comes from the layout modules; this file only decides
// which element draws what and which classes it carries, so the page's
// stylesheet can colour it and the viewer can light it.
//
// What the viewer relies on:
// - Every page drawn is a mark: an element with the class `mk` and the page's
//   id in `data-id`, with its name in a <title>. Marks in the whole map also
//   carry their place in `data-x` and `data-y`. A job's card and its steps
//   carry `data-route` and `data-step`.
// - Every connection drawn is a line: `ln` and `t-<type>`, with its ends in
//   `data-from` and `data-to`.
// - The whole map's labels carry the step of the zoom ladder they show from,
//   as the class `t<step>`; the drawing carries `z0` to `z<step>` for the
//   steps reached, so without script it shows the labels of one middling step.
// - No style attribute anywhere: colours and states come from explorer.css.
import type { Graph } from './model';
import type { RouteInput } from './routes';
import { STATIC_STEP, type DrawnView, type Shade } from './view-common';
import { BUYERS_STYLE, buyersLayout, type Relation } from './view-buyers';
import { textWidth } from './view-text';
import { glanceLayout, GLANCE_STYLE, GLANCE_TOP, type GlanceTile } from './view-glance';
import { jobsLayout } from './view-jobs';
import { pagesLabel, type TreeLayout } from './view-tree';
import { wholeMapLayout } from './view-whole-map';
import { cls, h, type SceneEl } from './view-scene';

const kindClass = (kind: string) => `k-${kind.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
const n1 = (v: number) => Math.round(v * 10) / 10;

/** The words for each relation, as the key and the lists say them. */
export const RELATION_WORDS: Record<Relation, string> = {
  customer: 'the work is for',
  operator: 'run by',
  service: 'belongs to this service',
};

// ---- marks ------------------------------------------------------------------------

function hexagon(r: number): string {
  return Array.from({ length: 6 }, (_, k) => `${n1(r * Math.cos((Math.PI / 3) * k))},${n1(r * Math.sin((Math.PI / 3) * k))}`).join(' ');
}
const diamond = (r: number) => `0,${-r} ${r},0 0,${r} ${-r},0`;
const triangle = (r: number) => `${-r},${n1(r * 0.75)} 0,${n1(-r * 0.95)} ${r},${n1(r * 0.75)}`;

/** A business mark's shape at the origin, by kind. */
function businessShape(kind: string, size: number, filled: boolean): SceneEl {
  if (kind === 'skill') return h('polygon', { class: cls('sh', filled && 'fill'), points: diamond(size * 0.62) });
  if (kind === 'route') return h('polygon', { class: 'sh', points: triangle(size * 0.66) });
  if (kind === 'vault') return h('polygon', { class: 'sh', points: hexagon(size * 0.75) });
  return h('rect', { class: cls('sh', filled && 'fill'), x: -size / 2, y: -size / 2, width: size, height: size });
}

// ---- the whole map ----------------------------------------------------------------

function treeDrawing(graph: Graph, tree: TreeLayout, at: { x: number; y: number }, options: { links: boolean; place: boolean }): SceneEl[] {
  // Lines from the skills a job uses are always drawn; the rest appear when a skill or folder is pointed at or chosen.
  const inRoute = new Set(tree.groups.flatMap((g) => g.marks.filter((m) => m.inRoute).map((m) => m.id)));
  const T = (x: number, y: number) => ({ x: n1(at.x + x), y: n1(at.y + y) });
  const out: SceneEl[] = [];
  // Headings: the tree's own over the folders, the rest over the jobs and skills.
  const side: SceneEl[] = [];
  for (const hd of tree.headings) (hd.x < tree.rail ? out : side).push(h('text', { class: 'tt-head', x: T(hd.x, 0).x, y: T(0, hd.y).y }, hd.text.toUpperCase()));
  // The tree's guide lines: from each parent's mark down and across to each child's.
  const rows = new Map(tree.rows.map((r) => [r.id, r]));
  const guides: string[] = [];
  for (const r of tree.rows) {
    const p = r.parent ? rows.get(r.parent) : tree.vault;
    if (!p) continue;
    const a = T(p.x, p.y + 8);
    const b = T(r.x - 9, r.y);
    guides.push(`M${a.x},${a.y} V${b.y} H${b.x}`);
  }
  if (guides.length) out.push(h('path', { class: 'tree-guide', d: guides.join(' ') }));
  // Leaders from each used folder's name to its port on the rail.
  const leaders: string[] = [];
  for (const r of tree.rows) {
    if (!r.used || !options.links) continue;
    const a = T(r.nameEnd + 6, r.y);
    const b = T(tree.rail, r.y);
    if (b.x > a.x) leaders.push(`M${a.x},${a.y} H${b.x}`);
  }
  if (leaders.length) out.push(h('path', { class: 'leader', d: leaders.join(' ') }));
  if (options.links) {
    out.push(
      h(
        'g',
        { class: 'tree-lines tree-side di-3' },
        tree.links.map((l) => h('path', { class: cls('ln', `t-${l.type}`, !inRoute.has(l.from) && 'on-ask'), 'data-from': l.from, 'data-to': l.to, d: shift(l.d, at) })),
        tree.steps.map((l) => h('path', { class: 'ln t-step', 'data-from': l.from, 'data-to': l.to, 'data-route': l.from, d: shift(l.d, at) })),
      ),
    );
  }
  const texts: SceneEl[] = [];
  const marks: SceneEl[] = [];
  const sideTexts: SceneEl[] = [];
  const sideMarks: SceneEl[] = [];
  const mark = (id: string, kind: string, x: number, y: number, size: number, filled: boolean, extra: Record<string, string | number> = {}) => {
    const p = T(x, y);
    const node = graph.byId.get(id);
    const into = options.links && (kind === 'skill' || kind === 'route') ? sideMarks : marks;
    into.push(
      h(
        'g',
        { class: cls('mk', 'tree-mk', kindClass(kind), 'di-2'), 'data-id': id, 'data-x': options.place ? p.x : undefined, 'data-y': options.place ? p.y : undefined, transform: `translate(${p.x} ${p.y})`, ...extra },
        h('title', {}, node?.name ?? id),
        h('g', { class: 'ts' }, h('circle', { class: 'hit', r: size }), businessShape(kind, size + 1, filled), h('circle', { class: 'ring', r: size + 3 })),
      ),
    );
  };
  if (tree.vault) {
    mark(tree.vault.id, 'vault', tree.vault.x, tree.vault.y, 12, false);
    const p = T(tree.vault.x + 18, tree.vault.y + 5);
    texts.push(h('text', { class: 'tt tt-top', x: p.x, y: p.y }, tree.vault.name));
  }
  for (const r of tree.rows) {
    mark(r.id, 'folder', r.x, r.y, 11, r.used);
    const p = T(r.x + 14, r.y + 5);
    texts.push(h('text', { class: cls('tt', r.depth === 0 ? 'tt-top' : 'tt-sub'), x: p.x, y: p.y }, r.name));
    if (r.count) {
      const c = T(tree.rail - 12, r.y + 4);
      texts.push(h('text', { class: 'tt-count', x: c.x, y: c.y, 'text-anchor': 'end' }, pagesLabel(r.count)));
    }
    if (r.used && options.links) {
      const port = T(tree.rail, r.y);
      marks.push(h('rect', { class: 'port', x: port.x, y: port.y - 2.5, width: 5, height: 5 }));
    }
  }
  for (const j of tree.jobs) {
    mark(j.id, 'route', j.x, j.y, 11, false);
    const p = T(j.x + 16, j.y + 5);
    (options.links ? sideTexts : texts).push(h('text', { class: 'tt tt-job', x: p.x, y: p.y }, j.name));
  }
  for (const g of tree.groups) {
    for (const m of g.marks) mark(m.id, 'skill', m.x, m.y, 10, m.inRoute);
  }
  out.push(h('g', { class: 'tree-text' }, texts), h('g', { class: 'tree-marks' }, marks));
  if (options.links) out.push(h('g', { class: 'tree-side' }, side, sideTexts, sideMarks));
  else out.push(...side, h('g', { class: 'tree-text' }, sideTexts), h('g', { class: 'tree-marks' }, sideMarks));
  return out;
}

/** Moves a path made in the tree's own space onto the map. */
function shift(d: string, at: { x: number; y: number }): string {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (v) => String(n1(Number(v) + (i++ % 2 === 0 ? at.x : at.y))));
}

export function mapScene(graph: Graph, routes: readonly RouteInput[]): SceneEl {
  const L = wholeMapLayout(graph, routes);
  const W = L.wheelAt;
  const byId = new Map(L.wheel.marks.map((m) => [m.id, m]));
  const arcLabels = L.labels.filter((l) => l.arc);
  const wheelMarks = L.wheel.marks.map((m) => {
    const node = graph.byId.get(m.id)!;
    const x = n1(W.x + m.x);
    const y = n1(W.y + m.y);
    const centre = m.id === L.wheel.centre;
    const example = m.kind === 'example-business';
    const r = centre ? 12 : example ? 7 : m.r;
    return h(
      'g',
      { class: cls('mk', 'wheel-mk', kindClass(m.kind), m.quiet && !example && 'q', centre && 'centre', 'di-2', `b${m.band}`), 'data-id': m.id, 'data-x': x, 'data-y': y, transform: `translate(${x} ${y})` },
      h('title', {}, node.name),
      h(
        'g',
        { class: 's' },
        h('circle', { class: 'hit', r: n1(Math.max(r + 3, 7)) }),
        h('circle', { class: 'sh', r }),
        example && h('circle', { class: 'dot', r: 3 }),
        h('circle', { class: 'ring', r: n1(r + 3.5) }),
      ),
    );
  });
  const labels = L.labels.map((l) => {
    const tier = `t${l.tier}`;
    if (l.arc) {
      return h('text', { class: cls('lb', 'lb-arc', tier, 'di-4'), dy: '0.36em' }, h('textPath', { href: `#arc-${l.id.replace(/[^a-z0-9-]/gi, '-')}`, startOffset: '50%', 'text-anchor': 'middle' }, l.text));
    }
    const mark = byId.get(l.id);
    return h(
      'g',
      { class: cls('lb', l.kind === 'hub' ? 'lb-hub' : 'lb-grp', tier, 'di-4', mark && mark.id === L.wheel.centre && 'lb-centre'), 'data-for': l.kind === 'hub' ? l.id : undefined, transform: `translate(${l.x} ${l.y})` },
      h('g', { class: 's' }, h('text', { x: l.tx, y: l.ty, 'text-anchor': l.align }, l.text)),
    );
  });
  // A rule along each group's arc, just outside its marks.
  const arcPath = (r: number, a0: number, a1: number) => {
    const p = (a: number) => `${n1(W.x + r * Math.cos(a))},${n1(W.y + r * Math.sin(a))}`;
    return `M${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
  };
  const groupRules = L.wheel.groups.map((g) => h('path', { class: cls('garc', `g-${g.ring}`), d: arcPath(n1(g.r1 + (g.ring === 'outer' ? 8 : 7)), g.a0 + 0.01, g.a1 - 0.01) }));
  const top = [...L.bands].sort((a, b) => a.end.y - b.end.y)[0];
  // The title sits where the bands arrive, clear of the group names round the wheel.
  const filedLabelX = top ? n1(L.treeAt.x - 14) : W.x;
  const bandsTop = top ? n1(top.end.y - 18) : W.y;
  const steps = Array.from({ length: STATIC_STEP + 1 }, (_, i) => `z${i}`);

  return h(
    'svg',
    {
      id: 'map-drawing',
      class: cls('view-svg', 'mv', ...steps),
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${L.width} ${L.height}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'group',
      'aria-labelledby': 'map-drawing-title',
      'data-width': L.width,
      'data-height': L.height,
      'data-wheel': `${W.x} ${W.y} ${L.wheel.radius}`,
      'data-tree': `${L.treeAt.x} ${L.treeAt.y} ${L.tree.width} ${L.tree.height}`,
      'data-folders': n1(L.treeAt.x + L.tree.rail + 16),
      'data-frames': 0,
    },
    h('title', { id: 'map-drawing-title' }, 'The whole map: the defence reference as a wheel around the Ministry of Defence, joined to your business structure. Every page on it is also in the list of every page.'),
    h(
      'defs',
      {},
      arcLabels.map((l) => h('path', { id: `arc-${l.id.replace(/[^a-z0-9-]/gi, '-')}`, d: l.arc!.d })),
    ),
    h(
      'g',
      { class: 'world' },
      h('text', { class: 'layer-title di-1', x: n1(W.x - L.wheel.radius - 60), y: 26 }, 'Defence reference'.toUpperCase()),
      h('path', { class: 'layer-rule di-1', d: `M${n1(W.x - L.wheel.radius - 60)},35 h26` }),
      h('g', { class: 'guides di-1' }, L.wheel.guides.map((r) => h('circle', { class: 'guide', cx: W.x, cy: W.y, r }))),
      h('g', { class: 'garcs di-1' }, groupRules),
      h(
        'g',
        { class: 'bands di-3' },
        L.bands.map((b) => h('path', { class: 'band', 'data-id': b.folder, d: b.d }, h('title', {}, `${pagesLabel(b.count)} filed in ${b.folder}`))),
        L.bands.length ? h('text', { class: 'filed-title', x: filedLabelX, y: bandsTop, 'text-anchor': 'end' }, 'Filed in your vault'.toUpperCase()) : null,
      ),
      h(
        'g',
        { class: 'lines di-3' },
        L.wheel.edges.map((e) => h('path', { class: cls('ln', `t-${e.type}`), 'data-from': e.from, 'data-to': e.to, d: e.d })),
      ),
      h('g', { class: 'biz' }, treeDrawing(graph, L.tree, L.treeAt, { links: true, place: true })),
      h('g', { class: 'marks' }, wheelMarks),
      h('g', { class: 'path-layer' }),
      h('g', { class: 'labels' }, labels),
    ),
  );
}

/** The business tree on its own, as the phone sets it beneath the wheel. */
export function narrowTreeScene(graph: Graph, routes: readonly RouteInput[]): SceneEl {
  const L = wholeMapLayout(graph, routes);
  const t = L.narrowTree;
  return h(
    'svg',
    { class: 'view-svg mv-narrow', xmlns: 'http://www.w3.org/2000/svg', viewBox: `-4 -4 ${t.width + 8} ${t.height + 8}`, role: 'group', 'aria-label': 'Your business structure: every folder, the jobs and the skills' },
    treeDrawing(graph, t, { x: 0, y: 0 }, { links: false, place: false }),
  );
}

// ---- who buys -----------------------------------------------------------------------

/** A short line in the line's own pattern, for keys and lists. */
function swatch(type: string): SceneEl {
  return h('svg', { class: 'swatch', viewBox: '0 0 34 10', width: 34, height: 10, 'aria-hidden': 'true', focusable: 'false' }, h('path', { class: `ln t-${type}`, d: 'M1,5 H33' }));
}

function inlineKey(items: { type: string; words: string }[]): SceneEl {
  return h('ul', { class: 'view-key' }, items.map((i) => h('li', {}, swatch(i.type), i.words)));
}

function sourceShape(kind: string): SceneEl {
  if (kind === 'portal') return h('rect', { class: 'sh', x: -4.5, y: -4.5, width: 9, height: 9 });
  if (kind === 'event-series') return h('polygon', { class: 'sh', points: triangle(5.5) });
  return h('circle', { class: 'sh', r: 4.8 });
}

export function buyersScene(graph: Graph): SceneEl {
  const L = buyersLayout(graph);
  const name = (id: string) => graph.byId.get(id)!.name;
  const side = (rows: typeof L.left, anchor: 'start' | 'end') =>
    rows.map((r) => {
      const w = n1(textWidth(r.text, BUYERS_STYLE.name) + 26);
      return h(
        'g',
        { class: cls('mk', 'bv-row', kindClass(r.kind)), 'data-id': r.id, transform: `translate(${r.x} ${r.y})` },
        h('title', {}, r.name),
        h('rect', { class: 'hit', x: anchor === 'end' ? -w : -10, y: -10, width: w + 10, height: 20 }),
        sourceShape(r.kind),
        h('circle', { class: 'ring', r: 8.5 }),
        h('text', { class: 'bv-name', x: anchor === 'end' ? -12 : 12, y: 4.5, 'text-anchor': anchor }, r.text),
      );
    });
  const boxW = L.columns.middleRight - L.columns.middleLeft;
  const middle = L.middle.map((r) =>
    h(
      'g',
      { class: cls('mk', 'bv-body', kindClass(r.kind)), 'data-id': r.id, transform: `translate(${r.x} ${r.y})` },
      h('title', {}, r.name),
      h('rect', { class: 'shadow', x: 4, y: n1(-r.height / 2 + 4), width: boxW, height: r.height }),
      h('rect', { class: 'box', x: 0, y: n1(-r.height / 2), width: boxW, height: r.height }),
      h('rect', { class: 'bar', x: 0, y: n1(-r.height / 2), width: 6, height: r.height }),
      h('rect', { class: 'ring', x: -4, y: n1(-r.height / 2 - 4), width: boxW + 8, height: n1(r.height + 8) }),
      h('text', { class: 'bv-body-name', x: 16, y: 5 }, r.text),
      h('text', { class: 'bv-count', x: boxW - 10, y: 4, 'text-anchor': 'end' }, String(r.count)),
    ),
  );
  const head = (text: string, x: number, anchor: string) => h('text', { class: 'col-head', x, y: L.headingY, 'text-anchor': anchor }, text.toUpperCase());

  // The list set at phone width: each programme, then each framework or portal, with the bodies beneath it by relation.
  const listOf = (rows: typeof L.left, heading: string) =>
    h(
      'section',
      { class: 'vl-section' },
      h('h3', { class: 'vl-heading' }, heading, ' ', h('span', { class: 'vl-count' }, String(rows.length))),
      h(
        'ul',
        { class: 'vl' },
        rows.map((r) => {
          const by = (type: Relation) => L.links.filter((l) => l.from === r.id && l.type === type).map((l) => l.to);
          return h(
            'li',
            { class: 'vl-item' },
            h('button', { type: 'button', class: 'vl-btn vl-name', 'data-id': r.id }, r.name),
            h(
              'dl',
              { class: 'vl-rels' },
              (['customer', 'operator', 'service'] as Relation[]).flatMap((type) => {
                const ids = by(type);
                if (!ids.length) return [];
                return [h('dt', { class: 'vl-rel' }, swatch(type), RELATION_WORDS[type]), h('dd', {}, h('ul', { class: 'vl-names' }, ids.map((id) => h('li', {}, h('button', { type: 'button', class: 'vl-btn', 'data-id': id }, name(id))))))];
              }),
            ),
          );
        }),
      ),
    );

  return h(
    'div',
    { class: 'vp-inner vp-buyers' },
    h(
      'header',
      { class: 'view-head' },
      h('p', { class: 'mono kicker' }, 'Defence reference'),
      h('h2', { class: 'view-title' }, 'Who buys, and how you reach them', h('span', { class: 'stop' }, '.')),
      h('p', { class: 'view-sub' }, `${L.leftOut.toLocaleString('en-GB')} defence pages have none of these connections yet, so they are not drawn here. `, h('a', { href: '#node-list', class: 'list-link' }, 'Find them in the list of every page.')),
    ),
    inlineKey(RELATION_TYPES_FOR_KEY.map((type) => ({ type, words: RELATION_WORDS[type] }))),
    h(
      'svg',
      { class: 'view-svg bv', xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${L.width} ${L.height}`, role: 'group', 'aria-label': 'Who buys: programmes on the left, the bodies the work is for or that run it in the middle, frameworks and portals on the right.' },
      head(`Programmes · ${L.left.length}`, L.columns.left, 'end'),
      head(`Who the work is for, and who runs it · ${L.middle.length}`, (L.columns.middleLeft + L.columns.middleRight) / 2, 'middle'),
      head(`Frameworks and portals · ${L.right.length}`, L.columns.right, 'start'),
      h('g', { class: 'lines' }, L.links.map((l) => h('path', { class: cls('ln', `t-${l.type}`), 'data-from': l.from, 'data-to': l.to, d: l.d }))),
      h('g', { class: 'bv-left' }, side(L.left, 'end')),
      h('g', { class: 'bv-middle' }, middle),
      h('g', { class: 'bv-right' }, side(L.right, 'start')),
    ),
    h('div', { class: 'view-list bv-list' }, listOf(L.left, 'Programmes'), listOf(L.right, 'Frameworks and portals')),
  );
}

const RELATION_TYPES_FOR_KEY: Relation[] = ['customer', 'operator', 'service'];

// ---- how a job runs --------------------------------------------------------------------

export function jobsScene(graph: Graph, routes: readonly RouteInput[]): SceneEl {
  const L = jobsLayout(graph, routes);
  const cards = L.jobs.map((j) =>
    h(
      'g',
      { class: 'mk job-card k-route', 'data-id': j.id, 'data-route': j.id, transform: `translate(${j.x} ${j.y})` },
      h('title', {}, j.name),
      h('rect', { class: 'shadow', x: 6, y: 6, width: j.width, height: j.height }),
      h('rect', { class: 'box', x: 0, y: 0, width: j.width, height: j.height }),
      h('rect', { class: 'ring', x: -5, y: -5, width: j.width + 10, height: j.height + 10 }),
      h(
        'text',
        { class: 'job-name' },
        j.lines.map((line, i) => h('tspan', { x: 20, y: n1(j.height / 2 - ((j.lines.length - 1) * 25) / 2 + i * 25 + 7) }, line)),
      ),
    ),
  );
  const steps = L.steps.map((s) =>
    h(
      'g',
      { class: 'mk step k-skill', 'data-id': s.skillId, 'data-route': s.route, 'data-step': s.number, transform: `translate(${s.x} ${s.y})` },
      h('title', {}, `${s.skill}, step ${s.number}`),
      h('rect', { class: 'hit', x: -14, y: -26, width: n1(s.portX - s.x + 20), height: 46 }),
      h('polygon', { class: 'sh fill', points: diamond(10) }),
      h('circle', { class: 'ring', r: 15 }),
      h('text', { class: 'step-no', x: 20, y: -9 }, `Step ${s.number}`.toUpperCase()),
      h('text', { class: 'step-skill', x: 20, y: 12 }, s.skill),
      h('circle', { class: 'port-dot', cx: n1(s.portX - s.x), cy: 7, r: 2.6 }),
    ),
  );
  const folders = L.folders.map((f) =>
    h(
      'g',
      { class: cls('mk', 'job-folder', kindClass(f.kind)), 'data-id': f.id, transform: `translate(${f.x} ${f.y})` },
      h('title', {}, f.label),
      h('rect', { class: 'hit', x: -14, y: -14, width: n1(f.nameEnd - f.x + 20), height: 28 }),
      f.kind === 'vault' ? h('polygon', { class: 'sh', points: hexagon(9) }) : h('rect', { class: 'sh fill', x: -7, y: -7, width: 14, height: 14 }),
      h('circle', { class: 'ring', r: 13 }),
      h('text', { class: 'folder-name', x: 18, y: 5 }, f.label),
    ),
  );
  const counts = L.folders
    .filter((f) => f.count)
    .map((f) =>
      h(
        'g',
        { class: 'count-row', 'data-for': f.id },
        h('path', { class: 'leader', d: `M${n1(f.nameEnd + 8)},${f.y} H${L.columns.count - 12}` }),
        h('text', { class: 'count-num', x: L.columns.count, y: n1(f.y + 9) }, f.count.toLocaleString('en-GB'), h('tspan', { class: 'count-what', dx: 10, dy: -4 }, f.breakdown)),
      ),
    );
  const head = (text: string, x: number) => h('text', { class: 'col-head', x, y: L.headingY }, text.toUpperCase());

  const list = h(
    'ol',
    { class: 'view-list jv-list' },
    L.jobs.map((j) =>
      h(
        'li',
        { class: 'jv-job' },
        h('h3', { class: 'jv-name' }, h('button', { type: 'button', class: 'vl-btn', 'data-route': j.id, 'data-id': j.id }, j.name)),
        h(
          'ol',
          { class: 'jv-steps' },
          L.steps
            .filter((s) => s.route === j.id)
            .map((s) =>
              h(
                'li',
                { class: 'jv-step' },
                h('button', { type: 'button', class: 'vl-btn jv-skill', 'data-route': s.route, 'data-step': s.number, 'data-id': s.skillId }, h('span', { class: 'mono jv-no' }, `Step ${s.number}`), ' ', s.skill),
                h('p', { class: 'jv-does' }, s.does),
                h(
                  'ul',
                  { class: 'jv-folders' },
                  L.links
                    .filter((l) => l.route === s.route && l.step === s.number)
                    .map((l) => {
                      const f = L.folders.find((x) => x.id === l.folder)!;
                      return h(
                        'li',
                        {},
                        h('span', { class: 'vl-rel' }, swatch(l.type), l.type),
                        ' ',
                        h('button', { type: 'button', class: 'vl-btn', 'data-id': f.id }, f.label),
                        f.count ? h('span', { class: 'jv-count' }, ` ${pagesLabel(f.count)}: ${f.breakdown}`) : null,
                      );
                    }),
                ),
              ),
            ),
        ),
      ),
    ),
  );

  return h(
    'div',
    { class: 'vp-inner vp-jobs' },
    h('header', { class: 'view-head' }, h('p', { class: 'mono kicker' }, 'Your business structure'), h('h2', { class: 'view-title' }, 'How a job runs', h('span', { class: 'stop' }, '.'))),
    inlineKey([
      { type: 'reads', words: 'reads' },
      { type: 'writes', words: 'writes' },
      { type: 'step', words: 'a step in the job' },
    ]),
    h(
      'svg',
      { class: 'view-svg jv', xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${L.width} ${L.height}`, role: 'group', 'aria-label': 'How a job runs: each job, the skill for each step, the folders it reads and writes, and what the pack has already put there.' },
      head('The job', L.columns.job),
      head('The skill for each step', L.columns.skill - 10),
      head('Folders it reads and writes', L.columns.folder - 8),
      head('What the pack has already put there', L.columns.count),
      h(
        'g',
        { class: 'lines' },
        L.joins.map((j) => h('path', { class: 'ln t-step', 'data-route': j.route, 'data-step': j.step, d: j.d })),
        L.links.map((l) => h('path', { class: cls('ln', `t-${l.type}`), 'data-route': l.route, 'data-step': l.step, 'data-from': l.skillId, 'data-to': l.folder, d: l.d })),
      ),
      h('g', { class: 'counts' }, counts),
      h('g', { class: 'cards' }, cards),
      h('g', { class: 'steps' }, steps),
      h('g', { class: 'folders' }, folders),
    ),
    list,
  );
}

// ---- at a glance --------------------------------------------------------------------------

const SHADE_WORDS = ['none yet', 'at least one', 'five or more named connections'];

function tileShape(t: GlanceTile, size: number): SceneEl {
  const c = size / 2;
  if (t.shape === 'diamond') return h('polygon', { class: 'sh', points: `${c},0.8 ${size - 0.8},${c} ${c},${size - 0.8} 0.8,${c}` });
  if (t.shape === 'triangle') return h('polygon', { class: 'sh', points: `1,${size - 1.5} ${c},1.5 ${size - 1},${size - 1.5}` });
  if (t.shape === 'hexagon') return h('polygon', { class: 'sh', points: hexagon(c - 0.8).split(' ').map((p) => p.split(',').map((v) => n1(Number(v) + c)).join(',')).join(' ') });
  return h('rect', { class: 'sh', x: 1, y: 1, width: size - 2, height: size - 2 });
}

function shadeSwatch(shade: Shade): SceneEl {
  return h('svg', { class: cls('swatch-tile', 'gl-tile', `sh-${shade}`, 'k-organisation'), viewBox: '0 0 18 18', width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false' }, h('rect', { class: 'sh', x: 1, y: 1, width: 16, height: 16 }));
}

export function glanceScene(graph: Graph): SceneEl {
  const L = glanceLayout(graph);
  const { tile } = GLANCE_STYLE;
  const group = (g: (typeof L.groups)[number]) =>
    h(
      'section',
      { class: cls('gl-group', `gl-${g.side}`, g.names.length > 0 && 'gl-named'), 'data-group': g.key },
      h(
        'h4',
        { class: 'gl-head' },
        h('span', { class: 'gl-label' }, g.label),
        ' ',
        h('span', { class: 'gl-count' }, String(g.count)),
        g.shades[0] && g.count > 1 ? h('span', { class: 'gl-thin' }, `${g.shades[0]} none yet`) : null,
      ),
      h(
        'svg',
        { class: 'gl-tiles', xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 ${GLANCE_TOP} ${g.width} ${n1(g.height - GLANCE_TOP)}`, width: g.width, height: n1(g.height - GLANCE_TOP), role: 'group', 'aria-label': `${g.label}: ${g.count} page${g.count === 1 ? '' : 's'}` },
        g.tiles.map((t) =>
          h(
            'g',
            { class: cls('mk', 'gl-tile', `sh-${t.shade}`, kindClass(t.kind)), 'data-id': t.id, transform: `translate(${t.x} ${t.y})` },
            h('title', {}, graph.byId.get(t.id)!.name),
            h('rect', { class: 'hit', x: -2, y: -2, width: tile + 4, height: tile + 4 }),
            tileShape(t, tile),
            h('rect', { class: 'ring', x: -3, y: -3, width: tile + 6, height: tile + 6 }),
          ),
        ),
        g.names.map((n) => h('text', { class: 'gl-name', x: n.x, y: n.y }, n.text)),
      ),
    );
  const sideBlock = (side: 'defence' | 'business', title: string) => {
    const groups = L.groups.filter((g) => g.side === side);
    const total = groups.reduce((a, g) => a + g.count, 0);
    const shades = [0, 1, 2].map((s) => groups.reduce((a, g) => a + g.shades[s], 0));
    return h(
      'section',
      { class: `gl-side gl-side-${side}` },
      h('h3', { class: 'mono gl-side-head' }, `${title} · ${total.toLocaleString('en-GB')} pages`),
      h(
        'p',
        { class: 'gl-summary' },
        [2, 1, 0].map((s) => h('span', { class: 'gl-sum' }, shadeSwatch(s as Shade), h('strong', {}, shades[s].toLocaleString('en-GB')), ` ${SHADE_WORDS[s]}`)),
      ),
      h('div', { class: 'gl-groups' }, groups.map(group)),
    );
  };
  return h(
    'div',
    { class: 'vp-inner vp-glance' },
    h('header', { class: 'view-head' }, h('p', { class: 'mono kicker' }, 'One mark for every page'), h('h2', { class: 'view-title' }, 'Everything in the pack, at a glance', h('span', { class: 'stop' }, '.'))),
    h('ul', { class: 'view-key' }, [2, 1, 0].map((s) => h('li', {}, shadeSwatch(s as Shade), SHADE_WORDS[s]))),
    h('div', { class: 'gl-sides' }, sideBlock('defence', 'Defence reference'), sideBlock('business', 'Your business structure')),
  );
}

// ---- by name ----------------------------------------------------------------------------------

/** The drawing for a view, as the build writes it. The whole map's drawing is set in the page; the rest are fetched. */
export function sceneFor(view: DrawnView, graph: Graph, routes: readonly RouteInput[]): SceneEl {
  if (view === 'map') return h('div', { class: 'vp-inner vp-map' }, mapScene(graph, routes), narrowTreeScene(graph, routes));
  if (view === 'buyers') return buyersScene(graph);
  if (view === 'jobs') return jobsScene(graph, routes);
  return glanceScene(graph);
}
