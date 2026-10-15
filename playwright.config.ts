import 'dotenv/config';
import { defineConfig, devices, type Project } from '@playwright/test';
import { getProxy } from './src/config/env';
import { loadMarket, MARKET_IDS } from './src/config/market';
import type { MarketOptions } from './src/fixtures';

const marketProjects: Project<MarketOptions>[] = MARKET_IDS.map((id) => {
  const market = loadMarket(id);
  return {
    name: id,
    testDir: './tests/e2e',
    use: {
      ...devices['Desktop Chrome'],
      // Fixed geometry so screen regions (ROIs) are reproducible between runs and machines.
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      locale: market.locale,
      proxy: getProxy(market),
      marketId: id,
    },
  };
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
  projects: [
    { name: 'unit', testDir: './tests/unit' },
    ...marketProjects,
  ],
});
