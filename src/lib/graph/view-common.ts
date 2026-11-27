// What the four drawn views share: their names, what counts as a named
// connection, how pages are grouped into families, the zoom ladder the whole
// map's labels are placed for, and box arithmetic. Pure TypeScript with no
// browser, so the build, the viewer and the tests share it.
import { compareText, kindLabel, type Graph, type GraphNode } from './model';

/** Every view a visitor can choose. The first four are drawn at build time; the network is the free-form canvas. */
export type ViewName = 'map' | 'buyers' | 'jobs' | 'glance' | 'network';

/** The views drawn as SVG when the site is built, in the switcher's order. */
export const DRAWN_VIEWS = ['map', 'buyers', 'jobs', 'glance'] as const;
export type DrawnView = (typeof DRAWN_VIEWS)[number];

export const VIEW_NAMES: readonly ViewName[] = [...DRAWN_VIEWS, 'network'];

/** What the switcher calls each view. */
export const VIEW_LABELS: Record<ViewName, string> = {
  map: 'The whole map',
  buyers: 'Who buys',
  jobs: 'How a job runs',
  glance: 'At a glance',
  network: 'Network',
};

export function isViewName(value: unknown): value is ViewName {
  return typeof value === 'string' && (VIEW_NAMES as readonly string[]).includes(value);
}

// ---- named connections ------------------------------------------------------
// A named connection is one an author wrote to say how two pages relate: a
// parent, a customer, an operator, a service, a read, a write, a step. A page
// that only mentions another in its text, or is only filed in a folder, has
// no named connection from that.

const UNNAMED_TYPES: readonly string[] = ['mentions', 'in_folder'];

export function isNamedType(type: string): boolean {
  return !UNNAMED_TYPES.includes(type);
}

/** How many named connections each node has, counted once per edge at each end. */
export function namedDegree(graph: Graph): Map<string, number> {
  const degree = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) {
    if (!isNamedType(e.type)) continue;
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  return degree;
}

/** The ids of a node's named neighbours. */
export function namedNeighbours(graph: Graph, id: string): Set<string> {
  const out = new Set<string>();
  for (const l of graph.links.get(id) ?? []) if (isNamedType(l.edge.type)) out.add(l.other);
  return out;
}

/** How a page is shaded at a glance: 2 for five or more named connections, 1 for at least one, 0 for none yet. */
export type Shade = 0 | 1 | 2;
export function shadeFor(count: number): Shade {
  return count >= 5 ? 2 : count >= 1 ? 1 : 0;
}

// ---- families ---------------------------------------------------------------
// Defence pages are grouped by what they are. Most kinds say so themselves; an
// organisation says so by the folder it sits in. Anything else falls into a
// group named after its kind, so no page is ever left out.

export type Ring = 'centre' | 'middle' | 'outer';

export interface Family {
  key: string;
  label: string;
  ring: Ring;
  /** Order around its ring, and down the page at a glance. */
  order: number;
}

const FAMILIES: Record<string, Family> = {
  mod: { key: 'mod', label: 'Ministry of Defence family', ring: 'centre', order: 0 },
  programmes: { key: 'programmes', label: 'Programmes', ring: 'middle', order: 1 },
  frameworks: { key: 'frameworks', label: 'Frameworks', ring: 'middle', order: 2 },
  portals: { key: 'portals', label: 'Portals', ring: 'middle', order: 3 },
  events: { key: 'events', label: 'Events', ring: 'middle', order: 4 },
  // Clockwise from just below the gap on the right: the small groups sit
  // between large ones, where their names have room.
  government: { key: 'government', label: 'Government', ring: 'outer', order: 10 },
  example: { key: 'example', label: 'Example business', ring: 'outer', order: 11 },
  investors: { key: 'investors', label: 'Investors', ring: 'outer', order: 12 },
  academia: { key: 'academia', label: 'Academia', ring: 'outer', order: 13 },
  trade: { key: 'trade', label: 'Trade bodies', ring: 'outer', order: 14 },
  allies: { key: 'allies', label: 'Allies', ring: 'outer', order: 15 },
  clusters: { key: 'clusters', label: 'Regional clusters', ring: 'outer', order: 16 },
  networks: { key: 'networks', label: 'Networks', ring: 'outer', order: 17 },
};

const BY_KIND: Record<string, string> = {
  programme: 'programmes',
  framework: 'frameworks',
  portal: 'portals',
  'event-series': 'events',
  cluster: 'clusters',
  network: 'networks',
  'example-business': 'example',
};

const ORGANISATION_FOLDERS: [string, string][] = [
  ['CRM/organisations/mod/', 'mod'],
  ['CRM/organisations/government/', 'government'],
  ['CRM/organisations/foreign government/', 'allies'],
  ['CRM/organisations/academia/', 'academia'],
  ['CRM/organisations/trade bodies/', 'trade'],
  ['CRM/organisations/investors/', 'investors'],
];

