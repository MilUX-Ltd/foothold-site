// Which edges the map draws. Two kinds are many and say little on their own: a
// page that mentions another, and a page filed in a folder. Drawn all at once
// they bury the rest in a grey fan, so by default they are drawn only for the
// page under the pointer and the selected page. A control in the key turns
// them all on.

/** The kinds drawn only on demand: "mentions" and "filed in". */
export const QUIET_EDGE_TYPES: readonly string[] = ['in_folder', 'mentions'];

export function isQuietType(type: string): boolean {
  return QUIET_EDGE_TYPES.includes(type);
}

export interface EdgeFilter {
  selected: string | null;
  hovered: string | null;
  /** The key's control: draw every edge of every kind. */
  showAll: boolean;
}

/** The edges to draw, in the order given. */
export function edgesToDraw<E extends { from: string; to: string; type: string }>(edges: readonly E[], filter: EdgeFilter): E[] {
  if (filter.showAll) return [...edges];
  const { selected, hovered } = filter;
  const touches = (e: E, id: string | null) => id !== null && (e.from === id || e.to === id);
  return edges.filter((e) => !isQuietType(e.type) || touches(e, selected) || touches(e, hovered));
}
