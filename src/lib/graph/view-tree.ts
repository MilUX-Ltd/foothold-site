// The business half of the whole map: the pack's own structure as a tree.
//
// - The vault heads it, and every folder is named and indented under its
//   parent, one row each.
// - Folders the defence pages are filed in carry their count on a rail to the
//   right of the names; the bands from the wheel arrive at the folder's mark.
// - Folders a skill reads or writes have a port on the rail, joined to the
//   name by a dotted leader, so each line from a skill ends at the folder it
//   means, never short of it.
// - Skills are grouped by what they are for, one diamond each; the skills a
//   job uses are filled. The jobs are listed by name above them, each joined
//   to the skills of its steps.
//
// Positions are in map units from the tree's top left. Unlike the wheel, the
// tree is typeset: its text grows and shrinks with the zoom like a page.
import { compareText, type Graph, type GraphNode } from './model';
import type { RouteInput } from './routes';
import { byName, r1, skillGroups, type Box } from './view-common';
import { textWidth, type TextStyle } from './view-text';

export interface TreeRow {
  id: string;
  name: string;
  depth: number;
  parent: string | null;
  /** The mark's centre. */
  x: number;
  y: number;
  top: number;
  bottom: number;
  /** Where the name ends. */
  nameEnd: number;
  /** Read or written by at least one skill: drawn filled, with a port on the rail. */
  used: boolean;
  /** Defence pages filed in this folder, if any. */
  count: number;
}

export interface TreeSkillGroup {
  key: string;
  label: string;
  count: number;
  /** Where the heading sits. */
  x: number;
  y: number;
  marks: { id: string; x: number; y: number; inRoute: boolean }[];
}

