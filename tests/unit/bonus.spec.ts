import { expect, test } from '@playwright/test';
import { gameTexts, loadGame } from '../../src/config/game';
import { loadMarket } from '../../src/config/market';
import { asksToContinue, bonusActive, type HudReading } from '../../src/game/hud';
import { HudReader } from '../../src/game/hud-reader';
import { watchSpin } from '../../src/game/spin-watcher';
import { OcrEngine } from '../../src/vision/ocr';
import { gameFrame, screenFixtures } from './support/screens';

// Wolf Gold free spins, from a screen recording of a real bonus (three scatters, 5 free spins).
const market = loadMarket('betsson-es');
const game = loadGame('wolf-gold');
const es = gameTexts(game, 'es');

test.describe('bonus texts', () => {
  test('free spins still running', () => {
    expect(bonusActive('GANANCIA 0,25 €\nTIRADAS GRATIS RESTANTES 2', es)).toBe(true);
    expect(bonusActive('TIRADAS GRATIS RESTANTE5 1', es)).toBe(true);
  });

  test('free spins finished or no bonus', () => {
    expect(bonusActive('GANANCIA 1,85 €\nTIRADAS GRATIS COMPLETADAS', es)).toBe(false);
    expect(bonusActive('¡HAGA SU APUESTA!', es)).toBe(false);
  });

  test('prompt waiting for the player', () => {
    expect(asksToContinue('¡ENHORABUENA! HA GANADO 1,85 €\nPULSE EN CUALQUIER PARTE PARA CONTINUAR', es)).toBe(true);
    expect(asksToContinue('WILDS APILABLES MONEY RESPIN', es)).toBe(false);
  });
});

test.describe('bonus on real Wolf Gold frames (OCR)', () => {
  test.describe.configure({ timeout: 120_000 });

  let ocr: OcrEngine;
  let reader: HudReader;
  test.beforeAll(async () => {
    ocr = await OcrEngine.create(market.ocrLanguage);
    reader = new HudReader(ocr, game, market.language);
  });
  test.afterAll(async () => ocr?.terminate());

  for (const { file, expected } of screenFixtures.bonus) {
    test(`bonus: ${file}`, async ({}, testInfo) => {
      const frame = await gameFrame(file);
      const hud = await reader.read(frame);
      const prompt = await reader.readContinuePrompt(frame);
      await testInfo.attach('ocr text', {
        body: `status:\n${hud.ocr.status.text}\n\nmessage:\n${prompt.ocr.text}`,
        contentType: 'text/plain',
      });
      expect.soft(hud.bonus, 'bonus round running').toBe(expected.bonusActive);
      expect.soft(prompt.shown, 'prompt waiting for the player').toBe(expected.asksToContinue);
    });
  }

  test('a base game frame shows no bonus and no prompt', async () => {
    const frame = await gameFrame('wolf-gold-real-idle.webp');
    expect((await reader.read(frame)).bonus).toBe(false);
    expect((await reader.readContinuePrompt(frame)).shown).toBe(false);
  });
});

