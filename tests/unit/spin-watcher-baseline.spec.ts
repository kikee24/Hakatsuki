import { expect, test } from '@playwright/test';
import { loadGame } from '../../src/config/game';
import type { HudReading } from '../../src/game/hud';
import { watchSpin } from '../../src/game/spin-watcher';
import { MOTION_THRESHOLD } from '../../src/vision/motion';
import { gameFrame } from './support/screens';

// The motion threshold follows what the reels do at rest, measured on two frames before the spin.
const reels = loadGame('wolf-gold').regions.reels;
const idleHud = (): HudReading => ({ status: 'idle', credit: { cents: 9890, currency: 'EUR' }, bet: { cents: 200, currency: 'EUR' }, win: null });

async function thresholdWith(atRest: [Buffer, Buffer]): Promise<{ idle: number | null; threshold: number }> {
  const frames = [...atRest];
  const result = await watchSpin({
    capture: async () => frames.shift() ?? atRest[1],
    readHud: async () => idleHud(),
    trigger: async () => {},
    baseline: { creditCents: 9890, betCents: 200 },
    reelsRegion: reels,
    idleBaselineMs: 300,
    startTimeoutMs: 1,
    sleep: async () => {},
    now: (() => { let t = 0; return () => (t += 500); })(),
  });
  return { idle: result.idleMotionRatio, threshold: result.motionThreshold };
}

test('still reels at rest keep the default threshold', async () => {
  const idle = await gameFrame('wolf-gold-real-idle.webp');
  const { idle: ratio, threshold } = await thresholdWith([idle, idle]);
  expect(ratio).toBe(0);
  expect(threshold).toBe(MOTION_THRESHOLD);
});

test('reels that change at rest raise the threshold above that motion', async () => {
  // Two different frames stand in for always-animated symbols.
  const { idle: ratio, threshold } = await thresholdWith([await gameFrame('wolf-gold-real-idle.webp'), await gameFrame('wolf-gold-practice-win.webp')]);
  expect(ratio).toBeGreaterThan(MOTION_THRESHOLD);
  expect(threshold).toBeGreaterThan(ratio!);
});
