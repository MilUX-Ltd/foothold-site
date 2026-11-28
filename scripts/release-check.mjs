// The build's network step for a release: fetch the checksum list the release
// publishes beside its zip and compare it with the committed one. A thin
// wrapper round compareChecksum (src/lib/release-schema.mjs), which holds the
// logic; the fetch is passed in so the tests use a stand-in and touch no network.
import { checksumsUrl, compareChecksum } from '../src/lib/release-schema.mjs';

/**
 * @param {{ zip: string, sha256: string }} release a checked release (status "released")
 * @param {(url: string, init?: object) => Promise<Response>} [fetchImpl]
 * @returns {Promise<{ ok: true } | { ok: false, problem: string }>}
 */
export async function verifyPublished(release, fetchImpl = fetch) {
  const url = checksumsUrl(release);
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    return { ok: false, problem: `could not fetch ${url}: ${error instanceof Error ? error.message : error}` };
  }
  if (!response.ok) return { ok: false, problem: `${url} answered ${response.status}` };
  return compareChecksum(release, await response.text());
}
