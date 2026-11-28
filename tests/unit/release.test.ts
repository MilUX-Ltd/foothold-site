// Acceptance tests 1 and 2 for the install page: the release file is checked,
// and the build's comparison with the published checksum passes or fails.
// Made-up values only; nothing here touches the network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checksumsUrl, compareChecksum, formatSize, validateRelease } from '../../src/lib/release-schema.mjs';
import { installPrompt } from '../../src/lib/release';
import { verifyPublished } from '../../scripts/release-check.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/release.json', import.meta.url), 'utf8'));
const committed = () => JSON.parse(readFileSync(new URL('../../data/release.json', import.meta.url), 'utf8'));
const SUMS = readFileSync(new URL('../fixtures/release-SHA256SUMS.txt', import.meta.url), 'utf8');
const OTHER = 'b35fc3c99228304ce6025f0d27eab2d988f184659895a595bf4bf2444a6b9c89';

function released() {
  const result = validateRelease(fixture());
  if (!result.ok || result.release.status !== 'released') throw new Error('the fixture release should be accepted');
  return result.release;
}

describe('1. the release file is read and checked', () => {
  it('accepts the "no release yet" form', () => {
    const result = validateRelease({ status: 'none' });
    expect(result).toEqual({ ok: true, release: { status: 'none' } });
  });

  it('accepts the committed file, which says there is no release yet', () => {
    expect(validateRelease(committed())).toEqual({ ok: true, release: { status: 'none' } });
  });

  it('accepts a release with a version, an address on the pack\'s release downloads and a 64-character checksum', () => {
    const result = validateRelease(fixture());
    expect(result.ok).toBe(true);
    if (result.ok && result.release.status === 'released') {
      expect(result.release.version).toBe('0.0.1');
      expect(result.release.zip).toBe('https://github.com/MilUX-Ltd/foothold/releases/download/v0.0.1/foothold-0.0.1.zip');
      expect(result.release.sha256).toHaveLength(64);
      expect(result.release.size_bytes).toBe(1843200);
    }
  });

  const refused: [string, (r: Record<string, unknown>) => void][] = [
    ['no status', (r) => delete r.status],
    ['an unknown status', (r) => (r.status = 'draft')],
    ['no version', (r) => delete r.version],
    ['a version that is not 1.2.3', (r) => (r.version = 'v0.0.1')],
    ['no address', (r) => delete r.zip],
    ['an address over http', (r) => (r.zip = String(r.zip).replace('https:', 'http:'))],
    ['an address on another host', (r) => (r.zip = String(r.zip).replace('github.com', 'example.com'))],
    ['an address on a look-alike host', (r) => (r.zip = String(r.zip).replace('github.com', 'github.com.example.com'))],
    ['an address in another repository', (r) => (r.zip = String(r.zip).replace('/foothold/releases', '/other/releases'))],
    ['an address on a branch archive', (r) => (r.zip = 'https://github.com/MilUX-Ltd/foothold/archive/refs/heads/main.zip')],
    ['an address on raw files', (r) => (r.zip = 'https://raw.githubusercontent.com/MilUX-Ltd/foothold/main/foothold-0.0.1.zip')],
    ['an address for another version', (r) => (r.zip = String(r.zip).replaceAll('0.0.1', '0.0.2'))],
    ['an address with a query', (r) => (r.zip = `${r.zip}?x=1`)],
    ['an address with a fragment', (r) => (r.zip = `${r.zip}#x`)],
    ['an address with a port', (r) => (r.zip = String(r.zip).replace('github.com', 'github.com:8443'))],
    ['an address with credentials', (r) => (r.zip = String(r.zip).replace('https://', 'https://user@'))],
    ['an address that climbs out of the folder', (r) => (r.zip = 'https://github.com/MilUX-Ltd/foothold/releases/download/v0.0.1/../v0.0.1/foothold-0.0.1.zip')],
    ['no checksum', (r) => delete r.sha256],
    ['a 63-character checksum', (r) => (r.sha256 = String(r.sha256).slice(1))],
    ['a 65-character checksum', (r) => (r.sha256 = `${r.sha256}0`)],
    ['a checksum that is not hexadecimal', (r) => (r.sha256 = 'g'.repeat(64))],
    ['a checksum in capitals', (r) => (r.sha256 = String(r.sha256).toUpperCase())],
    ['no size', (r) => delete r.size_bytes],
    ['a size that is not a whole number of bytes', (r) => (r.size_bytes = 12.5)],
    ['a size of nothing', (r) => (r.size_bytes = 0)],
    ['a field the contract does not name', (r) => (r.notes = 'x')],
  ];
  it.each(refused)('refuses a release with %s', (_name, change) => {
    const raw = fixture();
    change(raw);
    const result = validateRelease(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.length).toBeGreaterThan(0);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a list', []],
    ['text', 'none'],
    ['the "no release yet" form with release fields', { status: 'none', version: '0.0.1' }],
  ])('refuses %s', (_name, raw) => {
    expect(validateRelease(raw).ok).toBe(false);
  });
});

