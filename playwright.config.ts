import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a build made from the committed fixture
// (FOOTHOLD_DATA_SOURCE=fixture), so they never depend on the network.
//
// The install page has two states, so there are two builds. The first, on port
// 4341, holds the committed release file (data/release.json) and serves every
// test by default. The second, on port 4342, is built into dist-release/ with
// the fixture release (FOOTHOLD_RELEASE_SOURCE=fixture) and is used only by the
// tests that ask for it (tests/acceptance/install.spec.ts). Playwright starts
// the servers one after the other, so the two builds never run at once.
const common = { reuseExistingServer: !process.env.CI, timeout: 180_000 };

export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e/**/*.spec.ts', 'acceptance/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4341' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // --ignore-lock keeps the preview server in the foreground under coding agents.
      command: 'FOOTHOLD_DATA_SOURCE=fixture npm run build && npm run preview -- --host 127.0.0.1 --port 4341 --ignore-lock',
      url: 'http://127.0.0.1:4341',
      ...common,
    },
    {
      command:
        'FOOTHOLD_DATA_SOURCE=fixture FOOTHOLD_RELEASE_SOURCE=fixture FOOTHOLD_OUT_DIR=dist-release npm run build && FOOTHOLD_OUT_DIR=dist-release npm run preview -- --host 127.0.0.1 --port 4342 --ignore-lock',
      url: 'http://127.0.0.1:4342',
      ...common,
    },
  ],
});