/** The family a defence page belongs to. */
export function familyOf(node: GraphNode): Family {
  const byKind = BY_KIND[node.kind];
  if (byKind) return FAMILIES[byKind];
  if (node.kind === 'organisation') {
    for (const [prefix, key] of ORGANISATION_FOLDERS) if (node.id.startsWith(prefix)) return FAMILIES[key];
  }
  return { key: `kind:${node.kind}`, label: kindLabel(node.kind), ring: 'outer', order: 30 };
}

/** The defence families present in the graph, in order, each with its pages sorted by id. */
export function defenceFamilies(graph: Graph): { family: Family; nodes: GraphNode[] }[] {
  const groups = new Map<string, { family: Family; nodes: GraphNode[] }>();
  for (const node of graph.nodes) {
    if (node.layer !== 'defence') continue;
    const family = familyOf(node);
    const group = groups.get(family.key) ?? { family, nodes: [] };
    group.nodes.push(node);
    groups.set(family.key, group);
  }
  return [...groups.values()].sort((a, b) => a.family.order - b.family.order || compareText(a.family.key, b.family.key));
}

// ---- skills -----------------------------------------------------------------

export interface SkillGroup {
  key: string;
  label: string;
  order: number;
}

const SKILL_GROUPS: Record<string, SkillGroup> = {
  'business-skills': { key: 'business-skills', label: 'Business skills', order: 0 },
  'crm-skills': { key: 'crm-skills', label: 'Contacts skills', order: 1 },
  'ops-skills': { key: 'ops-skills', label: 'Operations skills', order: 2 },
  'content-skills': { key: 'content-skills', label: 'Content skills', order: 3 },
  'brand-skills': { key: 'brand-skills', label: 'Brand skills', order: 4 },
  'meta-skills': { key: 'meta-skills', label: 'Thinking tools', order: 5 },
  'pm-skills': { key: 'pm-skills', label: 'Product and delivery skills', order: 6 },
};

/** The group a skill belongs to: the folder it sits in under Skills. */
export function skillGroupOf(node: GraphNode): SkillGroup {
  const parts = node.id.split('/');
  const key = parts.length >= 3 && parts[0] === 'Skills' ? parts[1] : 'other';
  if (SKILL_GROUPS[key]) return SKILL_GROUPS[key];
  if (key === 'other') return { key, label: 'Other skills', order: 20 };
  const words = key.replace(/-skills$/, '').replace(/[-_]/g, ' ');
  return { key, label: `${words.charAt(0).toUpperCase()}${words.slice(1)} skills`, order: 10 };
}

/** The skills in the graph grouped, groups in order, skills by name. */
export function skillGroups(graph: Graph): { group: SkillGroup; nodes: GraphNode[] }[] {
  const groups = new Map<string, { group: SkillGroup; nodes: GraphNode[] }>();
  for (const node of graph.nodes) {
    if (node.kind !== 'skill') continue;
    const group = skillGroupOf(node);
    const entry = groups.get(group.key) ?? { group, nodes: [] };
    entry.nodes.push(node);
    groups.set(group.key, entry);
  }
  return [...groups.values()]
    .sort((a, b) => a.group.order - b.group.order || compareText(a.group.key, b.group.key))
    .map((g) => ({ ...g, nodes: g.nodes.sort(byName) }));
}

/** Nodes by name, case aside, then id: the order every list on the site uses. */
export function byName(a: GraphNode, b: GraphNode): number {
  return compareText(a.name.toLowerCase(), b.name.toLowerCase()) || compareText(a.id, b.id);
}

// ---- the zoom ladder ----------------------------------------------------------
// The whole map is zoomed by changing what part of it the drawing shows. Its
// marks and labels keep their size on screen while the distances between them
// grow, so a label that collides at one zoom may have room at the next. The
// layout places every label for each step of this ladder (screen pixels per
// map unit); the page shows a label from its step upwards.

export const ZOOM_STEPS: readonly number[] = [0.4, 0.52, 0.66, 0.88, 1.15, 1.5, 1.95, 2.55, 3.3, 4.3];
/** The step drawn without script, when the drawing is simply scaled to the page. */
export const STATIC_STEP = 2;

/** The step for a scale: the largest step at or below it, or the first. */
export function stepFor(scale: number): number {
  let step = 0;
  for (let i = 0; i < ZOOM_STEPS.length; i++) if (scale >= ZOOM_STEPS[i] * 0.999) step = i;
  return step;
}

// ---- boxes --------------------------------------------------------------------

/** [left, top, right, bottom]. */
export type Box = [number, number, number, number];

export function overlaps(a: Box, b: Box): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/** A number rounded to a tenth, so the drawing's text is short and the same on every machine. */
export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
