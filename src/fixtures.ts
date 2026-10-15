import { test as base, expect } from '@playwright/test';
import { storageStatePath } from './config/auth';
import type { AccountKind } from './config/env';
import { loadGame, type GameConfig } from './config/game';
import { loadMarket, marketUi, type MarketConfig } from './config/market';
import { HudReader } from './game/hud-reader';
import { BalanceMenu } from './pages/balance-menu';
import { CookieBanner } from './pages/cookie-banner';
import { GamePage } from './pages/game-page';
import { OcrEngine } from './vision/ocr';

export interface MarketOptions {
  marketId: string;
  /** Which test account the browser is logged in as; null = anonymous visitor. */
  account: AccountKind | null;
  gameId: string;
}

interface Fixtures {
  market: MarketConfig;
  game: GameConfig;
  ocr: OcrEngine;
  hudReader: HudReader;
  cookies: CookieBanner;
  balanceMenu: BalanceMenu;
  gamePage: GamePage;
}

export const test = base.extend<MarketOptions & Fixtures>({
  marketId: ['betsson-es', { option: true }],
  account: [null, { option: true }],
  gameId: ['wolf-gold', { option: true }],

  // Start already logged in, from the session saved by tests/e2e/auth.setup.ts.
  storageState: async ({ marketId, account }, use) => {
    await use(account ? storageStatePath(marketId, account) : undefined);
  },

  market: async ({ marketId }, use) => use(loadMarket(marketId)),
  game: async ({ gameId }, use) => use(loadGame(gameId)),

  ocr: async ({ market }, use) => {
    const engine = await OcrEngine.create(market.ocrLanguage);
    await use(engine);
    await engine.terminate();
  },
  hudReader: async ({ ocr, game, market }, use) => use(new HudReader(ocr, game, market.language)),

  cookies: async ({ page }, use) => use(new CookieBanner(page)),
  balanceMenu: async ({ page, market }, use) => use(new BalanceMenu(page, marketUi(market))),
  gamePage: async ({ page, market, game }, use) => use(new GamePage(page, market, game)),
});

export { expect };
