import { expect, test } from '@playwright/test';
import { gameTexts, loadGame } from '../../src/config/game';
import { amountAfterLabel, readMoneyBlock, readStatusLine } from '../../src/game/hud';

// Raw strings below are real Tesseract output captured from the Wolf Gold fixtures, noise included.
const es = gameTexts(loadGame('wolf-gold'), 'es');

test.describe('money block', () => {
  test('reads credit and bet despite noise before the labels', () => {
    const reading = readMoneyBlock('N CRÉDITO 99.998,00 €\n7 APUESTA 2,00 €', es);
    expect(reading).toEqual({ credit: { cents: 9999800, currency: 'EUR' }, bet: { cents: 200, currency: 'EUR' } });
  });

  test('tolerates quotes, dashes and missing accents around the values', () => {
    expect(readMoneyBlock(') CRÉDITO“ 98,90 €.\nAPUESTA 2,00€', es)).toEqual({
      credit: { cents: 9890, currency: 'EUR' },
      bet: { cents: 200, currency: 'EUR' },
    });
    expect(amountAfterLabel('CREDITO -98,90 €:', es.credit)).toEqual({ cents: 9890, currency: 'EUR' });
  });

  test('accepts one OCR error in a label', () => {
    expect(amountAfterLabel('CRED1TO 10,00 €', es.credit)?.cents).toBe(1000);
  });

  test('returns null when the label is missing', () => {
    expect(readMoneyBlock('NO VOLVER A MOSTRAR', es)).toEqual({ credit: null, bet: null });
  });
});

test.describe('status line', () => {
  test('idle', () => {
    expect(readStatusLine(', DN\n¡HAGA SU APUESTA! -', es)).toEqual({ status: 'idle', win: null });
  });

  test('spinning, with an OCR accent error', () => {
    expect(readStatusLine('NUI\n“YD\n¡BÚENA SUERTE! >', es)).toEqual({ status: 'spinning', win: null });
  });

  test('win: takes the GANANCIA amount, not the per-line detail', () => {
    expect(readStatusLine('GANANCIA 0,40 €\nAQ: LA LÍNEA 12 ABONA 0,40 €', es)).toEqual({
      status: 'win',
      win: { cents: 40, currency: 'EUR' },
    });
  });

  test('unknown for unrelated text', () => {
    expect(readStatusLine('WILDS APILABLES MONEY RESPIN', es)).toEqual({ status: 'unknown', win: null });
  });
});
