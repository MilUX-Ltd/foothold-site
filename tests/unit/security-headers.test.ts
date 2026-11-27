import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
const csp = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:')) ?? '';
const directives = Object.fromEntries(
  csp
    .replace('Content-Security-Policy:', '')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [name, ...values] = d.split(/\s+/);
      return [name, values];
    }),
);

describe('security headers baseline', () => {
  it('applies to every path', () => {
    expect(headers).toMatch(/^\/\*$/m);
  });
  it.each([
    ['Content-Security-Policy', "default-src 'none'"],
    ['Content-Security-Policy', "frame-ancestors 'none'"],
    ['Content-Security-Policy', "object-src 'none'"],
    ['Strict-Transport-Security', 'max-age=31536000'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Frame-Options', 'DENY'],
    ['Permissions-Policy', 'camera=()'],
    ['Permissions-Policy', 'geolocation=()'],
  ])('sets %s with %s', (name, fragment) => {
    const line = headers.split('\n').find((l) => l.trim().startsWith(`${name}:`));
    expect(line, `${name} missing`).toBeDefined();
    expect(line).toContain(fragment);
  });
  it('names no host at all, so nothing third-party can load', () => {
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toContain('*');
  });
  it('allows script and data requests from this site only', () => {
    expect(directives['script-src']).toEqual(["'self'"]);
    expect(directives['connect-src']).toEqual(["'self'"]);
  });
  it('allows nothing else the map does not need', () => {
    expect(directives['worker-src']).toBeUndefined();
    expect(directives['frame-src']).toBeUndefined();
    expect(directives['media-src']).toBeUndefined();
  });
  it('allows styles, images and fonts from this site only', () => {
    expect(directives['style-src']).toEqual(["'self'"]);
    expect(directives['img-src']).toEqual(["'self'"]);
    expect(directives['font-src']).toEqual(["'self'"]);
  });
  it('never allows inline script or style', () => {
    expect(headers).not.toContain("'unsafe-inline'");
    expect(headers).not.toContain("'unsafe-eval'");
  });
});
