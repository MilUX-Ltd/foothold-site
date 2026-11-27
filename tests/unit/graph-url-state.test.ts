// Acceptance test 6 for the map page, and test 7 for the four views: the view
// state in the address. The address now names the view (the whole map, who
// buys, how a job runs, at a glance or the network) beside the rest of the
// state; the earlier 2d and 3d values are read as the network view, flat or
// in 3D, so shared addresses keep working.
import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, queryToState, stateToQuery, type MapState } from '../../src/lib/graph/url-state';

const known = new Set(['CRM', 'CRM/organisations/mod/Ministry of Defence', 'Skills/Routes/A tender lands', '.']);
const has = (id: string) => known.has(id);

describe('URL state', () => {
  it.each<MapState>([
    DEFAULT_STATE,
    { node: 'CRM/organisations/mod/Ministry of Defence', from: null, to: null, view: 'map', mode: '2d' },
    { node: null, from: 'Skills/Routes/A tender lands', to: 'CRM', view: 'network', mode: '3d' },
    { node: '.', from: 'CRM', to: '.', view: 'network', mode: '3d' },
  ])('round-trips state to address to state: %o', (state) => {
    expect(queryToState(stateToQuery(state), has)).toEqual(state);
  });

  it('writes nothing for the default state', () => {
    expect(stateToQuery(DEFAULT_STATE)).toBe('');
  });

  it('writes a query string that carries ids with slashes and spaces', () => {
    const query = stateToQuery({ ...DEFAULT_STATE, node: 'CRM/organisations/mod/Ministry of Defence' });
    expect(query.startsWith('?')).toBe(true);
    expect(new URLSearchParams(query).get('node')).toBe('CRM/organisations/mod/Ministry of Defence');
  });

  it('drops unknown ids and keeps the rest', () => {
    expect(queryToState('?node=nope&from=CRM&to=missing&view=3d', has)).toEqual({ node: null, from: 'CRM', to: null, view: 'network', mode: '3d' });
  });

  it('ignores an unknown view mode, unknown keys and malformed input', () => {
    expect(queryToState('?view=4d&colour=red', has)).toEqual(DEFAULT_STATE);
    expect(queryToState('?node=%E0%A4%A', has)).toEqual(DEFAULT_STATE);
    expect(queryToState('', has)).toEqual(DEFAULT_STATE);
  });
});

describe('7. the view in the address', () => {
  it.each<MapState>([
    { ...DEFAULT_STATE, view: 'map' },
    { ...DEFAULT_STATE, view: 'buyers' },
    { ...DEFAULT_STATE, view: 'jobs', node: 'CRM' },
    { ...DEFAULT_STATE, view: 'glance', from: 'CRM', to: '.' },
    { ...DEFAULT_STATE, view: 'network', mode: '2d' },
    { ...DEFAULT_STATE, view: 'network', mode: '3d', node: '.' },
  ])('round-trips: %o', (state) => {
    expect(queryToState(stateToQuery(state), has)).toEqual(state);
  });

  it('writes the view by name, and nothing for the whole map, which is the default', () => {
    expect(stateToQuery({ ...DEFAULT_STATE, view: 'map' })).toBe('');
    expect(new URLSearchParams(stateToQuery({ ...DEFAULT_STATE, view: 'buyers' })).get('view')).toBe('buyers');
    expect(new URLSearchParams(stateToQuery({ ...DEFAULT_STATE, view: 'jobs' })).get('view')).toBe('jobs');
    expect(new URLSearchParams(stateToQuery({ ...DEFAULT_STATE, view: 'glance' })).get('view')).toBe('glance');
    expect(new URLSearchParams(stateToQuery({ ...DEFAULT_STATE, view: 'network' })).get('view')).toBe('network');
  });

  it('reads the earlier 2d and 3d as the network view, flat or in 3D', () => {
    expect(queryToState('?view=2d', has)).toEqual({ ...DEFAULT_STATE, view: 'network', mode: '2d' });
    expect(queryToState('?view=3d', has)).toEqual({ ...DEFAULT_STATE, view: 'network', mode: '3d' });
    expect(queryToState('?view=3d&node=CRM', has)).toEqual({ ...DEFAULT_STATE, view: 'network', mode: '3d', node: 'CRM' });
  });

  it('falls back to the whole map for a view it does not know', () => {
    for (const value of ['geo', 'MAP', '', 'network3d', '4d', 'map ']) {
      expect(queryToState(`?view=${encodeURIComponent(value)}`, has), value).toEqual(DEFAULT_STATE);
    }
  });

  it('keeps the flat mode for every view but the network', () => {
    expect(queryToState(stateToQuery({ ...DEFAULT_STATE, view: 'buyers', mode: '3d' }), has)).toEqual({ ...DEFAULT_STATE, view: 'buyers' });
  });
});
