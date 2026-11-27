import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_NODE_KEYS, validateMap } from '../../src/lib/map-schema.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/foothold-map.json', import.meta.url), 'utf8'));

describe('map schema', () => {
  it('accepts the fixture', () => {
    const result = validateMap(fixture());
    expect(result.ok).toBe(true);
  });

  it('rejects a contact node', () => {
    const raw = fixture();
    raw.nodes.push({ id: 'CRM/contacts/Someone', layer: 'defence', kind: 'contact', name: 'Someone', path: 'CRM/contacts/Someone.md' });
    const result = validateMap(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toContain('contact');
  });

  it.each(FORBIDDEN_NODE_KEYS)('rejects a node that carries %s', (key) => {
    const raw = fixture();
    raw.nodes[0][key] = 'x';
    const result = validateMap(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toContain(key);
  });

  it('rejects a schema_version whose major version is not 1', () => {
    for (const version of ['0.9.0', '2.0.0', '10.0.0']) {
      const raw = fixture();
      raw.schema_version = version;
      expect(validateMap(raw).ok, version).toBe(false);
    }
  });

  it('accepts a later minor version of major 1', () => {
    const raw = fixture();
    raw.schema_version = '1.7.2';
    expect(validateMap(raw).ok).toBe(true);
  });

  it('rejects an edge to a missing node', () => {
    const raw = fixture();
    raw.edges.push({ from: raw.nodes[0].id, to: 'No/such/node', type: 'mentions', origin: 'body' });
    const result = validateMap(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' ')).toContain('No/such/node');
  });

  it('rejects a route step that names a missing skill', () => {
    const raw = fixture();
    raw.routes[0].steps[0].skill_id = 'No/such/skill';
    expect(validateMap(raw).ok).toBe(false);
  });

  it('rejects a file with a missing top-level key', () => {
    const raw = fixture();
    delete raw.routes;
    expect(validateMap(raw).ok).toBe(false);
  });

  it('drops fields the contract does not name', () => {
    const raw = fixture();
    raw.nodes[0].something_new = 'kept out';
    const result = validateMap(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.map.nodes[0]).not.toHaveProperty('something_new');
  });
});
