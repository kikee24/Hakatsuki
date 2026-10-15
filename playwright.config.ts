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

export default defineConfig<MarketOptions>({
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['./src/reporting/check-matrix-reporter.ts', { outputDir: 'check-matrix', reportLink: '../playwright-report/index.html' }],
    // In CI each market job also writes a blob; the report job merges them (see merge.config.ts).
    ...(process.env.CI ? [['blob'] as ['blob']] : []),
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
