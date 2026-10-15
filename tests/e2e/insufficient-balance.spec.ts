import { loadMarket, lobbyUrl, MARKET_IDS } from '../../src/config/market';
import { formatMoney } from '../../src/domain/money';
import { findKeyword } from '../../src/domain/text-match';
import { attachHud, attachJson, attachOcr, attachPng, attachSpin, hudValues } from '../../src/evidence/attach';
import { requireCreditAndBet } from '../../src/game/hud';
import { watchSpin } from '../../src/game/spin-watcher';
import { expect, test } from '../../src/fixtures';
import { Checks } from '../../src/reporting/checks';

test.use({ account: 'EMPTY' });

test('Scenario 2 — insufficient balance', async ({ page, market, game, cookies, balanceMenu, gamePage, hudReader }, testInfo) => {
  const checks = new Checks(testInfo);
  const money = (cents: number | null | undefined) =>
    cents === null || cents === undefined ? 'not read' : formatMoney({ cents, currency: market.currency }, market.locale);
  // Insufficient-funds wording of markets in other languages: the message must not match those.
  const foreignKeywords = MARKET_IDS.map(loadMarket)
    .filter((m) => m.language !== market.language)
    .flatMap((m) => m.insufficientFundsKeywords);

  await test.step('Open the casino lobby as the player without balance', async () => {
    await page.goto(lobbyUrl(market));
    await cookies.rejectAllIfShown();
  });

  const betssonBefore = await test.step('Read the Betsson balance before the attempt', () => balanceMenu.read());
  await attachPng(testInfo, 'Betsson balance before', betssonBefore.evidence);
  await checks.verify(
    'S2-01',
    'Betsson balance is shown in the market currency',
    () => expect.soft(betssonBefore.withdrawable.currency).toBe(market.currency),
    `${money(betssonBefore.withdrawable.cents)} (expected ${market.currency})`,
  );

  await test.step('Launch the Pragmatic Play game', () => gamePage.open());
  const mode = await test.step('Enter Real Play', () => gamePage.ensureRealPlay());
  await attachJson(testInfo, 'Play mode', mode);
  await checks.verify(
    'S2-02',
    'Game runs in Real Play with the Pragmatic Play provider',
    () => {
      expect.soft(mode.real).toBe(true);
      expect.soft(mode.launcherProvider).toBe('PragmaticPlay');
    },
    `practice banner hidden: ${mode.practiceBannerHidden}, launcher forReal: ${mode.launcherForReal}, provider: ${mode.launcherProvider}`,
  );

  const before = await test.step('Wait until the game HUD is readable', () => gamePage.waitUntilReady(hudReader));
  await attachHud(testInfo, 'HUD before attempt', before, await gamePage.capture());
  const { credit, bet } = requireCreditAndBet(before);
  await checks.verify(
    'S2-03',
    'In-game credit and wager are shown in the market currency',
    () => {
      expect.soft(credit.currency).toBe(market.currency);
      expect.soft(bet.currency).toBe(market.currency);
    },
    `credit ${money(credit.cents)}, wager ${money(bet.cents)}`,
  );
  expect(credit.cents, 'Precondition: the account must not cover the wager').toBeLessThan(bet.cents);

  // Same watcher as a real spin: if the game took the wager or showed a spin, it would be recorded.
  const attempt = await test.step('Try to spin', () =>
    watchSpin({
      capture: () => gamePage.capture(),
      readHud: (frame) => hudReader.read(frame),
      trigger: () => gamePage.clickSpin(),
      baseline: { creditCents: credit.cents, betCents: bet.cents },
      reelsRegion: game.regions.reels,
      intervalMs: 300,
      startTimeoutMs: 8_000,
      timeoutMs: 20_000,
    }),
  );
  await attachSpin(testInfo, 'Attempt', attempt);
  const signals = attempt.outcome.startSignals;
  await checks.verify(
    'S2-04',
    'Spin is rejected: no wager taken and no spin in progress shown',
    () => {
      expect.soft(signals).not.toContain('wager-deducted');
      expect.soft(signals).not.toContain('status-text');
      expect.soft(attempt.outcome.settled).toBe(false);
    },
    `signals seen: ${signals.join(', ') || 'none'} (reel motion alone can be the pop-up appearing)`,
  );

  const message = await test.step('Read the message shown by the game', () =>
    gamePage.waitForMessage(hudReader, market.insufficientFundsKeywords),
  );
  await attachPng(testInfo, 'Message frame', message.frame);
  await attachOcr(testInfo, 'Message', message.ocr);
  await checks.verify(
    'S2-05',
    'Player sees an insufficient-balance message',
    () => expect.soft(message.keyword, 'insufficient-balance wording on screen').not.toBeNull(),
    `matched "${message.keyword ?? 'nothing'}" in: ${message.ocr.text.replace(/\s+/g, ' ').trim()}`,
  );
  const foreign = findKeyword(message.ocr.text, foreignKeywords);
  await checks.verify(
    'S2-06',
    `Message is in the market language (${market.language})`,
    () => {
      expect.soft(message.keyword).not.toBeNull();
      expect.soft(foreign, 'wording from another language').toBeNull();
    },
    `market wording: ${message.keyword ?? 'none'}; other-language wording: ${foreign ?? 'none'}`,
  );

  await test.step('Close the message by its button caption', async () => {
    const button = await hudReader.findDismissButton(message.frame);
    if (button) await gamePage.clickRegion(button.region);
    testInfo.annotations.push({ type: 'dismiss', description: button ? `clicked "${button.text}"` : 'button caption not found' });
  });

  const after = await test.step('Read the in-game credit after the attempt', () => gamePage.readHud(hudReader));
  await attachHud(testInfo, 'HUD after attempt', after, await gamePage.capture());
  await checks.verify(
    'S2-07',
    'In-game credit did not change',
    () => expect.soft(after.credit?.cents).toBe(credit.cents),
    `before ${money(credit.cents)}, after ${money(after.credit?.cents)}`,
  );

  const betssonAfter = await test.step('Read the Betsson balance after the attempt', () => balanceMenu.read());
  await attachPng(testInfo, 'Betsson balance after', betssonAfter.evidence);
  await checks.verify(
    'S2-08',
    'Betsson balance did not change',
    () => expect.soft(betssonAfter.withdrawable.cents).toBe(betssonBefore.withdrawable.cents),
    `before ${money(betssonBefore.withdrawable.cents)}, after ${money(betssonAfter.withdrawable.cents)}`,
  );

  await attachJson(testInfo, 'Summary', {
    market: market.id,
    currency: market.currency,
    hudBefore: hudValues(before),
    hudAfter: hudValues(after),
    betssonBeforeCents: betssonBefore.withdrawable.cents,
    betssonAfterCents: betssonAfter.withdrawable.cents,
    messageKeyword: message.keyword,
    checks: checks.records,
  });
});
