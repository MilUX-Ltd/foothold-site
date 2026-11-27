// A job on the map: a route from the pack, turned into what the page shows and
// what the map lights. Pure TypeScript over the graph model, so the viewer, the
// renderer and the tests share it, and no route logic lives in the drawing.
//
// The chain a route draws runs across both layers: the job, then the skill for
// each step, then the folders that skill reads and writes, then the defence
// pages filed in those folders. Every link in it is an edge the pack wrote;
// nothing is inferred.
//
// A job shown whole lights the route, its skills and every folder they touch.
// A step lights the route, its skill and that skill's folders strongly, the
// defence pages filed in those folders softly as a group, and leaves the job's
// other steps faintly visible. A skill that reads the whole vault lights the
// vault mark and no folders for that read.
import { compareText, type Graph, type GraphEdge, type GraphNode } from './model';

/** A route as the pack gives it, each step's skill resolved to its node id. */
export interface RouteInput {
  id: string;
  name: string;
  steps: readonly { skill: string; skillId: string; does: string }[];
}

export interface RouteStep {
  /** The step's place in the route, counting from 1. */
  number: number;
  skillId: string;
  /** The skill's name on the map, or the pack's name for it if it is not a node. */
  skill: string;
  /** What the step does, in the pack's words. */
  does: string;
  /** What the skill reads and writes: folders, or the vault node for the whole vault. */
  reads: GraphNode[];
  writes: GraphNode[];
  /** Whether the skill reads the whole vault. */
  wholeVault: boolean;
  /** The defence pages filed directly in the folders the skill reads or writes. */
  defencePages: GraphNode[];
  /** The example business, when it is filed in one of those folders. */
  exampleBusiness: GraphNode | null;
}

export interface RouteView {
  id: string;
  name: string;
  steps: RouteStep[];
}

export interface RouteLit {
  /** The step shown, counting from 1, or null for the whole job. */
  step: number | null;
  /** Lit strongly: the route, the skill (or skills) and their folders. */
  strong: Set<string>;
  /** Lit softly, as a group: the defence pages behind the step's folders. */
  soft: Set<string>;
  /** Faintly visible: the job's other steps. */
  faint: Set<string>;
  strongEdges: GraphEdge[];
  softEdges: GraphEdge[];
  faintEdges: GraphEdge[];
  /** Labels the map shows in place of a node's name. */
  labels: Map<string, string>;
  exampleBusiness: GraphNode | null;
  counts: { steps: number; reads: number; writes: number; defencePages: number };
}

const VAULT_KIND = 'vault';
const EXAMPLE_KIND = 'example-business';

const byIdOrder = (a: GraphNode, b: GraphNode) => compareText(a.id, b.id);

/** How the map names the example business when a step lights it. */
export function exampleBusinessLabel(name: string): string {
  return `${name}, the example business`;
}

function targets(graph: Graph, skillId: string, type: 'reads' | 'writes'): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const links = (graph.links.get(skillId) ?? []).filter((l) => l.direction === 'outgoing' && l.edge.type === type);
  const nodes = new Map<string, GraphNode>();
  for (const l of links) nodes.set(l.other, graph.byId.get(l.other)!);
  return { nodes: [...nodes.values()].sort(byIdOrder), edges: links.map((l) => l.edge) };
}

