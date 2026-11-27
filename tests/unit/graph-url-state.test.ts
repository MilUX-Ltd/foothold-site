// Acceptance test 6: the view state in the address.
import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, queryToState, stateToQuery, type MapState } from '../../src/lib/graph/url-state';

const known = new Set(['CRM', 'CRM/organisations/mod/Ministry of Defence', 'Skills/Routes/A tender lands', '.']);
const has = (id: string) => known.has(id);

describe('URL state', () => {
  it.each<MapState>([
    DEFAULT_STATE,
    { node: 'CRM/organisations/mod/Ministry of Defence', from: null, to: null, view: '2d' },
    { node: null, from: 'Skills/Routes/A tender lands', to: 'CRM', view: '3d' },
    { node: '.', from: 'CRM', to: '.', view: '3d' },
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
    expect(queryToState('?node=nope&from=CRM&to=missing&view=3d', has)).toEqual({ node: null, from: 'CRM', to: null, view: '3d' });
  });

  it('ignores an unknown view mode, unknown keys and malformed input', () => {
    expect(queryToState('?view=4d&colour=red', has)).toEqual(DEFAULT_STATE);
    expect(queryToState('?node=%E0%A4%A', has)).toEqual(DEFAULT_STATE);
    expect(queryToState('', has)).toEqual(DEFAULT_STATE);
  });
});
