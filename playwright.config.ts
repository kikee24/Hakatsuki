import 'dotenv/config';
import { defineConfig, devices, type Project } from '@playwright/test';
import { browserChannel } from './src/config/browser';
import { getProxy } from './src/config/env';
import { activeMarkets, loadMarket } from './src/config/market';
import type { MarketOptions } from './src/fixtures';

// Per market: a "-session" project, run on demand, that opens each account's browser window and
// waits for a manual login if Betsson forgot it (npm run session:funded / session:empty), and the
// scenario project. Scenarios do the same check themselves through the `page` fixture, so they do
// not depend on the session project.
const marketProjects: Project<MarketOptions>[] = activeMarkets().flatMap((id) => {
  const market = loadMarket(id);
  const use = {
    ...devices['Desktop Chrome'],
    channel: browserChannel(),
    // Fixed geometry so screen regions (ROIs) are reproducible between runs and machines.
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    locale: market.locale,
    proxy: getProxy(market),
    marketId: id,
  };
  return [
    {
      name: `${id}-session`,
      testDir: './tests/setup',
      testMatch: /.*\.setup\.ts/,
      timeout: 15 * 60_000,
      use: { marketId: id, trace: 'off', video: 'off', screenshot: 'off' },
    },
    {
      // 1 worker, in file order: keep each account's tests together so the windows are switched
      // as few times as possible.
      name: id,
      testDir: './tests/e2e',
      use,
    },
  ];
});

// A run of the unit tests alone (npm run test:unit) writes its own reports, so it never replaces
// the report, results.json or check matrix of a scenario run.
const requestedProjects = process.argv.flatMap((arg, i, all) =>
  arg.startsWith('--project=') ? [arg.slice('--project='.length)] : arg === '--project' && all[i + 1] ? [all[i + 1]!] : [],
);
const unitOnly = requestedProjects.length > 0 && requestedProjects.every((p) => p === 'unit');
// npm run session:funded / session:empty only (re)open a logged-in window: console output only, so
// they never replace the last scenario run's report either.
const sessionOnly = requestedProjects.length > 0 && requestedProjects.every((p) => p.endsWith('-session'));
// --list runs nothing: it must not write an empty report or check matrix over the last real run.
const listOnly = process.argv.includes('--list');
// In CI every job also writes a blob, merged by the report job (see merge.config.ts). One file name
// per job, so the unit and market blobs do not overwrite each other when downloaded together.
const blob: ['blob', { fileName: string }][] = process.env.CI ? [['blob', { fileName: `report-${requestedProjects.join('-') || 'all'}.zip` }]] : [];

export default defineConfig<MarketOptions>({
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: sessionOnly || listOnly
    ? [['list']]
    : unitOnly
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report-unit' }],
        ['json', { outputFile: 'test-results-unit/results.json' }],
        ...blob,
      ]
    : [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['./src/reporting/check-matrix-reporter.ts', { outputDir: 'check-matrix', reportLink: '../playwright-report/index.html' }],
        // Results dashboard (npm run report): checks, screenshots and videos per scenario and market.
        [
          './src/reporting/dashboard-reporter.ts',
          { outputDir: 'dashboard', reportLink: '../playwright-report/index.html', unitResults: 'test-results-unit/results.json' },
        ],
        ...blob,
      ],
  use: {
    trace: 'on',
    video: 'on',
    screenshot: 'on',
  },
  projects: [
    // Own output folder: running the unit tests must never wipe a scenario run's test-results/.
    { name: 'unit', testDir: './tests/unit', outputDir: 'test-results-unit' },
    ...marketProjects,
  ],
});
