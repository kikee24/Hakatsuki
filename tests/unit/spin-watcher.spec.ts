import { expect, test } from '@playwright/test';
import { loadGame } from '../../src/config/game';
import type { HudReading } from '../../src/game/hud';
import { watchSpin } from '../../src/game/spin-watcher';
import { gameFrame } from './support/screens';

// Drives the watcher with a scripted "video": real fixture frames for motion, scripted HUD readings.
const reels = loadGame('wolf-gold').regions.reels;
const eur = (cents: number) => ({ cents, currency: 'EUR' as const });
const reading = (status: HudReading['status'], credit: number, win: number | null = null): HudReading => ({
  status,
  credit: eur(credit),
  bet: eur(200),
  win: win === null ? null : eur(win),
});

function fakeClock(stepMs = 500) {
  let t = 0;
  return () => (t += stepMs);
}

test('records a full winning spin with key frames', async () => {
  const idle = await gameFrame('wolf-gold-real-idle.webp');
  const spinning = await gameFrame('wolf-gold-practice-spinning.webp');
  const win = await gameFrame('wolf-gold-practice-win.webp');

  const frames = [idle, spinning, win, win, win, win];
  const huds = [
    reading('spinning', 9690),
    reading('spinning', 9690),
    reading('win', 9690, 40),
    reading('win', 9730, 40),
    reading('win', 9730, 40),
  ];
  let triggered = 0;

  const result = await watchSpin({
    capture: async () => frames.shift()!,
    readHud: async () => huds.shift()!,
    trigger: async () => void triggered++,
    baseline: { creditCents: 9890, betCents: 200 },
    reelsRegion: reels,
    sleep: async () => {},
    now: fakeClock(),
  });

  expect(triggered).toBe(1);
  expect(result.timedOut).toBe(false);
  expect(result.outcome).toMatchObject({ settled: true, payoutCents: 40, finalCreditCents: 9730 });
  expect(result.outcome.startSignals).toContain('reel-motion');
  expect(result.keyFrames.map((k) => k.phase)).toEqual(['armed', 'spinning', 'stopped', 'settled']);
  expect(result.keyFrames[1]!.motionRatio).toBeGreaterThan(0.3);
});

test('times out without a start when the game never reacts', async () => {
  const idle = await gameFrame('wolf-gold-real-idle.webp');
  const result = await watchSpin({
    capture: async () => idle,
    readHud: async () => reading('idle', 9890),
    trigger: async () => {},
    baseline: { creditCents: 9890, betCents: 200 },
    reelsRegion: reels,
    startTimeoutMs: 2_000,
    sleep: async () => {},
    now: fakeClock(),
  });

  expect(result.timedOut).toBe(true);
  expect(result.outcome.started).toBe(false);
  expect(result.keyFrames).toHaveLength(1);
});
