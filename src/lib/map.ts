// Pure functions over the checked map file. Nothing here draws anything or
// touches the network. Only loadMap reads a file, and it checks what it reads.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { z } from 'zod';
import { mapSchema, validateMap } from './map-schema.mjs';

export type FootholdMap = z.infer<typeof mapSchema>;
export type MapNode = FootholdMap['nodes'][number];
export type MapEdge = FootholdMap['edges'][number];

export interface ResolvedStep {
  /** The skill's name as the pack knows it. */
  skill: string;
  skillId: string;
  /** What the step does, in the pack's words. */
  does: string;
}

export interface ResolvedRoute {
  id: string;
  name: string;
  steps: ResolvedStep[];
}

export interface EdgeGroup {
  /** The relationship, for example "reads" or "customer". */
  type: string;
  items: { node: MapNode; origin: string }[];
}

export interface NodeEdges {
  node: MapNode;
  outgoing: EdgeGroup[];
  incoming: EdgeGroup[];
}

export interface Facts {
  /** Pages on the defence map: every node in the defence layer. */
  defencePages: number;
  skills: number;
  folders: number;
  routes: number;
  packVersion: string;
}

/** Where fetch-data.mjs leaves the checked file. */
export const DEFAULT_MAP_FILE = '.foothold/foothold-map.json';

/** Reads and checks the map file the build step wrote. Throws, with the problems, if it is not fit to show. */
export function loadMap(file: string = resolve(process.cwd(), DEFAULT_MAP_FILE)): FootholdMap {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Could not read the map file at ${file}. Run "npm run data" first.`);
  }
  const result = validateMap(raw);
  if (!result.ok) throw new Error(`The map file at ${file} does not meet the contract: ${result.problems.slice(0, 5).join('; ')}`);
  return result.map;
}

/** How many nodes there are of each kind. Keys are sorted so the output is the same every time. */
export function countByKind(map: FootholdMap): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of map.nodes) counts[node.kind] = (counts[node.kind] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/** The numbers the page's fact strip shows. */
export function facts(map: FootholdMap): Facts {
  const kinds = countByKind(map);
  return {
    defencePages: map.nodes.filter((n) => n.layer === 'defence').length,
    skills: kinds.skill ?? 0,
    folders: kinds.folder ?? 0,
    routes: map.routes.length,
    packVersion: map.pack_version,
  };
}

/** Every route with each step's skill resolved to its name, in the order the pack gives. */
export function listRoutes(map: FootholdMap): ResolvedRoute[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  return map.routes.map((route) => ({
    id: route.id,
    name: route.name,
    steps: route.steps.map((step) => ({
      skill: byId.get(step.skill_id)?.name ?? step.skill,
      skillId: step.skill_id,
      does: step.does,
    })),
  }));
}

function group(edges: { type: string; node: MapNode; origin: string }[]): EdgeGroup[] {
  const groups = new Map<string, EdgeGroup>();
  for (const { type, node, origin } of edges) {
    const existing = groups.get(type) ?? { type, items: [] };
    existing.items.push({ node, origin });
    groups.set(type, existing);
  }
  return [...groups.values()]
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.node.name.localeCompare(b.node.name) || a.node.id.localeCompare(b.node.id)) }));
}

/** The edges leaving and arriving at one node, grouped by type. Throws if the node is not in the map. */
export function edgesFor(map: FootholdMap, nodeId: string): NodeEdges {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) throw new Error(`No node with id "${nodeId}"`);
  const outgoing: { type: string; node: MapNode; origin: string }[] = [];
  const incoming: { type: string; node: MapNode; origin: string }[] = [];
  for (const edge of map.edges) {
    if (edge.from === nodeId) {
      const other = byId.get(edge.to);
      if (other) outgoing.push({ type: edge.type, node: other, origin: edge.origin });
    }
    if (edge.to === nodeId) {
      const other = byId.get(edge.from);
      if (other) incoming.push({ type: edge.type, node: other, origin: edge.origin });
    }
  }
  return { node, outgoing: group(outgoing), incoming: group(incoming) };
}
