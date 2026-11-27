// The view held in the address, so any view can be shared: the view shown,
// the selected node, the two ends of a path, the network view's mode, and the
// job open with the step shown, as a query string. Unknown ids and values are
// dropped on the way in, never trusted.
//
// `view` names the view: map (the whole map, the default, so never written),
// buyers, jobs, glance or network. The network view's 3D mode is written as
// `view=3d`. Addresses shared before the four views existed said `view=2d` or
// `view=3d` for the free-form network; both are still read as the network
// view, flat or in 3D. A view the site does not know falls back to the whole
// map.
//
// A job is `route` (the route's id) and `step` (counting from 1). An unknown
// route is dropped with its step; a step outside the route's range is dropped
// and the route kept. A path and a job are not shown together: asking for a
// path closes the job, so an address holding both ends of a path drops the job.
import { isViewName, type ViewName } from './view-common';

/** The network view drawn flat or in 3D. */
export type ViewMode = '2d' | '3d';

export interface MapState {
  node: string | null;
  from: string | null;
  to: string | null;
  view: ViewName;
  /** The network view's mode; always flat for the other views. */
  mode: ViewMode;
  /** The job open on the map. Absent when there is none. */
  route?: string | null;
  /** The step of that job shown, counting from 1; null for the whole job. */
  step?: number | null;
}

export const DEFAULT_STATE: MapState = { node: null, from: null, to: null, view: 'map', mode: '2d' };

/** The value of `view` in the address for a view and mode; null for the default. */
function viewParam(view: ViewName, mode: ViewMode): string | null {
  if (view === 'map') return null;
  if (view === 'network' && mode === '3d') return '3d';
  return view;
}

/** The query string for a state: '' for the default, otherwise starting with '?'. */
export function stateToQuery(state: MapState): string {
  const params = new URLSearchParams();
  const view = viewParam(state.view, state.mode);
  if (view) params.set('view', view);
  if (state.node) params.set('node', state.node);
  if (state.from) params.set('from', state.from);
  if (state.to) params.set('to', state.to);
  if (state.route) {
    params.set('route', state.route);
    if (state.step) params.set('step', String(state.step));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Reads `view`: a view's name, or the earlier 2d and 3d for the network. */
function readView(value: string | null): { view: ViewName; mode: ViewMode } {
  if (value === '2d') return { view: 'network', mode: '2d' };
  if (value === '3d') return { view: 'network', mode: '3d' };
  if (isViewName(value)) return { view: value, mode: '2d' };
  return { view: 'map', mode: '2d' };
}

/**
 * Reads a state from a query string, keeping only ids the map holds. `stepsIn`
 * gives the number of steps in a route, or null for an id that is not a route;
 * without it no job is read. The state carries `route` and `step` only when a
 * job is held.
 */
export function queryToState(search: string, has: (id: string) => boolean, stepsIn?: (route: string) => number | null): MapState {
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
  const { view, mode } = readView(params.get('view'));
  const state: MapState = { node: id('node'), from: id('from'), to: id('to'), view, mode };
  const route = params.get('route');
  if (route === null || !stepsIn || (state.from && state.to)) return state;
  const count = stepsIn(route);
  if (count === null || count < 1) return state;
  const raw = params.get('step');
  const step = raw !== null && /^[1-9]\d*$/.test(raw) && Number(raw) <= count ? Number(raw) : null;
  return { ...state, route, step };
}
