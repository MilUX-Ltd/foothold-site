// Home page acceptance test 2: label placement.
import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelRequest } from '../../src/lib/graph/labels';
import { seededRandom } from '../../src/lib/graph/layout';

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

function crowd(count: number, seed: number): LabelRequest[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${String(i).padStart(3, '0')}`,
    x: random() * 900,
    y: random() * 600,
    r: 2 + random() * 14,
    width: 40 + random() * 120,
    height: 15,
    priority: Math.floor(random() * 30),
  }));
}

describe('label placement', () => {
  it('never places two labels that overlap', () => {
    const placed = placeLabels(crowd(300, 4));
    expect(placed.length).toBeGreaterThan(10);
    expect(placed.length).toBeLessThan(300);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i].box, placed[j].box), `${placed[i].id} and ${placed[j].id}`).toBe(false);
      }
    }
  });

  it('gives the same labels for the same input, whatever order it arrives in', () => {
    const requests = crowd(200, 8);
    const first = placeLabels(requests);
    expect(placeLabels(requests)).toEqual(first);
    expect(placeLabels([...requests].reverse())).toEqual(first);
  });

  it("places a larger node's label before a smaller one's", () => {
    const placed = placeLabels(crowd(200, 12));
    const byId = new Map(crowd(200, 12).map((r) => [r.id, r]));
    const priorities = placed.map((p) => byId.get(p.id)!.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });

  it('gives the contested place to the larger node and leaves the smaller out when nowhere is free', () => {
    const big: LabelRequest = { id: 'big', x: 100, y: 100, r: 10, width: 80, height: 15, priority: 20 };
    const small: LabelRequest = { id: 'small', x: 100, y: 100, r: 10, width: 80, height: 15, priority: 3 };
    const placed = placeLabels([small, big]);
    expect(placed[0].id).toBe('big');
    // Above the mark is the first place tried, so the larger node takes it.
    expect(placed[0].box[3]).toBeLessThanOrEqual(100 - 10);
    // Block every place the smaller one could go: it is left out, not drawn on top.
    const walled = placeLabels([small, big], { obstacles: [[0, 0, 400, 400]] });
    expect(walled).toEqual([]);
  });

  it('keeps labels clear of the marks it is told about and inside the bounds', () => {
    const requests = crowd(120, 21);
    const obstacles: Box[] = [[300, 200, 420, 320]];
    const bounds: Box = [0, 0, 900, 600];
    for (const label of placeLabels(requests, { obstacles, bounds })) {
      expect(overlaps(label.box, obstacles[0])).toBe(false);
      expect(label.box[0]).toBeGreaterThanOrEqual(0);
      expect(label.box[2]).toBeLessThanOrEqual(900);
      expect(label.box[1]).toBeGreaterThanOrEqual(0);
      expect(label.box[3]).toBeLessThanOrEqual(600);
    }
  });
});
