import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { loadGame } from '../../src/config/game';
import { compareFrames } from '../../src/vision/motion';
import { gameFrame } from './support/screens';

const reels = loadGame('wolf-gold').regions.reels;
const IDLE = 'wolf-gold-real-idle.webp';
const WIN = 'wolf-gold-practice-win.webp';
const SPINNING = 'wolf-gold-practice-spinning.webp';

test.describe('reel motion', () => {
  test('identical frames: no motion', async () => {
    const frame = await gameFrame(IDLE);
    const result = await compareFrames(frame, frame, reels);
    expect(result.changedRatio).toBe(0);
    expect(result.moving).toBe(false);
  });

  test('brightness shift and recompression are not motion', async () => {
    const frame = await gameFrame(IDLE);
    const brighter = await sharp(frame).modulate({ brightness: 1.03 }).png().toBuffer();
    const recompressed = await sharp(frame).jpeg({ quality: 60 }).toBuffer();
    expect((await compareFrames(frame, brighter, reels)).moving).toBe(false);
    expect((await compareFrames(frame, recompressed, reels)).moving).toBe(false);
  });

  test('a single reel still spinning (blurred) is motion', async () => {
    const frame = await gameFrame(IDLE);
    const reel = { left: 825, top: 80, width: 187, height: 450 };
    const blurred = await sharp(frame).extract(reel).blur(12).toBuffer();
    const oneReelSpinning = await sharp(frame).composite([{ input: blurred, left: reel.left, top: reel.top }]).png().toBuffer();
    const result = await compareFrames(frame, oneReelSpinning, reels);
    expect(result.moving).toBe(true);
  });

  test('new symbols on the reels are motion, with a diff image for the report', async ({}, testInfo) => {
    const result = await compareFrames(await gameFrame(SPINNING), await gameFrame(WIN), reels);
    await testInfo.attach('reel diff', { body: result.diffImage, contentType: 'image/png' });
    expect(result.changedRatio).toBeGreaterThan(0.3);
    expect(result.moving).toBe(true);
  });
});
