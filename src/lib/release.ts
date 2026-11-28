// The release the install page offers, as the page reads it. Only loadRelease
// reads a file, and it checks what it reads. See src/lib/release-schema.mjs for
// the contract and scripts/fetch-data.mjs for where the checked copy comes from.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { z } from 'zod';
import { formatSize, releaseSchema, validateRelease } from './release-schema.mjs';

export type Release = z.infer<typeof releaseSchema>;
export type PackRelease = Extract<Release, { status: 'released' }>;

/** Where fetch-data.mjs leaves the checked release file. */
export const DEFAULT_RELEASE_FILE = '.foothold/release.json';

/** Reads and checks the release file the build step wrote. Throws, with the problems, if it is not fit to show. */
export function loadRelease(file: string = resolve(process.cwd(), DEFAULT_RELEASE_FILE)): Release {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Could not read the release file at ${file}. Run "npm run data" first.`);
  }
  const result = validateRelease(raw);
  if (!result.ok) throw new Error(`The release file at ${file} does not meet the contract: ${result.problems.slice(0, 5).join('; ')}`);
  return result.release;
}

/** Whether there is a release to offer: the top bar's "Install" and the home page's "Get Foothold" depend on it. */
export function hasRelease(release: Release): release is PackRelease {
  return release.status === 'released';
}

/** The prompt a visitor pastes into their AI tool (wording proposal, section 5). */
export function installPrompt(release: PackRelease): string {
  return `Download ${release.zip}. Check that its SHA-256 checksum is ${release.sha256}. If it is not, stop and tell me. If it is, unzip it and read Start Here.md inside.`;
}

/** The size as the page shows it. */
export function releaseSize(release: PackRelease): string {
  return formatSize(release.size_bytes);
}
