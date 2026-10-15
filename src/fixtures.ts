import { test as base, expect } from '@playwright/test';
import { loadMarket, type MarketConfig } from './config/market';

export interface MarketOptions {
  marketId: string;
}

export const test = base.extend<MarketOptions & { market: MarketConfig }>({
  marketId: ['betsson-es', { option: true }],
  market: async ({ marketId }, use) => {
    await use(loadMarket(marketId));
  },
});

export { expect };
