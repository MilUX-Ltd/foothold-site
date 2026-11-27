// The contract for data/foothold-map.json, as the site reads it. Shared by the
// build step (scripts/fetch-data.mjs), the page code and the tests, so one
// definition decides what the site will accept. See CONTEXT.md for the data
// contract and its version rule.
//
// Plain JavaScript with no build step, so the Node script can import it. Types
// come from the schemas (z.infer) in src/lib/map.ts.
import { z } from 'zod';

/** The major version of schema_version this site understands. A change here is a change to CONTEXT.md in the same release. */
export const SUPPORTED_MAJOR = 1;

/** Keys that can name a person or say how to reach one. A node carrying any of them is refused. */
export const FORBIDDEN_NODE_KEYS = ['email', 'phone', 'linkedin', 'led_by', 'role', 'lawful_basis', 'organisation'];

/** Kinds of node the site will never show. */
export const FORBIDDEN_NODE_KINDS = ['contact'];

const text = z.string().min(1);

// Step one: look at every key a node arrives with, before anything is stripped.
const nodeGate = z.record(z.string(), z.unknown()).superRefine((node, ctx) => {
  const keys = Object.keys(node).filter((k) => FORBIDDEN_NODE_KEYS.includes(k));
  if (keys.length > 0) {
    ctx.addIssue({ code: 'custom', message: `a node carries a field that can name a person: ${keys.join(', ')}` });
  }
  if (typeof node.kind === 'string' && FORBIDDEN_NODE_KINDS.includes(node.kind)) {
    ctx.addIssue({ code: 'custom', message: `a node of kind "${node.kind}" is never allowed` });
  }
});

// Step two: the shape. Keys outside this list are dropped, so the site only ever
// holds fields the contract names.
const nodeShape = z.object({
  id: text,
  layer: z.enum(['defence', 'business']),
  kind: text,
  name: text,
  path: text,
  acronym: z.string().optional(),
  abbreviation: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  website: z.string().optional(),
  region: z.string().optional(),
  audience: z.string().optional(),
  service: z.array(z.string()).optional(),
  description: z.string().optional(),
  guide: z.string().optional(),
});

export const nodeSchema = nodeGate.pipe(nodeShape);

export const edgeSchema = z.object({
  from: text,
  to: text,
  type: text,
  origin: text,
});

export const stepSchema = z.object({
  skill: text,
  skill_id: text,
  does: text,
});

export const routeSchema = z.object({
  id: text,
  name: text,
  steps: z.array(stepSchema).min(1),
});

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'must look like 1.2.3');

export const mapSchema = z
  .object({
    schema_version: semver.refine((v) => Number(v.split('.')[0]) === SUPPORTED_MAJOR, {
      message: `schema_version must have major version ${SUPPORTED_MAJOR}; a new major version needs a change to this site first (see CONTEXT.md)`,
    }),
    pack_version: semver,
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    routes: z.array(routeSchema),
  })
  .superRefine((map, ctx) => {
    const ids = new Set(map.nodes.map((n) => n.id));
    if (ids.size !== map.nodes.length) {
      ctx.addIssue({ code: 'custom', message: 'two nodes share an id' });
    }
    map.edges.forEach((e, i) => {
      for (const end of ['from', 'to']) {
        if (!ids.has(e[end])) ctx.addIssue({ code: 'custom', path: ['edges', i, end], message: `edge ${end} "${e[end]}" is not a node` });
      }
    });
    map.routes.forEach((r, i) => {
      r.steps.forEach((s, j) => {
        if (!ids.has(s.skill_id)) ctx.addIssue({ code: 'custom', path: ['routes', i, 'steps', j], message: `step skill "${s.skill_id}" is not a node` });
      });
    });
  });

/**
 * Checks a parsed JSON value. Returns { ok: true, map } or { ok: false, problems: string[] }.
 * @param {unknown} raw
 * @returns {{ ok: true, map: z.infer<typeof mapSchema> } | { ok: false, problems: string[] }}
 */
export function validateMap(raw) {
  const result = mapSchema.safeParse(raw);
  if (result.success) return { ok: true, map: result.data };
  const problems = result.error.issues.map((i) => {
    const where = i.path.length ? `${i.path.join('.')}: ` : '';
    return `${where}${i.message}`;
  });
  return { ok: false, problems };
}
