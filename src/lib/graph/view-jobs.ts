// How a job runs: four columns, read left to right as one chain.
//
// - The job, as a card spanning its steps.
// - The skill for each step, numbered. A line leaves from the end of the
//   skill's name, so the chain reads on from the words.
// - The folders those skills read and write, ordered by where the lines come
//   from so they cross as little as they can, with the whole vault last.
// - What the pack has already put in each folder: the count of defence pages
//   filed there and what they are, joined to the folder by a dotted leader.
//
// Everything is worked out from the route module (routes.ts), so this view
// and the jobs panel always agree.
import { compareText, kindName, type Graph } from './model';
import { routeView, type RouteInput } from './routes';
import { r1, type Box } from './view-common';
import { textWidth, wrapText, type TextStyle } from './view-text';

export interface JobCard {
  id: string;
  name: string;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface JobStepRow {
  route: string;
  number: number;
  skillId: string;
  skill: string;
  does: string;
  /** The diamond's centre. */
  x: number;
  y: number;
  /** Where the line to the folders leaves: just after the name. */
  portX: number;
  portY: number;
}

export interface JobFolderRow {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  /** Where the folder's name ends. */
  nameEnd: number;
  /** Defence pages filed directly in the folder, and what they are. */
  count: number;
  breakdown: string;
}

export interface JobLink {
  route: string;
  step: number;
  skillId: string;
  folder: string;
  type: 'reads' | 'writes';
  d: string;
}

export interface JobJoin {
  route: string;
  step: number;
  d: string;
}

export interface JobsLayout {
  width: number;
  height: number;
  jobs: JobCard[];
  steps: JobStepRow[];
  folders: JobFolderRow[];
  links: JobLink[];
  joins: JobJoin[];
  columns: { job: number; skill: number; folder: number; count: number };
  headingY: number;
  texts: { text: string; box: Box }[];
}

export const JOBS_STYLE = {
  job: { size: 20, weight: 800 } as TextStyle,
  stepNo: { size: 10.5, mono: true, tracking: 0.14 } as TextStyle,
  skill: { size: 15.5, weight: 600 } as TextStyle,
  folder: { size: 14, weight: 600 } as TextStyle,
  number: { size: 26, weight: 800 } as TextStyle,
  breakdown: { size: 13, weight: 400 } as TextStyle,
  heading: { size: 10.5, mono: true, tracking: 0.14 } as TextStyle,
};

const CARD_W = 268;
const SX = 340;
const FX = 660;
const DX = 990;
const TOP = 70;
const STEP_PITCH = 62;
const JOB_GAP = 34;

/** The plural of a kind's name for a count: "organisations", "event series". */
export function kindPlural(kind: string, n: number): string {
  const one = kindName(kind);
  if (n === 1) return one;
  if (one.endsWith('series')) return one;
  if (one.endsWith('business')) return `${one}es`;
  return `${one}s`;
}

/** "17 clusters, 6 networks": what is filed in a folder, the largest first. */
export function breakdownOf(kinds: Map<string, number>): string {
  return [...kinds.entries()]
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .map(([kind, n]) => `${n.toLocaleString('en-GB')} ${kindPlural(kind, n)}`)
    .join(', ');
}

export function jobsLayout(graph: Graph, routes: readonly RouteInput[]): JobsLayout {
  const views = routes.filter((r) => r.steps.every((s) => graph.byId.has(s.skillId))).map((r) => routeView(graph, r));
  const texts: { text: string; box: Box }[] = [];
  const addText = (text: string, x: number, baseline: number, style: TextStyle, anchor: 'start' | 'end' = 'start') => {
    const w = textWidth(text, style);
    const l = anchor === 'start' ? x : x - w;
    texts.push({ text, box: [r1(l), r1(baseline - style.size * 0.8), r1(l + w), r1(baseline + style.size * 0.25)] });
    return l + w;
  };

  // ---- jobs and their steps -------------------------------------------------
  const jobs: JobCard[] = [];
  const steps: JobStepRow[] = [];
  let y = TOP;
  for (const view of views) {
    const first = y;
    for (const s of view.steps) {
      const sy = y + 16;
      addText(`Step ${s.number}`.toUpperCase(), SX + 20, sy - 9, JOBS_STYLE.stepNo);
      const end = addText(s.skill, SX + 20, sy + 12, JOBS_STYLE.skill);
      steps.push({ route: view.id, number: s.number, skillId: s.skillId, skill: s.skill, does: s.does, x: SX, y: r1(sy), portX: r1(end + 8), portY: r1(sy + 7) });
      y += STEP_PITCH;
    }
    const span = y - first - (STEP_PITCH - 32);
    const lines = wrapText(view.name, CARD_W - 40, JOBS_STYLE.job);
    const height = Math.max(76, lines.length * 25 + 36);
    const cy = first + span / 2;
    const top = r1(cy - height / 2);
    lines.forEach((line, i) => addText(line, 20, top + height / 2 - ((lines.length - 1) * 25) / 2 + i * 25 + 7, JOBS_STYLE.job));
    jobs.push({ id: view.id, name: view.name, lines, x: 0, y: top, width: CARD_W, height });
    y += JOB_GAP;
  }
  const stepsEnd = y - JOB_GAP;

  // ---- folders, ordered by where their lines come from ---------------------
  const touching = new Map<string, number[]>();
  for (const view of views) {
    for (const s of view.steps) {
      const row = steps.find((r) => r.route === view.id && r.number === s.number)!;
      for (const n of [...s.reads, ...s.writes]) touching.set(n.id, [...(touching.get(n.id) ?? []), row.y]);
    }
  }
  const mean = (ys: number[]) => ys.reduce((a, b) => a + b, 0) / ys.length;
  const folderIds = [...touching.keys()].sort((a, b) => {
    const va = graph.byId.get(a)!.kind === 'vault';
    const vb = graph.byId.get(b)!.kind === 'vault';
    return Number(va) - Number(vb) || mean(touching.get(a)!) - mean(touching.get(b)!) || compareText(a, b);
  });
  const filed = new Map<string, Map<string, number>>();
  for (const e of graph.edges) {
    if (e.type !== 'in_folder') continue;
    const page = graph.byId.get(e.from)!;
    if (page.layer !== 'defence') continue;
    const kinds = filed.get(e.to) ?? new Map<string, number>();
    kinds.set(page.kind, (kinds.get(page.kind) ?? 0) + 1);
    filed.set(e.to, kinds);
  }
  const top = TOP + 10;
  const room = Math.max(stepsEnd - top, folderIds.length * 34);
  const pitch = folderIds.length > 1 ? room / (folderIds.length - 1 || 1) : 0;
  const folders: JobFolderRow[] = folderIds.map((id, i) => {
    const node = graph.byId.get(id)!;
    const fy = r1(folderIds.length > 1 ? top + i * Math.min(pitch, 64) + Math.max(0, (room - (folderIds.length - 1) * Math.min(pitch, 64)) / 2) : top + room / 2);
    const label = node.kind === 'vault' ? node.name : id;
    const nameEnd = addText(label, FX + 18, fy + 5, JOBS_STYLE.folder);
    const kinds = filed.get(id) ?? new Map<string, number>();
    const count = [...kinds.values()].reduce((a, b) => a + b, 0);
    const breakdown = breakdownOf(kinds);
    if (count) {
      const numEnd = addText(count.toLocaleString('en-GB'), DX, fy + 9, JOBS_STYLE.number);
      addText(breakdown, numEnd + 10, fy + 5, JOBS_STYLE.breakdown);
    }
    return { id, label, kind: node.kind, x: FX, y: fy, nameEnd: r1(nameEnd), count, breakdown };
  });

  // ---- lines ------------------------------------------------------------------
  const folderAt = new Map(folders.map((f) => [f.id, f]));
  const links: JobLink[] = [];
  const joins: JobJoin[] = [];
  for (const view of views) {
    const card = jobs.find((j) => j.id === view.id)!;
    const cardY = card.y + card.height / 2;
    for (const s of view.steps) {
      const row = steps.find((r) => r.route === view.id && r.number === s.number)!;
      const x0 = card.x + card.width;
      const x1 = SX - 11;
      joins.push({ route: view.id, step: s.number, d: `M${x0},${r1(cardY)} C${r1(x0 + 40)},${r1(cardY)} ${r1(x1 - 40)},${row.y} ${x1},${row.y}` });
      for (const [type, list] of [['reads', s.reads], ['writes', s.writes]] as const) {
        for (const n of list) {
          const f = folderAt.get(n.id)!;
          const x2 = FX - 11;
          const bend = Math.max(40, (x2 - row.portX) * 0.45);
          links.push({ route: view.id, step: s.number, skillId: s.skillId, folder: n.id, type, d: `M${row.portX},${row.portY} C${r1(row.portX + bend)},${row.portY} ${r1(x2 - bend)},${f.y} ${x2},${f.y}` });
        }
      }
    }
  }

  const headingY = 26;
  addText('The job'.toUpperCase(), 0, headingY, JOBS_STYLE.heading);
  addText('The skill for each step'.toUpperCase(), SX - 10, headingY, JOBS_STYLE.heading);
  addText('Folders it reads and writes'.toUpperCase(), FX - 8, headingY, JOBS_STYLE.heading);
  addText('What the pack has already put there'.toUpperCase(), DX, headingY, JOBS_STYLE.heading);
  const width = r1(Math.max(DX + 330, ...texts.map((t) => t.box[2] + 10)));
  const height = r1(Math.max(stepsEnd, ...folders.map((f) => f.y + 20), ...jobs.map((j) => j.y + j.height + 10)) + 16);
  return { width, height, jobs, steps, folders, links, joins, columns: { job: 0, skill: SX, folder: FX, count: DX }, headingY, texts };
}
