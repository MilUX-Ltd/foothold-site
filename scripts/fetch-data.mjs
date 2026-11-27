// Build step: fetch the Foothold map file from the public pack repository,
// check it against the contract in src/lib/map-schema.mjs and write the checked
// copy to .foothold/foothold-map.json (git-ignored; the build reads it).
//
// FOOTHOLD_DATA_REF   the branch, tag or commit of MilUX-Ltd/foothold to read (default: main)
// FOOTHOLD_DATA_SOURCE=fixture   read tests/fixtures/foothold-map.json instead; no network
//
// A malformed or refused file stops the build with a non-zero exit, so a bad
// file can never reach the site.
// Usage: node scripts/fetch-data.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { validateMap } from '../src/lib/map-schema.mjs';

const OUT_DIR = new URL('../.foothold/', import.meta.url);
const OUT_FILE = new URL('foothold-map.json', OUT_DIR);
const FIXTURE = new URL('../tests/fixtures/foothold-map.json', import.meta.url);
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

function fail(message) {
  console.error(`Foothold data refused: ${message}`);
  process.exit(1);
}

async function readSource() {
  if (process.env.FOOTHOLD_DATA_SOURCE === 'fixture') {
    return { label: 'tests/fixtures/foothold-map.json', text: readFileSync(FIXTURE, 'utf8') };
  }
  const ref = process.env.FOOTHOLD_DATA_REF || 'main';
  if (!REF_PATTERN.test(ref) || ref.includes('..')) fail(`FOOTHOLD_DATA_REF "${ref}" is not a plain branch, tag or commit name`);
  const url = `https://raw.githubusercontent.com/MilUX-Ltd/foothold/${ref}/data/foothold-map.json`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    fail(`could not fetch ${url}: ${error instanceof Error ? error.message : error}`);
  }
  if (!response.ok) fail(`${url} answered ${response.status}`);
  return { label: url, text: await response.text() };
}

const { label, text } = await readSource();
let raw;
try {
  raw = JSON.parse(text);
} catch {
  fail(`${label} is not valid JSON`);
}
const result = validateMap(raw);
if (!result.ok) {
  const shown = result.problems.slice(0, 10).map((p) => `  - ${p}`).join('\n');
  const more = result.problems.length > 10 ? `\n  ... and ${result.problems.length - 10} more` : '';
  fail(`${label} does not meet the contract:\n${shown}${more}`);
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(result.map));
const { map } = result;
console.log(`Foothold data ok: ${map.nodes.length} nodes, ${map.edges.length} edges, ${map.routes.length} routes, pack ${map.pack_version}, schema ${map.schema_version} (from ${label}).`);
