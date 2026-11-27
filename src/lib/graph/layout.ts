// The map's layout, settled at build time so the viewer starts correct and
// still on its first frame. A force simulation carried over from the earlier
// viewer: nodes push each other apart, edges pull their ends together, and a
// weak pull holds each node near a home for its kind. Each layer has its own
// region, defence on the left and business on the right, and the edges that
// cross between them (a page filed in a folder) are pulled more gently, so the
// two regions stay readable while the lines that join them stay visible.
//
// Deterministic by construction: nodes in sorted id order (the model does
// that), a seeded generator and never an unseeded one, no iteration over objects
// or sets, and fixed rounding at the end. The same input gives the same
// positions on every build.
import { compareText, LAYERS, type Graph } from './model';

/** Positions lie in [0, width] by [0, height]; depth, for the 3D view, in [-depth/2, depth/2]. */
export const LAYOUT_BOUNDS = { width: 2400, height: 1500, depth: 600 } as const;

export interface Position {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface Layout {
  bounds: typeof LAYOUT_BOUNDS;
  /** One position per node, in the model's node order. */
  positions: Position[];
}

export interface LayoutOptions {
  seed?: number;
}

const MARGIN = 60;
/** Half the gap between the two layers' regions, in simulation units. */
const WALL = 36;
const SEED = 20261127;

/** Park and Miller's minimal standard generator: small, seeded, the same everywhere. */
export function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function computeLayout(graph: Graph, options: LayoutOptions = {}): Layout {
  const random = seededRandom(options.seed ?? SEED);
  const nodes = graph.nodes;
  const n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));

  // Homes: each layer a region, each kind a spot on a ring inside its region,
  // sized by how many nodes it holds.
  const layerCount = LAYERS.map((layer) => nodes.filter((node) => node.layer === layer).length);
  const layerRadius = layerCount.map((c) => 60 + Math.sqrt(c) * 34);
  // The two regions sit close, so the joining lines are short and the whole
  // map fills more of the window it is fitted to.
  const layerCentre = [
    { x: -layerRadius[0] * 0.72, y: 0 },
    { x: layerRadius[1] * 0.72, y: 0 },
  ];
  const homeX = new Float64Array(n);
  const homeY = new Float64Array(n);
  LAYERS.forEach((layer, li) => {
    const kinds = [...new Set(nodes.filter((node) => node.layer === layer).map((node) => node.kind))].sort(compareText);
    kinds.forEach((kind, ki) => {
      const angle = (ki / Math.max(1, kinds.length)) * Math.PI * 2 + li * 0.7;
      const ring = kinds.length > 1 ? layerRadius[li] * 0.55 : 0;
      const hx = layerCentre[li].x + Math.cos(angle) * ring;
      const hy = layerCentre[li].y + Math.sin(angle) * ring;
      nodes.forEach((node, i) => {
        if (node.layer === layer && node.kind === kind) {
          homeX[i] = hx;
          homeY[i] = hy;
        }
      });
    });
  });

  const degree = new Float64Array(n);
  for (const edge of graph.edges) {
    degree[index.get(edge.from)!]++;
    degree[index.get(edge.to)!]++;
  }
  const radius = Array.from(degree, (d) => 3.4 + Math.min(Math.sqrt(d) * 1.9, 15));

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = homeX[i] + (random() - 0.5) * 260;
    y[i] = homeY[i] + (random() - 0.5) * 260;
  }

  const ea: number[] = [];
  const eb: number[] = [];
  const rest: number[] = [];
  const strength: number[] = [];
  for (const edge of graph.edges) {
    const a = index.get(edge.from)!;
    const b = index.get(edge.to)!;
    if (a === b) continue;
    const cross = nodes[a].layer !== nodes[b].layer;
    ea.push(a);
    eb.push(b);
    rest.push((cross ? 160 : 70) + (radius[a] + radius[b]) * 2);
    strength.push(cross ? 0.0012 : 0.0135);
  }

  const defence = nodes.map((node) => node.layer === 'defence');
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  for (let alpha = 1; alpha >= 0.004; alpha *= 0.9945) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > 420000) continue;
        if (d2 < 1e-6) {
          // Two nodes on the same spot: part them along a fixed direction.
          vx[i] -= 0.5;
          vx[j] += 0.5;
          continue;
        }
        const d = Math.sqrt(d2);
        const f = (2600 * alpha) / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        vx[i] -= fx;
        vy[i] -= fy;
        vx[j] += fx;
        vy[j] += fy;
      }
    }
    for (let k = 0; k < ea.length; k++) {
      const a = ea[k];
      const b = eb[k];
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - rest[k]) * strength[k] * alpha) / d;
      vx[a] += dx * f;
      vy[a] += dy * f;
      vx[b] -= dx * f;
      vy[b] -= dy * f;
    }
    for (let i = 0; i < n; i++) {
      vx[i] += (homeX[i] - x[i]) * 0.012 * alpha;
      vy[i] += (homeY[i] - y[i]) * 0.012 * alpha;
      // A wall down the middle keeps each layer on its own side, so the two
      // regions never overlap and the edges between them cross the gap.
      if (defence[i] && x[i] > -WALL) vx[i] += (-WALL - x[i]) * 0.3;
      if (!defence[i] && x[i] < WALL) vx[i] += (WALL - x[i]) * 0.3;
      vx[i] *= 0.8;
      vy[i] *= 0.8;
      x[i] += vx[i];
      y[i] += vy[i];
    }
  }

  // Fit into the bounds, keeping the shape, then round to a tenth.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }
  const { width, height, depth } = LAYOUT_BOUNDS;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((width - 2 * MARGIN) / spanX, (height - 2 * MARGIN) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const round = (v: number) => Math.round(v * 10) / 10;

  const taken = new Set<string>();
  const positions: Position[] = nodes.map((node, i) => {
    let px = round(offX + (x[i] - minX) * scale);
    const py = round(offY + (y[i] - minY) * scale);
    // Rounding can land two nodes on one spot; step along until it is free.
    while (taken.has(`${px},${py}`)) px = round(px + 0.1);
    taken.add(`${px},${py}`);
    // Depth for the 3D view: each layer on its own plane, a little spread.
    const plane = node.layer === 'defence' ? -depth / 4 : depth / 4;
    const pz = round(plane + (random() - 0.5) * (depth / 5));
    return { id: node.id, x: px, y: py, z: pz };
  });
  return { bounds: LAYOUT_BOUNDS, positions };
}
