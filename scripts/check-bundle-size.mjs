// Build check: the skeleton page ships no JavaScript at all, so this fails if
// any script appears in the built site: a .js or .mjs file, a <script> tag, a
// javascript: link or an inline event handler. Run after astro build.
//
// When a later card adds the map viewer, the rule changes in one place: list the
// allowed files in ALLOWED_SCRIPTS and raise BUDGET to 300 KB compressed (Brotli,
// as served), the limit in the constraints statement. Until then the budget is nil.
// Usage: node scripts/check-bundle-size.mjs (after astro build)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

/** Script files the build may ship, as paths inside dist. None yet. */
export const ALLOWED_SCRIPTS = [];
/** Bytes of allowed script, compressed. The later budget is 300 KB (300 * 1000). */
export const BUDGET = 0;

/** Problems in one HTML document: any script tag, javascript: link or inline handler. */
export function scriptsInHtml(html) {
  const found = [];
  if (/<script\b/i.test(html)) found.push('a <script> tag');
  if (/\bhref\s*=\s*["']?\s*javascript:/i.test(html)) found.push('a javascript: link');
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) found.push('an inline event handler');
  return found;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const dist = new URL('../dist/', import.meta.url).pathname;
  if (!existsSync(dist)) {
    console.error('Bundle-size check could not find dist/; run the build first.');
    process.exit(1);
  }
  const files = walk(dist);
  const problems = [];
  let total = 0;
  for (const file of files) {
    const rel = file.slice(dist.length);
    if (/\.m?js$/.test(rel)) {
      if (ALLOWED_SCRIPTS.includes(rel)) total += brotliCompressSync(readFileSync(file)).length;
      else problems.push(`${rel}: a script file the skeleton does not expect`);
    }
    if (/\.html$/.test(rel)) for (const what of scriptsInHtml(readFileSync(file, 'utf8'))) problems.push(`${rel}: ${what}`);
  }
  if (total > BUDGET) problems.push(`allowed scripts total ${total} bytes compressed, over the budget of ${BUDGET}`);
  if (problems.length) {
    console.error('Bundle-size check FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(`Bundle-size check passed: no script in ${files.length} built files (budget ${BUDGET} bytes; the later budget is 300 KB compressed).`);
}
