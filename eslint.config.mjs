// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default tseslint.config(
  {
    ignores: ['dist/', 'dist-release/', '.astro/', '.wrangler/', 'node_modules/', 'playwright-report/', 'test-results/', '.claude/', '.foothold/'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    // Leading underscore marks a deliberately unused argument; a rest sibling
    // is how an object is copied without a key.
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }] },
  },
  {
    files: ['scripts/**/*.mjs', 'src/**/*.mjs'],
    languageOptions: {
      globals: { AbortSignal: 'readonly', console: 'readonly', fetch: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
);
