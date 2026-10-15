import { expect, test } from '@playwright/test';
import { gameTexts, loadGame, type Region } from '../../src/config/game';
import { loadMarket } from '../../src/config/market';
import { calibrateBaseGame, findIntroContinue } from '../../src/game/calibration';
import { HudReader } from '../../src/game/hud-reader';
import { centreOf } from '../../src/vision/icon-finder';
import { OcrEngine } from '../../src/vision/ocr';
import { gameFrame } from './support/screens';

// Auto-calibration on real frames of two Pragmatic games. The hand-measured regions in
// config/games/ are known to work live, so what is found must land inside them.
const market = loadMarket('betsson-es');
const inside = (p: { x: number; y: number }, r: Region) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const intros = [
  { file: 'wolf-gold-intro.webp', game: 'wolf-gold' },
  { file: 'bubble-up-intro.webp', game: 'bubble-up' },
];
const baseGames = [
  { file: 'wolf-gold-real-idle.webp', game: 'wolf-gold', credit: 9890, bet: 200, status: 'idle' },
  { file: 'wolf-gold-practice-win.webp', game: 'wolf-gold', credit: 9999240, bet: 200, status: 'win' },
  { file: 'bubble-up-real-idle.webp', game: 'bubble-up', credit: 0, bet: 200, status: 'idle' },
];

test.describe('intro continue button', () => {
  for (const { file, game } of intros) {
    test(`found on ${file}, where the hand-measured button is`, async () => {
      const match = await findIntroContinue(await gameFrame(file));
      expect(match, 'continue button found').not.toBeNull();
      expect(inside(centreOf(match!.region), loadGame(game).regions.continueButton)).toBe(true);
    });
  }

  for (const { file } of baseGames) {
    test(`never seen on the base game (${file}): the spin button must not be taken for it`, async () => {
      expect(await findIntroContinue(await gameFrame(file))).toBeNull();
    });
  }
});

test.describe('base game calibration (OCR)', () => {
  test.describe.configure({ timeout: 120_000 });
  let ocr: OcrEngine;
  test.beforeAll(async () => {
    ocr = await OcrEngine.create(market.ocrLanguage);
  });
  test.afterAll(async () => ocr?.terminate());

  for (const { file, game: gameId, credit, bet, status } of baseGames) {
    test(`${file}: finds the controls and the HUD reads right with them`, async () => {
      const game = loadGame(gameId);
      const frame = await gameFrame(file);
      const calibration = await calibrateBaseGame(frame, ocr, gameTexts(game, 'es'));
      expect(calibration.regions, `missing: ${calibration.missing.join(', ')}`).not.toBeNull();
      const regions = calibration.regions!;

      // Clicks land on the same buttons as the hand-measured regions.
      expect(inside(centreOf(regions.spinButton), game.regions.spinButton), 'spin button').toBe(true);
      expect(inside(centreOf(regions.betDown), game.regions.betDown), 'bet down').toBe(true);

      // Reading with the calibrated regions gives the real values.
      const calibrated = { ...game, regions: { ...game.regions, ...regions } };
      const hud = await new HudReader(ocr, calibrated, 'es').read(frame);
      expect.soft(hud.credit?.cents, 'credit').toBe(credit);
      expect.soft(hud.bet?.cents, 'bet').toBe(bet);
      expect.soft(hud.status, 'status').toBe(status);
    });
  }

  test('a spinning frame is not calibrated (the spin button changes while the reels turn)', async () => {
    const frame = await gameFrame('wolf-gold-practice-spinning.webp');
    expect((await calibrateBaseGame(frame, ocr, gameTexts(loadGame('wolf-gold'), 'es'))).regions).toBeNull();
  });
});
