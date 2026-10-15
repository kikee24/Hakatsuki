import { expect, test } from '@playwright/test';
import type { HudReading, SpinStatus } from '../../src/game/hud';
import { SpinTracker, type Observation } from '../../src/game/spin-tracker';

const baseline = { creditCents: 9890, betCents: 200 };
const eur = (cents: number) => ({ cents, currency: 'EUR' as const });

function hud(status: SpinStatus, creditCents: number | null, winCents: number | null = null): HudReading {
  return { status, credit: creditCents === null ? null : eur(creditCents), bet: eur(200), win: winCents === null ? null : eur(winCents) };
}

function run(observations: [HudReading, number | null][]) {
  const tracker = new SpinTracker(baseline);
  observations.forEach(([h, motionRatio], i) => tracker.observe({ atMs: (i + 1) * 500, hud: h, motionRatio } satisfies Observation));
  return tracker.outcome;
}

test('losing spin: starts, stops, settles with payout 0', () => {
  const outcome = run([
    [hud('spinning', 9690), 0.6],
    [hud('spinning', 9690), 0.5],
    [hud('idle', 9690), 0],
    [hud('idle', 9690), 0],
    [hud('idle', 9690), 0],
  ]);
  expect(outcome).toMatchObject({ settled: true, payoutCents: 0, creditAfterWagerCents: 9690, finalCreditCents: 9690 });
  expect(outcome.startSignals.sort()).toEqual(['reel-motion', 'status-text', 'wager-deducted']);
  expect(outcome.changes.map((c) => c.to)).toEqual(['spinning', 'stopped', 'settled']);
});

test('winning spin: stops on the win text even while win animations keep moving, waits for the credit count-up', () => {
  const outcome = run([
    [hud('spinning', 9690), 0.6],
    [hud('spinning', 9690), 0.6],
    [hud('win', 9690, 40), 0.3],
    [hud('win', 9710, 40), 0.3],
    [hud('win', 9730, 40), 0.3],
    [hud('win', 9730, 40), 0.3],
  ]);
  expect(outcome).toMatchObject({ settled: true, payoutCents: 40, finalCreditCents: 9730 });
  expect(outcome.changes.find((c) => c.to === 'stopped')?.reason).toBe('status line shows a win');
});

test('no reaction: stays armed', () => {
  const outcome = run([
    [hud('idle', 9890), 0],
    [hud('idle', 9890), 0],
  ]);
  expect(outcome).toMatchObject({ started: false, phase: 'armed', startSignals: [] });
});

test('a pop-up appearing (one frame of motion) is not a spin', () => {
  const outcome = run([
    [hud('unknown', 9890), 0.4],
    [hud('unknown', 9890), 0],
    [hud('unknown', 9890), 0],
  ]);
  expect(outcome.started).toBe(false);
});

test('start is detected from the wager deduction alone when the status text is unreadable', () => {
  const outcome = run([[hud('unknown', 9690), null]]);
  expect(outcome).toMatchObject({ started: true, startSignals: ['wager-deducted'], creditAfterWagerCents: 9690 });
});

test('does not call the reels stopped without ever having seen them move', () => {
  const outcome = run([
    [hud('spinning', 9690), 0],
    [hud('idle', 9690), 0],
    [hud('idle', 9690), 0],
  ]);
  expect(outcome).toMatchObject({ started: true, stopped: false });
});

test('a win left on screen by the previous spin is not this spin\'s payout', () => {
  // Live run, 15 Oct: after a bonus the status line kept "GANANCIA 1,85 €" while the next spin
  // turned, with the credit already reduced by the wager; that spin lost ("¡HAGA SU APUESTA!").
  const outcome = run([
    [hud('win', 9690, 185), 0.55], // wager taken, stale win, reels turning
    [hud('win', 9690, 185), 0.6],
    [hud('win', 9690, 185), 0], // reels stopped
    [hud('idle', 9690), 0],
    [hud('idle', 9690), 0],
    [hud('idle', 9690), 0],
  ]);
  expect(outcome).toMatchObject({ settled: true, payoutCents: 0, finalCreditCents: 9690 });
  expect(outcome.startSignals).toEqual(expect.arrayContaining(['wager-deducted', 'reel-motion']));
  expect(outcome.changes.find((c) => c.to === 'stopped')?.reason).not.toBe('status line shows a win');
});

test('a losing spin stops when the status line goes back to idle, even if the reels never look still', () => {
  // Bubble Up keeps its symbols animated: motion stays above the threshold after the spin.
  const outcome = run([
    [hud('spinning', 9690), 0.5],
    [hud('spinning', 9690), 0.4],
    [hud('idle', 9690), 0.06],
    [hud('idle', 9690), 0.05],
    [hud('idle', 9690), 0.07],
  ]);
  expect(outcome).toMatchObject({ settled: true, payoutCents: 0, finalCreditCents: 9690 });
  expect(outcome.changes.find((c) => c.to === 'stopped')?.reason).toBe('status line idle after the spin started');
});
