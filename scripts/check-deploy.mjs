// Post-deploy check: the deployed page returns 200, shows the Foothold marker,
// and carries every security header exactly as public/_headers sets it. A
// missing page must answer 404 with the same headers.
//
// NOT WIRED TO RUN YET. The pipeline calls it only from the deploy jobs, and
// those are gated behind the DEPLOY_ENABLED repository variable. It is kept
// here so the first deploy card switches the gate on and changes nothing else.
// Usage: node scripts/check-deploy.mjs <deployed-url>
/* global setTimeout */
import { readFileSync } from 'node:fs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/check-deploy.mjs <deployed-url>');
  process.exit(2);
}

const expected = Object.fromEntries(
  readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^\s+[A-Za-z-]+:/.test(l))
    .map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A fresh deploy can take a few seconds to reach every Cloudflare location,
// so retry a 404 for up to a minute before judging the page.
let response = await fetch(url, { redirect: 'follow' });
for (let attempt = 1; attempt <= 12 && response.status === 404; attempt++) {
  await wait(5000);
  response = await fetch(url, { redirect: 'follow' });
}
// A redeploy over an earlier version can keep serving the old one for a little
// while; retry until the headers match this build, for up to a minute.
const csp = expected['Content-Security-Policy'];
for (let attempt = 1; attempt <= 12 && response.status === 200 && response.headers.get('Content-Security-Policy') !== csp; attempt++) {
  await wait(5000);
  response = await fetch(url, { redirect: 'follow' });
}

const failures = [];
if (response.status !== 200) failures.push(`expected status 200, got ${response.status}`);
const body = await response.text();
if (!body.includes('Foothold')) failures.push('page body is missing the marker "Foothold"');
if (/<script\b/i.test(body)) failures.push('page body holds a script tag');
const compare = (label, res) => {
  for (const [name, value] of Object.entries(expected)) {
    const actual = res.headers.get(name);
    if (actual !== value) failures.push(`${label}: header ${name}:\n  expected: ${value}\n  actual:   ${actual}`);
  }
};
compare('home page', response);

const missing = await fetch(new URL('/this-page-does-not-exist/', url), { redirect: 'follow' });
if (missing.status !== 404) failures.push(`a missing page should answer 404, got ${missing.status}`);
compare('missing page', missing);

if (failures.length) {
  console.error(`Deploy check FAILED for ${url}\n\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Deploy check passed for ${url}`);
