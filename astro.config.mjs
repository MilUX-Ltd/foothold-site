// @ts-check
/* global URL, process */
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';

// The dev and preview servers send the same security headers as production
// (public/_headers), so local and journey tests run under the real CSP.
const securityHeaders = Object.fromEntries(
  readFileSync(new URL('./public/_headers', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^\s+[A-Za-z-]+:/.test(l))
    .map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
    // HSTS on a local http server would only confuse the browser.
    .filter(([name]) => name !== 'Strict-Transport-Security'),
);

// Static output served by Cloudflare Workers static assets (docs/adr/0002).
// FOOTHOLD_OUT_DIR lets the tests build and serve a second copy of the site
// (dist-release/, with the fixture release) beside the usual one. The deploy
// always uses dist/.
const outDir = process.env.FOOTHOLD_OUT_DIR || 'dist';
if (!/^dist(-[a-z]+)?$/.test(outDir)) throw new Error(`FOOTHOLD_OUT_DIR "${outDir}" must be dist or dist-<name>`);

export default defineConfig({
  site: 'https://foothold.milux.co.uk',
  output: 'static',
  outDir: `./${outDir}`,
  server: { headers: securityHeaders },
  // The dev toolbar injects script and style the policy would block.
  devToolbar: { enabled: false },
  build: {
    // The CSP allows no inline style; inline <style> would be blocked.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      // Assets as files, never inlined as data addresses.
      assetsInlineLimit: 0,
    },
  },
});
