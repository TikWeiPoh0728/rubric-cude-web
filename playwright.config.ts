import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: a real browser drives the real app.
 *
 *   npm run e2e
 *
 * It uses the Microsoft Edge that is already installed (no browser download); to use
 * Chrome instead, change `channel` to 'chrome'. The dev server is started for you,
 * or reused if it is already running on this port.
 */
const PORT = 4300;

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 900 },
    // The 3D view needs WebGL; software rendering makes it work without a GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    // No live reload: a reload in the middle of a test would wipe the cube.
    command: `npx ng serve --port ${PORT} --host 127.0.0.1 --live-reload=false`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
