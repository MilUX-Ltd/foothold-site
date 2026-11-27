// Build check: the script the site ships. The map page runs one bundled module
// from this site; nothing else may run anywhere. It fails on:
//   - an inline script, a script from anywhere but the bundle folder (_astro/),
//     a javascript: link or an inline event handler, in any built page;
//   - a script file outside the bundle folder;
//   - script totalling more than the budget, compressed with Brotli as served.
// The budget is 300 KB compressed, the limit in the constraints statement for
// script before the map is usable. Every script file the build ships counts
// towards it, so the figure is an upper bound on what any page loads.
// Usage: node scripts/check-bundle-size.mjs (after astro build)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

/** Bytes of script, compressed, the built site may ship in all. */
export const BUDGET = 300 * 1000;
/** Where the bundler puts the site's own script. */
export const SCRIPT_DIR = '_astro/';

/** Problems in one HTML document. A bundled module from /_astro/ with an empty body is the only script allowed. */
export function scriptsInHtml(html) {
  const found = [];
  // Each opening tag is found on its own, and its body runs to the next "</script" however
  // that end tag is written: a browser accepts "</script bar>" as readily as "</script>".
  const lower = html.toLowerCase();
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1];
    const start = match.index + match[0].length;
    const end = lower.indexOf('</script', start);
    const body = end === -1 ? html.slice(start) : html.slice(start, end);
    const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (!src || body.trim() !== '') found.push('an inline script');
    else if (!src.startsWith(`/${SCRIPT_DIR}`) || !/\.m?js$/.test(src)) found.push(`a script from outside the bundle: ${src}`);
  }
  if (/\bhref\s*=\s*["']?\s*javascript:/i.test(html)) found.push('a javascript: link');
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) found.push('an inline event handler');
  return found;
}

/**
 * Checks a built site's pages and script files.
 * @param {{ html: { path: string, text: string }[], scripts: { path: string, compressed: number }[] }} site
 * @returns {{ problems: string[], total: number }}
 */
export function checkScripts({ html, scripts }) {
  const problems = [];
  for (const page of html) for (const what of scriptsInHtml(page.text)) problems.push(`${page.path}: ${what}`);
  let total = 0;
  for (const script of scripts) {
    if (!script.path.startsWith(SCRIPT_DIR)) problems.push(`${script.path}: a script file outside ${SCRIPT_DIR}`);
    total += script.compressed;
  }
  if (total > BUDGET) problems.push(`scripts total ${total} bytes compressed, over the budget of ${BUDGET}`);
  return { problems, total };
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
  const files = walk(dist).map((file) => ({ file, rel: file.slice(dist.length) }));
  const html = files.filter((f) => f.rel.endsWith('.html')).map((f) => ({ path: f.rel, text: readFileSync(f.file, 'utf8') }));
  const scripts = files
    .filter((f) => /\.m?js$/.test(f.rel))
    .map((f) => ({
      path: f.rel,
      compressed: brotliCompressSync(readFileSync(f.file), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    }));
  const { problems, total } = checkScripts({ html, scripts });
  if (problems.length) {
    console.error('Bundle-size check FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    process.exit(1);
  }
  const list = scripts.map((s) => `${s.path} ${s.compressed}`).join(', ') || 'none';
  console.log(`Bundle-size check passed: ${scripts.length} script file(s), ${total} bytes compressed (budget ${BUDGET} bytes). ${list}.`);
}