export interface TreeJob {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface TreeLink {
  from: string;
  to: string;
  type: string;
  d: string;
}

export interface TreeText {
  text: string;
  box: Box;
}

export interface TreeLayout {
  vault: { id: string; name: string; x: number; y: number } | null;
  rows: TreeRow[];
  groups: TreeSkillGroup[];
  jobs: TreeJob[];
  /** Reads and writes, from a skill to a folder's port or the vault. */
  links: TreeLink[];
  /** Each job to the skill of each of its steps. */
  steps: TreeLink[];
  /** The x of the rail the ports and counts sit on. */
  rail: number;
  width: number;
  height: number;
  /** Every piece of text the tree sets, with its box, so tests can check none collide. */
  texts: TreeText[];
  /** The headings over the two columns. */
  headings: { text: string; x: number; y: number }[];
}

export const TREE_STYLE = {
  row: 25,
  indent: 20,
  top: { size: 15, weight: 600 } as TextStyle,
  sub: { size: 14, weight: 400 } as TextStyle,
  count: { size: 11, mono: true, tracking: 0.04 } as TextStyle,
  heading: { size: 10.5, mono: true, tracking: 0.14 } as TextStyle,
  job: { size: 14.5, weight: 600 } as TextStyle,
  pitch: 25,
  perRow: 10,
};

const RAIL = 352;
const WIDE_SKILLS_X = 450;
const ROWS_TOP = 70;

/** The words beside a folder's count. */
export function pagesLabel(count: number): string {
  return `${count.toLocaleString('en-GB')} page${count === 1 ? '' : 's'}`;
}

export interface TreeOptions {
  /** The phone arrangement: the jobs and skills beneath the folders, not beside them, and no lines between them. */
  narrow?: boolean;
}

export function treeLayout(graph: Graph, routes: readonly RouteInput[], options: TreeOptions = {}): TreeLayout {
  const narrow = options.narrow ?? false;
  const folders = graph.nodes.filter((n) => n.kind === 'folder');
  const folderIds = new Set(folders.map((f) => f.id));
  // A folder's parent is the one its record names; failing that, the folder its id sits under.
  const parentOf = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type === 'parent' && folderIds.has(e.from) && folderIds.has(e.to) && e.from !== e.to && !parentOf.has(e.from)) parentOf.set(e.from, e.to);
  }
  for (const f of folders) {
    if (parentOf.has(f.id)) continue;
    const parts = f.id.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const up = parts.slice(0, i).join('/');
      if (folderIds.has(up)) {
        parentOf.set(f.id, up);
        break;
      }
    }
  }
  // A parent that would close a loop is dropped.
  for (const f of folders) {
    const seen = new Set<string>([f.id]);
    let at = parentOf.get(f.id);
    while (at && !seen.has(at)) {
      seen.add(at);
      at = parentOf.get(at);
    }
    if (at) parentOf.delete(f.id);
  }
  const children = new Map<string | null, GraphNode[]>();
  for (const f of folders) {
    const p = parentOf.get(f.id) ?? null;
    const list = children.get(p) ?? [];
    list.push(f);
    children.set(p, list);
  }
  for (const list of children.values()) list.sort(byName);

  const used = new Set<string>();
  const filed = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.type === 'reads' || e.type === 'writes') used.add(e.to);
    if (e.type === 'in_folder' && graph.byId.get(e.from)?.layer === 'defence') filed.set(e.to, (filed.get(e.to) ?? 0) + 1);
  }

  const texts: TreeText[] = [];
  const addText = (text: string, x: number, baseline: number, style: TextStyle, anchor: 'start' | 'end' = 'start') => {
    const w = textWidth(text, style);
    const left = anchor === 'start' ? x : x - w;
    texts.push({ text, box: [r1(left), r1(baseline - style.size * 0.8), r1(left + w), r1(baseline + style.size * 0.25)] });
    return left + w;
  };

  const vaultNode = graph.nodes.find((n) => n.kind === 'vault') ?? null;
  const vault = vaultNode ? { id: vaultNode.id, name: vaultNode.name, x: 8, y: 40 } : null;
  if (vault) addText(vault.name, vault.x + 18, vault.y + 5, TREE_STYLE.top);

  const rows: TreeRow[] = [];
  let y = ROWS_TOP;
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      const x = 28 + depth * TREE_STYLE.indent;
      const style = depth === 0 ? TREE_STYLE.top : TREE_STYLE.sub;
      const nameEnd = addText(f.name, x + 14, y + 5, style);
      const count = filed.get(f.id) ?? 0;
      if (count) addText(pagesLabel(count), RAIL - 12, y + 4, TREE_STYLE.count, 'end');
      rows.push({ id: f.id, name: f.name, depth, parent, x, y, top: y - TREE_STYLE.row / 2, bottom: y + TREE_STYLE.row / 2, nameEnd: r1(nameEnd), used: used.has(f.id), count });
      y += TREE_STYLE.row;
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  const rowsEnd = y;

  // ---- the jobs and the skills, in a column to the right -------------------
  const headings: { text: string; x: number; y: number }[] = [];
  const heading = (text: string, x: number, at: number) => {
    headings.push({ text, x, y: at });
    addText(text.toUpperCase(), x, at, TREE_STYLE.heading);
  };
  heading('Your business structure', 0, 8);
  const jobs: TreeJob[] = [];
  const SKILLS_X = narrow ? 36 : WIDE_SKILLS_X;
  let sy = narrow ? rowsEnd + 26 : ROWS_TOP - 30;
  const routeNodes = routes.filter((r) => graph.byId.has(r.id));
  if (routeNodes.length) {
    heading('Jobs', SKILLS_X - 8, sy);
    sy += 26;
    for (const r of routeNodes) {
      jobs.push({ id: r.id, name: r.name, x: SKILLS_X, y: sy });
      addText(r.name, SKILLS_X + 16, sy + 5, TREE_STYLE.job);
      sy += 25;
    }
    sy += 22;
  }
  const inRoute = new Set(routes.flatMap((r) => r.steps.map((s) => s.skillId)));
  const perRow = narrow ? 11 : TREE_STYLE.perRow;
  const groups: TreeSkillGroup[] = [];
  for (const { group, nodes } of skillGroups(graph)) {
    const ordered = [...nodes].sort((a, b) => Number(inRoute.has(b.id)) - Number(inRoute.has(a.id)) || byName(a, b));
    const label = `${group.label} · ${nodes.length}`;
    heading(label, SKILLS_X - 8, sy);
    const marks = ordered.map((n, k) => ({
      id: n.id,
      x: SKILLS_X + (k % perRow) * TREE_STYLE.pitch,
      y: sy + 20 + Math.floor(k / perRow) * TREE_STYLE.pitch,
      inRoute: inRoute.has(n.id),
    }));
    groups.push({ key: group.key, label, count: nodes.length, x: SKILLS_X - 8, y: sy, marks });
    sy += 20 + Math.ceil(nodes.length / perRow) * TREE_STYLE.pitch + 14;
  }

  // ---- lines ------------------------------------------------------------------
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const markById = new Map(groups.flatMap((g) => g.marks).map((m) => [m.id, m]));
  const links: TreeLink[] = [];
  for (const e of narrow ? [] : graph.edges) {
    if (e.type !== 'reads' && e.type !== 'writes') continue;
    const s = markById.get(e.from);
    if (!s) continue;
    const row = rowById.get(e.to);
    const target = row ? { x: RAIL + 4, y: row.y } : vault && e.to === vault.id ? { x: RAIL + 4, y: vault.y } : null;
    if (!target) continue;
    const x0 = s.x - 8;
    const bend = Math.max(30, (x0 - target.x) * 0.5);
    links.push({ from: e.from, to: e.to, type: e.type, d: `M${x0},${s.y} C${r1(x0 - bend)},${s.y} ${r1(target.x + bend)},${target.y} ${target.x},${target.y}` });
  }
  const steps: TreeLink[] = [];
  for (const r of routeNodes) {
    const job = jobs.find((j) => j.id === r.id)!;
    for (const s of r.steps) {
      const m = markById.get(s.skillId);
      if (!m) continue;
      steps.push({ from: r.id, to: s.skillId, type: 'step', d: `M${job.x - 9},${job.y} C${job.x - 46},${job.y} ${m.x - 34},${m.y - 26} ${m.x - 6},${m.y - 4}` });
    }
  }
  steps.sort((a, b) => compareText(a.from, b.from) || compareText(a.to, b.to));

  const width = Math.max(narrow ? RAIL + 10 : SKILLS_X + TREE_STYLE.perRow * TREE_STYLE.pitch, ...texts.map((t) => t.box[2])) + 10;
  const height = Math.max(rowsEnd, sy) + 10;
  return { vault, rows, groups, jobs, links, steps, rail: RAIL, width: r1(width), height: r1(height), texts, headings };
}