test.describe('spin watcher with a bonus round', () => {
  const eur = (cents: number) => ({ cents, currency: 'EUR' as const });
  const reading = (status: HudReading['status'], credit: number, win: number | null, bonus = false): HudReading => ({
    status,
    credit: eur(credit),
    bet: eur(25),
    win: win === null ? null : eur(win),
    bonus,
  });
  const fakeClock = (stepMs = 500) => {
    let t = 0;
    return () => (t += stepMs);
  };

  test('waits for the free spins, presses the prompts and reconciles the bonus total', async () => {
    const idle = await gameFrame('wolf-gold-real-idle.webp');
    const spinning = await gameFrame('wolf-gold-practice-spinning.webp');
    const freeSpins = await gameFrame('wolf-gold-free-spins.webp');
    const end = await gameFrame('wolf-gold-free-spins-end.webp');
    const after = await gameFrame('wolf-gold-after-free-spins.webp');

    // Real run, 15 Oct: credit 97,55 €, wager 0,25 €, scatter win 0,25 €, free spins total 1,85 €.
    const script: [Buffer, HudReading, boolean][] = [
      [idle, reading('spinning', 9730, null), false],
      [spinning, reading('spinning', 9730, null), false],
      [spinning, reading('win', 9730, 25), false], // scatters: looks like a plain win...
      [spinning, reading('win', 9730, 25), false], // ...and looks settled here
      [freeSpins, reading('win', 9730, 25, true), false], // settle check: free spins started
      [freeSpins, reading('win', 9730, 60, true), false],
      [freeSpins, reading('win', 9730, 134, true), false],
      [end, reading('win', 9857, 185, true), true], // "pulse en cualquier parte para continuar"
      [after, reading('win', 9915, 185), false],
      [after, reading('win', 9915, 185), false],
      [after, reading('win', 9915, 185), false],
      [after, reading('win', 9915, 185), false], // final settle check
    ];
    const frames = script.map(([f]) => f);
    const huds = script.map(([, h]) => h);
    const prompts = script.map(([, , p]) => p);
    let current = -1;
    let presses = 0;

    const result = await watchSpin({
      capture: async () => {
        current = Math.min(current + 1, frames.length - 1);
        return frames[current]!;
      },
      readHud: async () => huds[current]!,
      readPrompt: async () => prompts[current]!,
      pressToContinue: async () => void presses++,
      trigger: async () => {},
      baseline: { creditCents: 9755, betCents: 25 },
      reelsRegion: game.regions.reels,
      sleep: async () => {},
      now: fakeClock(),
    });

    expect(result.timedOut).toBe(false);
    expect(presses).toBe(1);
    expect(result.bonusPresses).toBe(1);
    expect(result.outcome).toMatchObject({ settled: true, bonus: true, payoutCents: 185, finalCreditCents: 9915 });
    // after = before − wager + payout, with the bonus total: 97,55 − 0,25 + 1,85 = 99,15 €
    expect(result.outcome.finalCreditCents).toBe(9755 - 25 + result.outcome.payoutCents);
    expect(result.keyFrames.some((k) => k.reason.startsWith('bonus round started'))).toBe(true);
  });
});

test.describe('spin watcher with wins in a cascading game', () => {
  const eur = (cents: number) => ({ cents, currency: 'EUR' as const });
  const r = (status: HudReading['status'], credit: number, win: number | null): HudReading => ({
    status,
    credit: eur(credit),
    bet: eur(20),
    win: win === null ? null : eur(win),
  });
  async function watch(script: HudReading[]) {
    const idle = await gameFrame('bubble-up-real-idle.webp');
    const spinning = await gameFrame('wolf-gold-practice-spinning.webp');
    // Alternating frames: the reels look busy the whole time, as in Bubble Up.
    const frames = script.map((_, i) => (i % 2 ? idle : spinning));
    let current = -1;
    let t = 0;
    return watchSpin({
      capture: async () => frames[(current = Math.min(current + 1, frames.length - 1))]!,
      readHud: async () => script[Math.max(0, current)]!,
      readPrompt: async () => false,
      pressToContinue: async () => {},
      trigger: async () => {},
      baseline: { creditCents: 9015, betCents: 20 },
      reelsRegion: game.regions.reels,
      sleep: async () => {},
      now: () => (t += 500),
    });
  }

  test('the same win as the previous spin counts once "¡BUENA SUERTE!" cleared the line', async () => {
    const result = await watch([
      r('win', 8995, 30), // previous spin's 0,30 € still shown, wager already taken
      r('spinning', 8995, null),
      r('spinning', 8995, null),
      r('win', 8995, 30), // this spin also pays 0,30 €
      r('win', 9025, 30),
      r('win', 9025, 30),
      r('win', 9025, 30), // settle check
    ]);
    expect(result.outcome).toMatchObject({ settled: true, payoutCents: 30, finalCreditCents: 9025 });
    expect(result.timedOut).toBe(false);
  });

  test('a cascade that raises the win after a pause reopens the spin and ends on the total', async () => {
    // The first row is the frame taken before the spin; each later row is one look.
    const result = await watch([
      r('spinning', 8995, null),
      r('spinning', 8995, null),
      r('win', 8995, 10), // first drop pays 0,10 €
      r('win', 8995, 10), // looks settled...
      r('win', 8995, 40), // ...settle check: the cascade added 0,30 €
      r('win', 9035, 40),
      r('win', 9035, 40),
      r('win', 9035, 40), // settle check
    ]);
    expect(result.outcome).toMatchObject({ settled: true, bonus: false, payoutCents: 40, finalCreditCents: 9035 });
    expect(result.keyFrames.some((k) => k.reason.includes('still changing'))).toBe(true);
    expect(result.outcome.finalCreditCents).toBe(9015 - 20 + result.outcome.payoutCents);
  });
});
