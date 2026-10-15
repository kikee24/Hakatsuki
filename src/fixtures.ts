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
  //
  // Playwright's own trace/video/screenshots only cover the browser it launched, which stays blank
  // here, so this tab is traced explicitly and attached as "trace" (View trace in the report).
  // That trace holds the live session's network traffic (cookies, tokens): recorded locally only,
  // never in CI where it would end up in an artifact, unless TRACE_LIVE=1.
  page: async ({ page, account, market, viewport }, use, testInfo) => {
    if (!account) return use(page);
    await ensureLoggedIn(market, account, 2 * 60_000);
    const browser = await connectLiveBrowser(account);
    const context = browser.contexts()[0]!;
    const traced = !process.env.CI || process.env.TRACE_LIVE === '1';
    if (traced) await context.tracing.start({ screenshots: true, snapshots: true, title: testInfo.title });
    const tab = await context.newPage();
    try {
      // Same geometry as the launched browser, so the calibrated game regions apply.
      if (viewport) await tab.setViewportSize(viewport);
      await use(tab);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        const shot = await tab.screenshot().catch(() => undefined);
        if (shot) await testInfo.attach('screenshot on failure', { body: shot, contentType: 'image/png' });
      }
      if (traced) {
        const path = testInfo.outputPath('trace.zip');
        await context.tracing.stop({ path }).then(
          () => testInfo.attach('trace', { path, contentType: 'application/zip' }),
          () => undefined,
        );
      }
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
