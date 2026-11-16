import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}/PrepApp/`,
    trace: 'off',
  },
  webServer: [
    {
      command: `npm run preview -- --port ${port} --strictPort`,
      url: `http://localhost:${port}/PrepApp/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // In-memory CouchDB stand-in for the sync tests.
      command: 'node tests/couchsim/server.cjs',
      url: 'http://localhost:5998/_up',
      env: { PORT: '5998' },
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'iphone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: 'ipad',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
  ],
});