/** The defence pages filed directly in these folders, and the edges that file them. */
function filedIn(graph: Graph, folders: readonly GraphNode[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  for (const folder of folders) {
    if (folder.kind === VAULT_KIND) continue;
    for (const l of graph.links.get(folder.id) ?? []) {
      if (l.direction !== 'incoming' || l.edge.type !== 'in_folder') continue;
      const page = graph.byId.get(l.other)!;
      if (page.layer !== 'defence') continue;
      nodes.set(page.id, page);
      edges.push(l.edge);
    }
  }
  return { nodes: [...nodes.values()].sort((a, b) => compareText(a.name.toLowerCase(), b.name.toLowerCase()) || compareText(a.id, b.id)), edges };
}

/** The route's steps in the pack's order, each with what its skill reads and writes. */
export function routeView(graph: Graph, route: RouteInput): RouteView {
  return {
    id: route.id,
    name: route.name,
    steps: route.steps.map((s, i) => {
      const reads = targets(graph, s.skillId, 'reads').nodes;
      const writes = targets(graph, s.skillId, 'writes').nodes;
      const pages = filedIn(graph, [...reads, ...writes]).nodes;
      return {
        number: i + 1,
        skillId: s.skillId,
        skill: graph.byId.get(s.skillId)?.name ?? s.skill,
        does: s.does,
        reads,
        writes,
        wholeVault: reads.some((n) => n.kind === VAULT_KIND),
        defencePages: pages,
        exampleBusiness: pages.find((n) => n.kind === EXAMPLE_KIND) ?? null,
      };
    }),
  };
}

/** The ids and edges one step lights: its skill, the step edge and the skill's reads and writes. */
function stepParts(graph: Graph, routeId: string, step: RouteStep): { ids: string[]; edges: GraphEdge[] } {
  const ids = [step.skillId, ...step.reads.map((n) => n.id), ...step.writes.map((n) => n.id)].filter((id) => graph.byId.has(id));
  const edges = [
    ...(graph.links.get(routeId) ?? []).filter((l) => l.direction === 'outgoing' && l.edge.type === 'step' && l.other === step.skillId).map((l) => l.edge),
    ...targets(graph, step.skillId, 'reads').edges,
    ...targets(graph, step.skillId, 'writes').edges,
  ];
  return { ids, edges };
}

/**
 * What the map lights for a job, whole (step null) or at one step. A step
 * outside the route is treated as the whole job.
 */
export function routeLit(graph: Graph, view: RouteView, step: number | null): RouteLit {
  const current = step === null ? undefined : view.steps.find((s) => s.number === step);
  const strong = new Set<string>();
  const soft = new Set<string>();
  const faint = new Set<string>();
  const strongEdges = new Set<GraphEdge>();
  const softEdges = new Set<GraphEdge>();
  const faintEdges = new Set<GraphEdge>();
  const labels = new Map<string, string>();
  if (graph.byId.has(view.id)) strong.add(view.id);

  if (!current) {
    for (const s of view.steps) {
      const parts = stepParts(graph, view.id, s);
      for (const id of parts.ids) strong.add(id);
      for (const e of parts.edges) strongEdges.add(e);
    }
    const reads = new Set(view.steps.flatMap((s) => s.reads.map((n) => n.id)));
    const writes = new Set(view.steps.flatMap((s) => s.writes.map((n) => n.id)));
    return {
      step: null,
      strong,
      soft,
      faint,
      strongEdges: [...strongEdges],
      softEdges: [],
      faintEdges: [],
      labels,
      exampleBusiness: null,
      counts: { steps: view.steps.length, reads: reads.size, writes: writes.size, defencePages: 0 },
    };
  }

  const parts = stepParts(graph, view.id, current);
  for (const id of parts.ids) strong.add(id);
  for (const e of parts.edges) strongEdges.add(e);
  const filed = filedIn(graph, [...current.reads, ...current.writes]);
  for (const n of filed.nodes) soft.add(n.id);
  for (const e of filed.edges) softEdges.add(e);
  // The example business is lit strongly so the map can name it.
  const example = current.exampleBusiness;
  if (example) {
    soft.delete(example.id);
    strong.add(example.id);
    labels.set(example.id, exampleBusinessLabel(example.name));
  }
  for (const other of view.steps) {
    if (other.number === current.number) continue;
    const o = stepParts(graph, view.id, other);
    for (const id of o.ids) if (!strong.has(id) && !soft.has(id)) faint.add(id);
    for (const e of o.edges) if (!strongEdges.has(e)) faintEdges.add(e);
  }
  return {
    step: current.number,
    strong,
    soft,
    faint,
    strongEdges: [...strongEdges],
    softEdges: [...softEdges],
    faintEdges: [...faintEdges],
    labels,
    exampleBusiness: example,
    counts: { steps: view.steps.length, reads: current.reads.length, writes: current.writes.length, defencePages: current.defencePages.length },
  };
}
