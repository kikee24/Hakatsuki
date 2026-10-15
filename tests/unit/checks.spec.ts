import { expect, test } from '@playwright/test';
import { matchesWord } from '../../src/domain/text-match';
import { CHECK_ANNOTATION, Checks } from '../../src/reporting/checks';

test('a passing check is recorded with its detail and as a report annotation', async ({}, testInfo) => {
  const checks = new Checks(testInfo);
  const passed = await checks.verify('X-01', 'two plus two', () => expect.soft(2 + 2).toBe(4), '2 + 2 = 4');

  expect(passed).toBe(true);
  expect(checks.records).toEqual([{ id: 'X-01', title: 'two plus two', passed: true, detail: '2 + 2 = 4' }]);
  const annotation = testInfo.annotations.find((a) => a.type === CHECK_ANNOTATION);
  expect(JSON.parse(annotation!.description!)).toMatchObject({ id: 'X-01', passed: true });
});

test.describe('matchesWord', () => {
  test('accepts OCR noise within one error per five letters', () => {
    expect(matchesWord('ACEPTAR', ['aceptar'])).toBe(true);
    expect(matchesWord('ACEPTAR.', ['aceptar'])).toBe(true);
    expect(matchesWord('ACEPIAR', ['aceptar'])).toBe(true);
  });

  test('rejects different words', () => {
    expect(matchesWord('APUESTA', ['aceptar'])).toBe(false);
    expect(matchesWord('OK', ['aceptar'])).toBe(false);
  });
});
