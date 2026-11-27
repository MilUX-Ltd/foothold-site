// Where the map's labels go. Pure arithmetic over boxes, so it is tested
// without a canvas; the renderer measures the text and draws what comes back.
//
// Labels are placed in order of priority (the larger node first), each in the
// first of four places beside its mark that is clear: above, below, to the
// right, to the left. A label that finds no clear place is left out, never
// drawn over another. Zooming in spreads the marks, so more labels find room.
// Ties are broken by id, so the same input gives the same labels in any order.

/** [left, top, right, bottom] in screen pixels. */
export type Box = [number, number, number, number];

export interface LabelRequest {
  id: string;
  /** The mark's centre and radius on screen. */
  x: number;
  y: number;
  r: number;
  /** The measured text. */
  width: number;
  height: number;
  priority: number;
}

export type LabelSide = 'above' | 'below' | 'right' | 'left';

export interface PlacedLabel {
  id: string;
  side: LabelSide;
  /** The box the label takes, halo included. */
  box: Box;
  /** Where to draw the text: its centre line and alignment. */
  textX: number;
  textY: number;
  align: 'center' | 'left' | 'right';
}

export interface PlaceOptions {
  /** Boxes no label may cover, such as the marks of other nodes. */
  obstacles?: readonly Box[];
  /** A box every label must stay inside, such as the visible canvas. */
  bounds?: Box;
  /** Space between a mark and its label. */
  gap?: number;
}

const SIDES: readonly LabelSide[] = ['above', 'below', 'right', 'left'];

function candidate(req: LabelRequest, side: LabelSide, gap: number): PlacedLabel {
  const { x, y, r, width: w, height: h } = req;
  if (side === 'above') {
    const cy = y - r - gap - h / 2;
    return { id: req.id, side, box: [x - w / 2, cy - h / 2, x + w / 2, cy + h / 2], textX: x, textY: cy, align: 'center' };
  }
  if (side === 'below') {
    const cy = y + r + gap + h / 2;
    return { id: req.id, side, box: [x - w / 2, cy - h / 2, x + w / 2, cy + h / 2], textX: x, textY: cy, align: 'center' };
  }
  if (side === 'right') {
    const left = x + r + gap;
    return { id: req.id, side, box: [left, y - h / 2, left + w, y + h / 2], textX: left, textY: y, align: 'left' };
  }
  const right = x - r - gap;
  return { id: req.id, side, box: [right - w, y - h / 2, right, y + h / 2], textX: right, textY: y, align: 'right' };
}

const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const inside = (a: Box, b: Box) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];

export function placeLabels(requests: readonly LabelRequest[], options: PlaceOptions = {}): PlacedLabel[] {
  const gap = options.gap ?? 4;
  const obstacles = options.obstacles ?? [];
  const order = [...requests].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: PlacedLabel[] = [];
  for (const req of order) {
    for (const side of SIDES) {
      const label = candidate(req, side, gap);
      if (options.bounds && !inside(label.box, options.bounds)) continue;
      if (obstacles.some((o) => overlaps(label.box, o))) continue;
      if (placed.some((p) => overlaps(label.box, p.box))) continue;
      placed.push(label);
      break;
    }
  }
  return placed;
}
