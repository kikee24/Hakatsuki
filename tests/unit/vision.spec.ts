import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { FULL_FRAME, loadGame } from '../../src/config/game';
import { loadMarket } from '../../src/config/market';
import { findKeyword } from '../../src/domain/text-match';
import { HudReader } from '../../src/game/hud-reader';
import { OcrEngine } from '../../src/vision/ocr';

// OCR on real screenshots, without a browser. The first run downloads the Spanish model (~cached).
const SCREENS = join('tests', 'fixtures', 'screens');
const fixtures = JSON.parse(readFileSync(join(SCREENS, 'fixtures.json'), 'utf8')) as {
  hud: {
    file: string;
    gameBox: { left: number; top: number; width: number; height: number };
    expected: { creditCents: number | null; betCents: number | null; winCents: number | null; status: string };
  }[];
  messages: { file: string; expectedKeyword: string }[];
};

const market = loadMarket('betsson-es');
const game = loadGame('wolf-gold');

test.describe('vision on Wolf Gold screenshots', () => {
  test.describe.configure({ timeout: 120_000 });

  let ocr: OcrEngine;
  let reader: HudReader;
  test.beforeAll(async () => {
    ocr = await OcrEngine.create(market.ocrLanguage);
    reader = new HudReader(ocr, game, market.language);
  });
  test.afterAll(async () => ocr?.terminate());

  for (const { file, gameBox, expected } of fixtures.hud) {
    test(`HUD: ${file}`, async ({}, testInfo) => {
      // Production screenshots are of the game iframe only, so crop the game out of the full page.
      const gameImage = await sharp(join(SCREENS, file)).extract(gameBox).png().toBuffer();
      const hud = await reader.read(gameImage);

      await testInfo.attach('money region (OCR input)', { body: hud.ocr.money.image, contentType: 'image/png' });
      await testInfo.attach('status region (OCR input)', { body: hud.ocr.status.image, contentType: 'image/png' });
      await testInfo.attach('ocr text', {
        body: `money [${hud.ocr.money.variant}]:\n${hud.ocr.money.text}\n\nstatus [${hud.ocr.status.variant}]:\n${hud.ocr.status.text}`,
        contentType: 'text/plain',
      });

      expect.soft(hud.credit?.cents ?? null, 'credit').toBe(expected.creditCents);
      expect.soft(hud.bet?.cents ?? null, 'bet').toBe(expected.betCents);
      expect.soft(hud.win?.cents ?? null, 'win').toBe(expected.winCents);
      expect.soft(hud.status, 'status').toBe(expected.status);
      if (expected.creditCents !== null) {
        expect.soft(hud.credit?.currency, 'credit currency').toBe(market.currency);
        expect.soft(hud.bet?.currency, 'bet currency').toBe(market.currency);
      }
    });
  }

  for (const { file, expectedKeyword } of fixtures.messages) {
    test(`message: ${file}`, async ({}, testInfo) => {
      // This fixture is already a crop of the pop-up, so read the whole image.
      const result = await reader.readMessage(readFileSync(join(SCREENS, file)), FULL_FRAME);
      await testInfo.attach('message (OCR input)', { body: result.image, contentType: 'image/png' });
      await testInfo.attach('ocr text', { body: result.text, contentType: 'text/plain' });

      expect(findKeyword(result.text, market.insufficientFundsKeywords)).toBe(expectedKeyword);
      // Language check: the English wording must not be what we matched.
      expect(findKeyword(result.text, loadMarket('betsson-com').insufficientFundsKeywords)).toBeNull();
    });
  }
});
