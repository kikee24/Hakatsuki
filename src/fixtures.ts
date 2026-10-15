import { test as base, expect } from '@playwright/test';
import type { AccountKind } from './config/env';
import { loadGame, type GameConfig } from './config/game';
import { loadMarket, marketUi, type MarketConfig } from './config/market';
import { HudReader } from './game/hud-reader';
import { BalanceMenu } from './pages/balance-menu';
import { CookieBanner } from './pages/cookie-banner';
import { GamePage } from './pages/game-page';
import { ensureLoggedIn } from './session/ensure-session';
import { connectLiveBrowser } from './session/live-browser';
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

  // With an account, `page` is a new tab in that account's hand-logged-in window (src/session/):
  // Betsson's bot protection blocks automated logins and the session cannot be copied to another
  // browser. The other account's window is closed first (one account per device at a time).
  // The tab is closed afterwards; the window and its session stay open for the next test.
  page: async ({ page, account, market, viewport }, use) => {
    if (!account) return use(page);
    await ensureLoggedIn(market, account, 2 * 60_000);
    const browser = await connectLiveBrowser(account);
    const tab = await browser.contexts()[0]!.newPage();
    try {
      // Same geometry as the launched browser, so the calibrated game regions apply.
      if (viewport) await tab.setViewportSize(viewport);
      await use(tab);
    } finally {
      await tab.close().catch(() => undefined);
      await browser.close(); // disconnects only
    }
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