describe('2. the build compares the published checksum with the committed one', () => {
  it('passes when they match', () => {
    expect(compareChecksum(released(), SUMS)).toEqual({ ok: true });
  });

  it('fails when the published checksum differs', () => {
    const result = compareChecksum(released(), `${OTHER}  foothold-0.0.1.zip\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toMatch(/differs/);
  });

  it('fails when the published file does not list the zip', () => {
    const result = compareChecksum(released(), `${released().sha256}  foothold-0.0.2.zip\n`);
    expect(result.ok).toBe(false);
  });

  it('fails when the published file is empty or not a checksum list', () => {
    expect(compareChecksum(released(), '').ok).toBe(false);
    expect(compareChecksum(released(), '<html>Not Found</html>').ok).toBe(false);
  });

  it('fails when the published file lists the zip twice with different checksums', () => {
    const sums = `${released().sha256}  foothold-0.0.1.zip\n${OTHER}  foothold-0.0.1.zip\n`;
    expect(compareChecksum(released(), sums).ok).toBe(false);
  });

  it('reads the usual forms of a checksum list: binary marker, capitals, Windows line ends, other files beside it', () => {
    const sha = released().sha256;
    expect(compareChecksum(released(), `${sha} *foothold-0.0.1.zip\n`)).toEqual({ ok: true });
    expect(compareChecksum(released(), `${sha.toUpperCase()}  foothold-0.0.1.zip\r\n`)).toEqual({ ok: true });
    expect(compareChecksum(released(), `${OTHER}  release-files.txt\n${sha}  foothold-0.0.1.zip\n`)).toEqual({ ok: true });
  });

  it('finds the published checksum list beside the zip, on the same tag', () => {
    expect(checksumsUrl(released())).toBe('https://github.com/MilUX-Ltd/foothold/releases/download/v0.0.1/SHA256SUMS.txt');
  });

  it('fetches only the checksum list and passes when it matches, with a stand-in for the network', async () => {
    const asked: string[] = [];
    const fake = async (url: string) => {
      asked.push(url);
      return new Response(SUMS, { status: 200 });
    };
    await expect(verifyPublished(released(), fake)).resolves.toEqual({ ok: true });
    expect(asked).toEqual(['https://github.com/MilUX-Ltd/foothold/releases/download/v0.0.1/SHA256SUMS.txt']);
  });

  it('fails when the fetched checksum differs, when the fetch answers an error and when it cannot connect', async () => {
    const differs = async () => new Response(`${OTHER}  foothold-0.0.1.zip\n`, { status: 200 });
    const missing = async () => new Response('Not Found', { status: 404 });
    const down = async () => {
      throw new Error('connection refused');
    };
    for (const fake of [differs, missing, down]) {
      const result = await verifyPublished(released(), fake);
      expect(result.ok).toBe(false);
    }
  });
});

describe('the wording built from the release file', () => {
  it('the prompt names the zip address and the checksum from the file', () => {
    const release = released();
    expect(installPrompt(release)).toBe(
      `Download ${release.zip}. Check that its SHA-256 checksum is ${release.sha256}. If it is not, stop and tell me. If it is, unzip it and read Start Here.md inside.`,
    );
  });

  it('gives the size in kilobytes or megabytes', () => {
    expect(formatSize(1843200)).toBe('1.8 MB');
    expect(formatSize(12_000_000)).toBe('12 MB');
    expect(formatSize(640_000)).toBe('640 KB');
    expect(formatSize(900)).toBe('1 KB');
  });
});
