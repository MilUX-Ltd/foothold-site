// Fails if the repository text or the built site holds something that must never
// be published: a decision-log id, a card-number reference, a private vault path
// or an absolute home path. The repository text is also held to the house rule of
// no em-dashes. Run it after a build so dist/ is checked as well; without dist/ it
// checks the repository alone and says so.
// Usage: node scripts/check-public-terms.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RULES = [
  { name: 'a decision-log id', pattern: /\bD-[a-z0-9]{5}(?![a-z0-9])/ },
  { name: 'a card-number reference', pattern: /\bcards?\s*(?:no\.?|number|#|=)?\s*#?\d{3,}/i },
  { name: 'a private vault path', pattern: /Initiatives\/|~\/AI\b|\/AI\/MilUX|agent-con[f]ig/ },
  { name: 'an absolute home path', pattern: /\/Users\/[^\s/]+|\/home\/[^\s/]+|[A-Za-z]:\\Users\\/ },
];
const EM_DASH = { name: 'an em-dash', pattern: /\u2014/ };

/**
 * Problems in one text. Built output is not held to the em-dash rule, because
 * it carries the pack's own words, which the pack's checks govern.
 * @param {string} text
 * @param {{ built?: boolean }} [options]
 * @returns {string[]} the names of the rules the text breaks
 */
export function findProblems(text, options = {}) {
  const rules = options.built ? RULES : [...RULES, EM_DASH];
  return rules.filter((rule) => rule.pattern.test(text)).map((rule) => rule.name);
}

const SKIP = /\.(woff2?|png|ico|jpe?g|gif|webp|pdf|zip)$/i;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function check(files, options) {
  const failures = [];
  for (const file of files) {
    if (SKIP.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    const problems = findProblems(text, options);
    if (problems.length) failures.push(`${file}: ${problems.join(', ')}`);
  }
  return failures;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  // Tracked files and new files not yet tracked, but never ignored ones.
  const repoFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && existsSync(f));
  const failures = check(repoFiles, {});
  const dist = new URL('../dist/', import.meta.url).pathname;
  let builtCount = 0;
  if (existsSync(dist)) {
    const built = walk(dist);
    builtCount = built.length;
    failures.push(...check(built, { built: true }).map((f) => f.replace(dist, 'dist/')));
  }
  if (failures.length) {
    console.error('Public-terms check FAILED. Remove these before publishing:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log(`Public-terms check passed (${repoFiles.length} repository files${builtCount ? `, ${builtCount} built files` : ', no build to check'}).`);
}
