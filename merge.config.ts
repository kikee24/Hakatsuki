import { defineConfig } from '@playwright/test';

// Used by `playwright merge-reports` in CI to combine the unit and per-market blob reports into
// the published site:
//   site/index.html                  results dashboard: every check per scenario and market with its
//                                    explanation, screenshots and video, plus the unit tests
//   site/check-matrix/               check matrix (check × market) as HTML, Markdown and JSON
//   site/playwright-report/          full Playwright report: steps, OCR inputs, attachments
export default defineConfig({
  testDir: 'tests',
  reporter: [
    ['html', { outputFolder: 'site/playwright-report', open: 'never' }],
    ['./src/reporting/dashboard-reporter.ts', { outputDir: 'site', reportLink: 'playwright-report/index.html' }],
    ['./src/reporting/check-matrix-reporter.ts', { outputDir: 'site/check-matrix', reportLink: '../playwright-report/index.html' }],
  ],
});
