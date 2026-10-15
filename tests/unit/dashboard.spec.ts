import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { SCENARIOS } from '../../src/reporting/check-catalog';
import { CHECK_EXPLANATIONS } from '../../src/reporting/dashboard/explanations';
import { testsFromJsonReport, type JsonReport } from '../../src/reporting/dashboard/model';
import { writeDashboard } from '../../src/reporting/dashboard/write';

// The reviewed run in docs/panel-sample: both scenarios green on betsson.es, the lobby smoke and the unit tests.
const SAMPLE = resolve('docs/panel-sample');
// Amounts come formatted by Intl, with a no-break space before the currency sign.
const eur = (text: string) => text.replace(/ €/g, '\u00a0€');
const sampleTests = () =>
  ['scenarios.json', 'unit.json'].flatMap((f) => testsFromJsonReport(JSON.parse(readFileSync(join(SAMPLE, f), 'utf8')) as JsonReport, SAMPLE));

test('every catalog check has a Spanish explanation', () => {
  const ids = Object.values(SCENARIOS).flatMap((s) => Object.values(s.checks).map((c) => c.id));
  expect(ids.filter((id) => !CHECK_EXPLANATIONS[id])).toEqual([]);
});

test('reads scenarios, checks and unit tests from an exported run', () => {
  const tests = sampleTests();
  const s1 = tests.find((t) => t.title === SCENARIOS.spinCompleted.title)!;
  expect(s1.project).toBe('betsson-es');
  expect(s1.status).toBe('passed');
  expect(s1.checks.map((c) => c.id)).toEqual(Object.values(SCENARIOS.spinCompleted.checks).map((c) => c.id));
  expect(s1.steps[0]!.title).toBe('Open the casino lobby as the funded player');
  expect(s1.attachments.find((a) => a.name === 'Betsson balance before')!.path).toBe(join(SAMPLE, 'files', '0027-Betsson-balance-before.png'));

  const unit = tests.filter((t) => t.project === 'unit');
  expect(unit).toHaveLength(66);
  expect(unit.find((t) => t.file === 'tests/unit/bonus.spec.ts')!.describes).toEqual(['bonus texts']);
});

test('writes a dashboard with every check, its evidence and the videos, without traces', () => {
  const out = test.info().outputPath('dashboard');
  const { index, data } = writeDashboard(out, { tests: sampleTests() });
  const html = readFileSync(index, 'utf8');

  for (const id of ['S1-01', 'S1-10', 'S2-05', 'S2-08']) expect(html).toContain(`<code>${id}</code>`);
  expect(html).toContain(CHECK_EXPLANATIONS['S1-10']!.title);
  expect(html).toContain(eur('98,55 € − 0,25 € + 0,05 € = 98,35 €; seen 98,35 €'));
  expect(html).toContain('Mercado único betsson.es por indicación del organizador (15/10)');
  expect(html).toMatch(/<div class="verdict pass">/);
  expect(html).toMatch(/<video controls preload="metadata" src="files\/[^"]+\.webm">/);
  expect(html).not.toContain('class="badge fail"');

  const files = readdirSync(join(out, 'files'));
  expect(files.some((f) => f.endsWith('.zip'))).toBe(false);
  const s1 = data.tests.find((t) => t.title === SCENARIOS.spinCompleted.title)!;
  const balance = s1.attachments.find((a) => a.name === 'Betsson balance before')!;
  expect(existsSync(join(out, balance.href!))).toBe(true);
  expect(s1.attachments.find((a) => a.name === 'trace')!.omitted).toMatch(/solo en local/);
  expect(s1.attachments.find((a) => a.name === 'Spin — timeline')!.text).toContain('"payoutCents": 5');
});

test('a failed check is shown as FAIL with what was seen', () => {
  const tests = sampleTests().filter((t) => t.title === SCENARIOS.spinCompleted.title);
  const s1 = tests[0]!;
  s1.status = 'failed';
  s1.errors = ['Error: expect(received).toBe(expected)'];
  s1.checks = s1.checks.map((c) => (c.id === 'S1-10' ? { ...c, passed: false, detail: eur('98,55 € − 0,25 € + 0,05 € = 98,35 €; seen 98,30 €') } : c));
  const { index } = writeDashboard(test.info().outputPath('dashboard'), { tests });
  const html = readFileSync(index, 'utf8');
  expect(html).toMatch(/<div class="verdict fail">/);
  expect(html).toMatch(/<div class="check fail">[\s\S]*?<code>S1-10<\/code>[\s\S]*?class="badge fail"[\s\S]*?seen 98,30\u00a0€/);
});
