// How the map draws things, as literal values. A canvas cannot read CSS custom
// properties (a font or colour string holding var() is silently ignored), so
// colours, weights and sizes for drawing live here as plain values, taken from
// the site's palette in src/styles/base.css. The page's legend reads the same
// values, so the key and the drawing cannot drift apart.
//
// Nothing relies on colour alone: layers differ by shape (filled marks for the
// defence reference, outlined marks for the business structure) and edge types
// by dash pattern and weight.

export const PALETTE = {
  paper: '#f5f4ef',
  white: '#ffffff',
  ink: '#0c1510',
  ink2: '#3f4a42',
  ink3: '#5f6a62',
  line: '#d9d8ce',
  forest: '#113308',
  clay: '#a35c17',
  signal: '#e2611c',
  rust: '#8a2b0a',
  /** Quiet tints for the region behind each layer, a step off the paper. */
  regionDefence: '#eeede5',
  regionBusiness: '#fcfbf8',
  regionEdge: '#e2e1d7',
} as const;

/** The canvas font. Literal, because a canvas font string ignores var(). */
export const FONT = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';

export type Shape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon';

export interface KindStyle {
  colour: string;
  shape: Shape;
}

const KIND_STYLES: Record<string, KindStyle> = {
  // Defence reference: filled circles.
  organisation: { colour: PALETTE.forest, shape: 'circle' },
  programme: { colour: PALETTE.clay, shape: 'circle' },
  framework: { colour: PALETTE.ink2, shape: 'circle' },
  portal: { colour: PALETTE.rust, shape: 'circle' },
  'event-series': { colour: PALETTE.signal, shape: 'circle' },
  network: { colour: PALETTE.ink3, shape: 'circle' },
  cluster: { colour: '#3d6b2c', shape: 'circle' },
  'example-business': { colour: PALETTE.ink, shape: 'circle' },
  // Business structure: outlined shapes on white.
  folder: { colour: PALETTE.forest, shape: 'square' },
  skill: { colour: PALETTE.clay, shape: 'diamond' },
  route: { colour: PALETTE.rust, shape: 'triangle' },
  vault: { colour: PALETTE.ink, shape: 'hexagon' },
};

export function kindStyle(kind: string, layer: 'defence' | 'business'): KindStyle {
  return KIND_STYLES[kind] ?? { colour: PALETTE.ink3, shape: layer === 'defence' ? 'circle' : 'square' };
}

export interface EdgeStyle {
  colour: string;
  /** Line width in screen pixels. */
  width: number;
  /** Canvas dash pattern; empty for a solid line. */
  dash: number[];
}

const EDGE_STYLES: Record<string, EdgeStyle> = {
  parent: { colour: PALETTE.ink2, width: 1.6, dash: [] },
  in_folder: { colour: '#8d968e', width: 0.8, dash: [1.5, 3] },
  mentions: { colour: PALETTE.ink3, width: 0.8, dash: [] },
  customer: { colour: PALETTE.forest, width: 1.6, dash: [8, 3] },
  operator: { colour: PALETTE.forest, width: 1.6, dash: [2, 2] },
  service: { colour: PALETTE.forest, width: 1.6, dash: [8, 3, 2, 3] },
  member_of: { colour: PALETTE.ink2, width: 1.2, dash: [5, 5] },
  listed_on: { colour: PALETTE.ink2, width: 1.2, dash: [1, 4] },
  reads: { colour: PALETTE.clay, width: 1.4, dash: [6, 4] },
  writes: { colour: PALETTE.clay, width: 2.2, dash: [] },
  step: { colour: PALETTE.rust, width: 2.2, dash: [10, 4] },
};

export function edgeStyle(type: string): EdgeStyle {
  return EDGE_STYLES[type] ?? { colour: PALETTE.ink3, width: 1, dash: [4, 4] };
}

/** The highlighted path: heavier than any edge type, in the accent. */
export const PATH_STYLE: EdgeStyle = { colour: PALETTE.signal, width: 4, dash: [] };

/**
 * A job on the map. Each tier differs by size and outline or line weight as
 * well as by tone, so none relies on colour alone:
 * - strong (the skill and its folders): full size and over, with a heavy ring,
 *   and its lines drawn heavier than usual in their own type's pattern;
 * - soft (the defence pages behind the folders): full size, no ring;
 * - faint (the job's other steps): smaller, with a thin dashed ring;
 * - dimmed (everything else): smaller still and pale, with no label.
 */
export const ROUTE_STYLE = {
  strong: { alpha: 1, scale: 1.2, ring: PALETTE.signal, ringWidth: 3, ringGap: 4, edgeExtra: 1.6, edgeAlpha: 1 },
  soft: { alpha: 0.9, scale: 1, edgeAlpha: 0.45 },
  faint: { alpha: 0.55, scale: 0.85, ring: PALETTE.ink3, ringWidth: 1.25, ringGap: 3, ringDash: [3, 3], edgeAlpha: 0.45 },
  dim: { alpha: 0.14, scale: 0.7, edgeAlpha: 0.05 },
} as const;

/** A node's size in map units, from how many edges it has. */
export function nodeRadius(degree: number): number {
  return 5 + Math.min(Math.sqrt(degree) * 2.4, 19);
}

/**
 * A mark's radius on screen at a zoom. Marks shrink more slowly than the map
 * when it is zoomed out, so the whole map stays legible at the size it is
 * fitted to, and never fall below a size that can be seen and pointed at.
 */
export function screenRadius(radius: number, zoom: number): number {
  return Math.max(radius * Math.pow(zoom, 0.6), 2.5);
}

/** Labels: the text, its paper halo and when a mark earns one. */
export const LABEL_STYLE = {
  size: 12,
  weight: 600,
  strongSize: 13,
  strongWeight: 700,
  colour: PALETTE.ink,
  halo: PALETTE.paper,
  haloWidth: 4,
  /** A mark at least this many screen pixels across its radius is offered a label. */
  minRadius: 6,
  /** Longest label before it is cut short with an ellipsis. */
  maxChars: 34,
} as const;

/** The titles over the two layers' regions. */
export const LAYER_TITLE_STYLE = {
  font: '500 11px "Roboto Mono", ui-monospace, Menlo, monospace',
  colour: PALETTE.ink2,
  letterSpacing: '1.1px',
} as const;
