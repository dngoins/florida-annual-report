/**
 * Playwright Test Configuration
 * 
 * Configuration for Sunbiz automation integration tests.
 * Uses mock HTML fixtures to test form filling without hitting live Sunbiz.
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: '../../../test-results/html' }],
    ['json', { outputFile: '../../../test-results/results.json' }]
  ],
  
  use: {
    baseURL: 'file://',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  // Local mock server for fixture serving
  webServer: process.env.USE_MOCK_SERVER ? {
    command: 'npx serve fixtures -p 3333',
    port: 3333,
    reuseExistingServer: !process.env.CI,
  } : undefined,
});
