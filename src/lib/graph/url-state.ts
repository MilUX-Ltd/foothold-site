// The view held in the address, so any view can be shared: the selected node,
// the two ends of a path and the view mode, as a query string. Unknown ids and
// values are dropped on the way in, never trusted.

export type ViewMode = '2d' | '3d';

export interface MapState {
  node: string | null;
  from: string | null;
  to: string | null;
  view: ViewMode;
}

export const DEFAULT_STATE: MapState = { node: null, from: null, to: null, view: '2d' };

/** The query string for a state: '' for the default, otherwise starting with '?'. */
export function stateToQuery(state: MapState): string {
  const params = new URLSearchParams();
  if (state.node) params.set('node', state.node);
  if (state.from) params.set('from', state.from);
  if (state.to) params.set('to', state.to);
  if (state.view !== DEFAULT_STATE.view) params.set('view', state.view);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Reads a state from a query string, keeping only ids the map holds. */
export function queryToState(search: string, has: (id: string) => boolean): MapState {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { ...DEFAULT_STATE };
  }
  const id = (key: string) => {
    const value = params.get(key);
    return value !== null && has(value) ? value : null;
  };
  const view = params.get('view');
  return {
    node: id('node'),
    from: id('from'),
    to: id('to'),
    view: view === '3d' ? '3d' : '2d',
  };
}
