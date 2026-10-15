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

test.describe('amounts without cents are OCR misreads', () => {
  test('rejects "GANANCIA 15 €" (live misread of 0,15 €) but keeps real amounts', () => {
    expect(readStatusLine('GANANCIA 15 €', es).win).toBeNull();
    expect(readStatusLine('GANANCIA A 15 €\nTIRADAS GRATIS COMPLETADAS', es).win).toBeNull();
    expect(readStatusLine('GANANCIA 0,15 €', es).win?.cents).toBe(15);
    expect(amountAfterLabel('CRÉDITO 99.998,00 €', es.credit)?.cents).toBe(9999800);
  });
});

test.describe('win total when OCR lost the GANANCIA label', () => {
  // Real Tesseract output of the live frame where "GANANCIA 0,15 €" was misread.
  test('takes the first-line amount when the per-line detail is below', () => {
    expect(readStatusLine('0,15 €\nLA LINEA 11 ABONA 0,15 €', es)).toEqual({ status: 'win', win: { cents: 15, currency: 'EUR' } });
  });

  test('not without the per-line detail, nor without decimals', () => {
    expect(readStatusLine('0,15 €', es).status).toBe('unknown');
    expect(readStatusLine('15 €\nLA LINEA 11 ABONA 0,15 €', es).win).toBeNull();
  });
});

test('a decimal comma read as "/" is still the comma (live Bubble Up OCR: "CREDITO 89/90€")', () => {
  expect(readMoneyBlock('CREDITO 89/90€ Le\n* APUESTA 0,20 €', es)).toEqual({
    credit: { cents: 8990, currency: 'EUR' },
    bet: { cents: 20, currency: 'EUR' },
  });
  expect(amountAfterLabel('CRÉDITO 1.234;56 €', es.credit)?.cents).toBe(123456);
});
