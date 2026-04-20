import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for Florida Annual Report E2E tests.
 * 
 * Uses local fixture HTML files to mock Sunbiz forms (no live site access).
 * See: tests/e2e/fixtures/sunbiz-mock.html
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  
  // Test file pattern
  testMatch: '**/*.spec.ts',
  
  // Run tests in parallel
  fullyParallel: true,
  
  // Fail the build on CI if test.only is left in source code
  forbidOnly: !!process.env.CI,
  
  // Retry failed tests (once on CI, none locally)
  retries: process.env.CI ? 1 : 0,
  
  // Number of workers
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  // Shared settings for all tests
  use: {
    // Base URL for fixture files
    baseURL: `file://${path.resolve(__dirname, 'tests/e2e/fixtures')}`,
    
    // Collect trace on first retry
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video recording on failure
    video: 'on-first-retry',
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to test additional browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Output folder for test artifacts
  outputDir: 'test-results/',

  // Global timeout for each test
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 5000,
  },
});
