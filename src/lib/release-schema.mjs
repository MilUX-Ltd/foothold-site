// The contract for data/release.json: the pack release the install page offers.
// Shared by the build step (scripts/fetch-data.mjs), the page code and the
// tests, so one definition decides what the site will accept. See CONTEXT.md.
//
// The file is the second, separate place a release's checksum is recorded. It
// changes only by a reviewed pull request; the build compares it with the
// checksum the release publishes and stops if they differ.
//
// Plain JavaScript with no build step, so the Node script can import it. No
// network here: compareChecksum is given the published text.
import { z } from 'zod';

/** Where every release zip must live: the pack repository's release downloads. */
export const RELEASE_ORIGIN = 'https://github.com';
export const RELEASE_PATH = '/MilUX-Ltd/foothold/releases/download/';
/** The checksum list the pack's release publishes beside the zip. */
export const CHECKSUMS_FILE = 'SHA256SUMS.txt';

const version = z.string().regex(/^\d+\.\d+\.\d+$/, 'must look like 1.2.3');

/** The zip's address for a version: the release tagged v<version>, file foothold-<version>.zip. */
export function zipAddress(v) {
  return `${RELEASE_ORIGIN}${RELEASE_PATH}v${v}/foothold-${v}.zip`;
}

const none = z.strictObject({ status: z.literal('none') });

const released = z
  .strictObject({
    status: z.literal('released'),
    version,
    zip: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lower-case hexadecimal characters'),
    size_bytes: z.number().int().positive(),
  })
  .superRefine((r, ctx) => {
    // Parsed, so a look-alike host, a port, credentials, a query or a ".." cannot slip past.
    let url;
    try {
      url = new URL(r.zip);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['zip'], message: 'is not an address' });
      return;
    }
    const exact = url.protocol === 'https:' && url.origin === RELEASE_ORIGIN && !url.username && !url.password && !url.search && !url.hash && r.zip === url.href;
    if (!exact || r.zip !== zipAddress(r.version)) {
      ctx.addIssue({ code: 'custom', path: ['zip'], message: `must be ${zipAddress(r.version)}, the release tagged v${r.version} in the pack repository` });
    }
  });

export const releaseSchema = z.discriminatedUnion('status', [none, released]);

/**
 * Checks a parsed JSON value. Returns { ok: true, release } or { ok: false, problems: string[] }.
 * @param {unknown} raw
 * @returns {{ ok: true, release: z.infer<typeof releaseSchema> } | { ok: false, problems: string[] }}
 */
export function validateRelease(raw) {
  const result = releaseSchema.safeParse(raw);
  if (result.success) return { ok: true, release: result.data };
  const problems = result.error.issues.map((i) => `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`);
  return { ok: false, problems };
}

/**
 * The address of the checksum list published beside a release's zip, on the same tag.
 * @param {{ zip: string }} release
 */
export function checksumsUrl(release) {
  return new URL(CHECKSUMS_FILE, release.zip).href;
}

/**
 * Compares the committed checksum with a published checksum list (the text of
 * SHA256SUMS.txt, in the form sha256sum writes). Passes only if the list names
 * the zip exactly once, or names it more than once with one checksum, and that
 * checksum is the committed one.
 * @param {{ zip: string, sha256: string }} release
 * @param {string} sumsText
 * @returns {{ ok: true } | { ok: false, problem: string }}
 */
export function compareChecksum(release, sumsText) {
  const name = release.zip.slice(release.zip.lastIndexOf('/') + 1);
  const found = new Set();
  for (const line of String(sumsText).split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (match && match[2] === name) found.add(match[1].toLowerCase());
  }
  if (found.size === 0) return { ok: false, problem: `the published checksum list does not name ${name}` };
  if (found.size > 1) return { ok: false, problem: `the published checksum list gives ${name} more than one checksum` };
  const [published] = found;
  if (published !== release.sha256) {
    return { ok: false, problem: `the published checksum of ${name} (${published}) differs from the one in data/release.json (${release.sha256})` };
  }
  return { ok: true };
}

/**
 * A zip's size as the page shows it: whole kilobytes under a megabyte, else
 * megabytes to one decimal place, dropping a trailing ".0". Decimal units.
 * @param {number} bytes
 */
export function formatSize(bytes) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  const mb = Math.round(bytes / 100_000) / 10;
  return `${Number.isInteger(mb) ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
