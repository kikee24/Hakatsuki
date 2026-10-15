import 'dotenv/config';
import { defineConfig, devices, type Project } from '@playwright/test';
import { browserChannel } from './src/config/browser';
import { getProxy } from './src/config/env';
import { activeMarkets, loadMarket } from './src/config/market';
import type { MarketOptions } from './src/fixtures';

const AUTH_SETUP = /auth\.setup\.ts/;

// Per market: a "-setup" project that logs in (no trace/video, credentials are typed there) and
// the scenario project, which depends on it and starts from the saved sessions.
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
      name: `${id}-setup`,
      testDir: './tests/e2e',
      testMatch: AUTH_SETUP,
      use: { ...use, trace: 'off', video: 'off', screenshot: 'off' },
    },
    {
      name: id,
      testDir: './tests/e2e',
      testIgnore: AUTH_SETUP,
      dependencies: [`${id}-setup`],
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
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    trace: 'on',
    video: 'on',
    screenshot: 'on',
  },
  projects: [{ name: 'unit', testDir: './tests/unit' }, ...marketProjects],
});
