import { lobbyUrl } from '../../src/config/market';
import { reconcileBalance, type BalanceCheck } from '../../src/domain/balance-rule';
import { formatMoney } from '../../src/domain/money';
import { attachHud, attachJson, attachPng, attachSpin, hudValues } from '../../src/evidence/attach';
import { requireCreditAndBet } from '../../src/game/hud';
import { watchSpin } from '../../src/game/spin-watcher';
import { expect, test } from '../../src/fixtures';
import { SCENARIOS } from '../../src/reporting/check-catalog';
import { Checks } from '../../src/reporting/checks';

const C = SCENARIOS.spinCompleted.checks;

// Playwright's own trace/video/screenshots would record its idle launched browser (blank pages):
// the hand-logged-in tab is traced by the page fixture instead.
test.use({ account: 'FUNDED', trace: 'off', video: 'off', screenshot: 'off' });

test(SCENARIOS.spinCompleted.title, async ({ page, market, game, cookies, balanceMenu, gamePage, hudReader }, testInfo) => {
  // A bonus round can add a few minutes to the spin.
  test.setTimeout(10 * 60_000);
  const checks = new Checks(testInfo);
  const money = (cents: number | null) => (cents === null ? 'not read' : formatMoney({ cents, currency: market.currency }, market.locale));
  const rule = (r: BalanceCheck) =>
    `${money(r.beforeCents)} − ${money(r.wagerCents)} + ${money(r.payoutCents)} = ${money(r.expectedAfterCents)}; seen ${money(r.afterCents)}`;

  await test.step('Open the casino lobby as the funded player', async () => {
    await page.goto(lobbyUrl(market));
    await cookies.rejectAllIfShown();
  });

  const betssonBefore = await test.step('Read the Betsson balance before the spin', () => balanceMenu.read());
  await attachPng(testInfo, 'Betsson balance before', betssonBefore.evidence);
  await checks.verify(
    C.betssonCurrency,
    () => expect.soft(betssonBefore.withdrawable.currency).toBe(market.currency),
    `${money(betssonBefore.withdrawable.cents)} (expected ${market.currency})`,
  );

  await test.step('Launch the Pragmatic Play game', () => gamePage.open());
  await attachJson(testInfo, 'Game session (DGOJ)', gamePage.gameSessionPasses);
  const mode = await test.step('Enter Real Play', () => gamePage.ensureRealPlay());
  await attachJson(testInfo, 'Play mode', mode);
  await checks.verify(
    C.realPlay,
    () => expect.soft(mode.real).toBe(true),
    `practice banner hidden: ${mode.practiceBannerHidden}, launcher forReal: ${mode.launcherForReal}`,
  );
  await checks.verify(
    C.provider,
    () => expect.soft(mode.launcherProvider).toBe('PragmaticPlay'),
    `launcher provider: ${mode.launcherProvider}`,
  );

  await test.step('Wait until the game HUD is readable', () => gamePage.waitUntilReady(hudReader));
  const ready = await test.step('Lower the bet to the minimum', () => gamePage.lowerBetToMinimum(hudReader));
  const beforeFrame = await gamePage.capture();
  await attachHud(testInfo, 'HUD before spin', ready, beforeFrame);
  const { credit, bet } = requireCreditAndBet(ready);

  await checks.verify(
    C.gameCurrency,
    () => {
      expect.soft(credit.currency).toBe(market.currency);
      expect.soft(bet.currency).toBe(market.currency);
    },
    `credit ${money(credit.cents)}, wager ${money(bet.cents)}`,
  );
  await checks.verify(
    C.creditMatchesBetsson,
    () => expect.soft(credit.cents).toBe(betssonBefore.withdrawable.cents),
    `in game ${money(credit.cents)}, Betsson ${money(betssonBefore.withdrawable.cents)}`,
  );
  expect(credit.cents, 'Precondition: the funded account must cover the wager').toBeGreaterThanOrEqual(bet.cents);

  const spin = await test.step('Spin and watch the screen until the result settles', () =>
    watchSpin({
      capture: () => gamePage.capture(),
      readHud: (frame) => hudReader.read(frame),
      trigger: () => gamePage.clickSpin(),
      baseline: { creditCents: credit.cents, betCents: bet.cents },
      reelsRegion: game.regions.reels,
      intervalMs: 300,
      startTimeoutMs: 15_000,
      timeoutMs: 90_000,
      // Bonus rounds (free spins after three scatters): press the "pulse en cualquier parte" screens
      // like a player and wait for the round to finish, so the payout is the bonus total.
      readPrompt: async (frame) => (await hudReader.readContinuePrompt(frame)).shown,
      pressToContinue: () => gamePage.clickRegion(game.regions.bonusContinue),
      bonusTimeoutMs: 300_000,
    }),
  );
  await attachSpin(testInfo, 'Spin', spin);
  const outcome = spin.outcome;
  if (outcome.bonus) {
    testInfo.annotations.push({ type: 'bonus', description: `bonus round played; prompts pressed: ${spin.bonusPresses}` });
  }

  await checks.verify(
    C.spinStarted,
    () => expect.soft(outcome.startSignals.length).toBeGreaterThanOrEqual(2),
    `signals: ${outcome.startSignals.join(', ') || 'none'}`,
  );
  await checks.verify(
    C.wagerCharged,
    () => expect.soft(outcome.creditAfterWagerCents).toBe(credit.cents - bet.cents),
    `credit went ${money(credit.cents)} → ${money(outcome.creditAfterWagerCents)} with a displayed wager of ${money(bet.cents)}`,
  );
  await checks.verify(
    C.spinSettled,
    () => expect.soft(outcome.settled).toBe(true),
    outcome.changes.map((c) => `${c.to} at ${c.atMs} ms (${c.reason})`).join('; ') || 'no reaction',
  );

  const inGame = reconcileBalance({
    beforeCents: credit.cents,
    wagerCents: bet.cents,
    payoutCents: outcome.payoutCents,
    afterCents: outcome.finalCreditCents ?? Number.NaN,
  });
  await checks.verify(C.inGameRule, () => expect.soft(inGame.ok).toBe(true), rule(inGame));

  const expectedBetsson = betssonBefore.withdrawable.cents - bet.cents + outcome.payoutCents;
  const afterRead = await test.step('Read the Betsson balance after the spin', () =>
    balanceMenu.readAfterSpin(betssonBefore.withdrawable.cents, expectedBetsson),
  );
  const betssonAfter = afterRead.balance;
  testInfo.annotations.push({ type: 'betsson-balance-after', description: `${afterRead.reads} read(s), ended: ${afterRead.ended}` });
  await attachPng(testInfo, 'Betsson balance after', betssonAfter.evidence);
  const betsson = reconcileBalance({
    beforeCents: betssonBefore.withdrawable.cents,
    wagerCents: bet.cents,
    payoutCents: outcome.payoutCents,
    afterCents: betssonAfter.withdrawable.cents,
  });
  await checks.verify(C.betssonRule, () => expect.soft(betsson.ok).toBe(true), rule(betsson));
  await checks.verify(
    C.betssonMatchesGame,
    () => expect.soft(betssonAfter.withdrawable.cents).toBe(outcome.finalCreditCents),
    `Betsson ${money(betssonAfter.withdrawable.cents)}, in game ${money(outcome.finalCreditCents)}`,
  );

  await attachJson(testInfo, 'Summary', {
    market: market.id,
    currency: market.currency,
    hudBefore: hudValues(ready),
    betssonBeforeCents: betssonBefore.withdrawable.cents,
    wagerCents: bet.cents,
    payoutCents: outcome.payoutCents,
    inGameAfterCents: outcome.finalCreditCents,
    betssonAfterCents: betssonAfter.withdrawable.cents,
    checks: checks.records,
  });
});
