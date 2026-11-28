// Build step: fetch the Foothold map file from the public pack repository,
// check it against the contract in src/lib/map-schema.mjs and write the checked
// copy to .foothold/foothold-map.json (git-ignored; the build reads it).
//
// Then the release the install page offers: read data/release.json, check it
// against src/lib/release-schema.mjs and, if it names a release, fetch the
// checksum list that release publishes and compare. The checked copy goes to
// .foothold/release.json. When the file says there is no release yet, nothing
// is fetched for it.
//
// FOOTHOLD_DATA_REF   the branch, tag or commit of MilUX-Ltd/foothold to read (default: main)
// FOOTHOLD_DATA_SOURCE=fixture   read tests/fixtures/foothold-map.json instead; no network
// FOOTHOLD_RELEASE_SOURCE=fixture   read tests/fixtures/release.json, and compare it with
//                     tests/fixtures/release-SHA256SUMS.txt; no network
//
// A malformed or refused file, or a published checksum that differs from the
// committed one, stops the build with a non-zero exit, so a bad file or a
// replaced zip can never reach the site.
// Usage: node scripts/fetch-data.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { validateMap } from '../src/lib/map-schema.mjs';
import { compareChecksum, validateRelease } from '../src/lib/release-schema.mjs';
import { verifyPublished } from './release-check.mjs';

const OUT_DIR = new URL('../.foothold/', import.meta.url);
const OUT_FILE = new URL('foothold-map.json', OUT_DIR);
const FIXTURE = new URL('../tests/fixtures/foothold-map.json', import.meta.url);
const RELEASE_OUT_FILE = new URL('release.json', OUT_DIR);
const RELEASE_FILE = new URL('../data/release.json', import.meta.url);
const RELEASE_FIXTURE = new URL('../tests/fixtures/release.json', import.meta.url);
const SUMS_FIXTURE = new URL('../tests/fixtures/release-SHA256SUMS.txt', import.meta.url);
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

// The release.
const releaseFixture = process.env.FOOTHOLD_RELEASE_SOURCE === 'fixture';
const releaseLabel = releaseFixture ? 'tests/fixtures/release.json' : 'data/release.json';
let rawRelease;
try {
  rawRelease = JSON.parse(readFileSync(releaseFixture ? RELEASE_FIXTURE : RELEASE_FILE, 'utf8'));
} catch {
  fail(`${releaseLabel} could not be read as JSON`);
}
const checkedRelease = validateRelease(rawRelease);
if (!checkedRelease.ok) fail(`${releaseLabel} does not meet the contract:\n${checkedRelease.problems.map((p) => `  - ${p}`).join('\n')}`);
const { release } = checkedRelease;
if (release.status === 'released') {
  const compared = releaseFixture ? compareChecksum(release, readFileSync(SUMS_FIXTURE, 'utf8')) : await verifyPublished(release);
  if (!compared.ok) fail(`release ${release.version}: ${compared.problem}. Nothing is published until data/release.json and the release agree.`);
}
writeFileSync(RELEASE_OUT_FILE, JSON.stringify(release));
console.log(
  release.status === 'released'
    ? `Foothold release ok: ${release.version}, checksum matches the published one (from ${releaseLabel}${releaseFixture ? ' and its fixture checksum list' : ''}).`
    : `Foothold release: none yet (from ${releaseLabel}); nothing fetched.`,
);
