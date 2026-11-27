// @ts-check
/* global URL */
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
export default defineConfig({
  site: 'https://foothold.milux.co.uk',
  output: 'static',
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
