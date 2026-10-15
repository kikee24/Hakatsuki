import { defineConfig } from '@playwright/test';

// Used by `playwright merge-reports` in CI to combine the per-market blob reports into one site:
//   site/index.html                  check matrix (check × market, pass/fail, details)
//   site/playwright-report/          full evidence: steps, screenshots, OCR inputs, traces, videos
export default defineConfig({
  testDir: 'tests',
  reporter: [
    ['html', { outputFolder: 'site/playwright-report', open: 'never' }],
    ['./src/reporting/check-matrix-reporter.ts', { outputDir: 'site', reportLink: 'playwright-report/index.html' }],
  ],
});
