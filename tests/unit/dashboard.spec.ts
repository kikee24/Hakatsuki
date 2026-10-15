import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { SCENARIOS } from '../../src/reporting/check-catalog';
import { CHECK_ANNOTATION } from '../../src/reporting/checks';
import { CHECK_EXPLANATIONS } from '../../src/reporting/dashboard/explanations';
import { testsFromJsonReport, type JsonReport } from '../../src/reporting/dashboard/model';
import { writeDashboard } from '../../src/reporting/dashboard/write';

// A made-up run in the shape `npm run export:results` writes: both scenarios green on betsson.es
// and two unit tests. No real screenshots: the evidence files are placeholders written here.
// Amounts come formatted by Intl, with a no-break space before the currency sign.
const eur = (text: string) => text.replace(/ €/g, ' €');
const s1Rule = '98,55 € − 0,25 € + 0,05 € = 98,35 €; seen 98,35 €';

const checkAnnotations = (checks: Record<string, { id: string; title: string }>, detail: Record<string, string> = {}) =>
  Object.values(checks).map((c) => ({ type: CHECK_ANNOTATION, description: JSON.stringify({ ...c, passed: true, detail: detail[c.id] }) }));

function sampleRun(): { scenarios: JsonReport; unit: JsonReport; dir: string } {
  const dir = test.info().outputPath('export');
  mkdirSync(join(dir, 'files'), { recursive: true });
  writeFileSync(join(dir, 'files', 'balance-before.png'), Buffer.from('placeholder png'));
  writeFileSync(join(dir, 'files', 'video.webm'), Buffer.from('placeholder webm'));
  const timeline = Buffer.from(JSON.stringify({ payoutCents: 5 }, null, 2)).toString('base64');

  const scenarios: JsonReport = {
    stats: { startTime: '2026-10-15T16:30:00.000Z', duration: 120_000 },
    suites: [
      {
        title: 'e2e/spin-completed.spec.ts',
        file: 'e2e/spin-completed.spec.ts',
        specs: [
          {
            title: SCENARIOS.spinCompleted.title,
            file: 'tests/e2e/spin-completed.spec.ts',
            tests: [
              {
                projectName: 'betsson-es',
                results: [
                  {
                    status: 'passed',
                    duration: 60_000,
                    steps: [{ title: 'Open the casino lobby as the funded player', duration: 3_000 }],
                    annotations: checkAnnotations(SCENARIOS.spinCompleted.checks, { 'S1-10': eur(s1Rule) }),
                    attachments: [
                      { name: 'Betsson balance before', contentType: 'image/png', path: 'files/balance-before.png' },
                      { name: 'Spin — timeline', contentType: 'application/json', body: timeline },
                      { name: 'trace', contentType: 'application/zip', path: 'files/trace.zip' },
                      { name: 'video', contentType: 'video/webm', path: 'files/video.webm' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        title: 'e2e/insufficient-balance.spec.ts',
        file: 'e2e/insufficient-balance.spec.ts',
        specs: [
          {
            title: SCENARIOS.insufficientBalance.title,
            file: 'tests/e2e/insufficient-balance.spec.ts',
            tests: [{ projectName: 'betsson-es', results: [{ status: 'passed', duration: 40_000, annotations: checkAnnotations(SCENARIOS.insufficientBalance.checks) }] }],
          },
        ],
      },
    ],
  };
  const unit: JsonReport = {
    suites: [
      {
        title: 'unit/bonus.spec.ts',
        file: 'unit/bonus.spec.ts',
        suites: [
          {
            title: 'bonus texts',
            file: 'tests/unit/bonus.spec.ts',
            specs: [
              { title: 'free spins still running', tests: [{ projectName: 'unit', results: [{ status: 'passed', duration: 5 }] }] },
              { title: 'free spins finished or no bonus', tests: [{ projectName: 'unit', results: [{ status: 'passed', duration: 5 }] }] },
            ],
          },
        ],
      },
    ],
  };
  return { scenarios, unit, dir };
}

const sampleTests = () => {
  const { scenarios, unit, dir } = sampleRun();
  return { dir, tests: [scenarios, unit].flatMap((r) => testsFromJsonReport(r, dir)) };
};

test('every catalog check has a Spanish explanation', () => {
  const ids = Object.values(SCENARIOS).flatMap((s) => Object.values(s.checks).map((c) => c.id));
  expect(ids.filter((id) => !CHECK_EXPLANATIONS[id])).toEqual([]);
});

test('reads scenarios, checks and unit tests from an exported run', () => {
  const { dir, tests } = sampleTests();
  const s1 = tests.find((t) => t.title === SCENARIOS.spinCompleted.title)!;
  expect(s1.project).toBe('betsson-es');
  expect(s1.status).toBe('passed');
  expect(s1.checks.map((c) => c.id)).toEqual(Object.values(SCENARIOS.spinCompleted.checks).map((c) => c.id));
  expect(s1.steps[0]!.title).toBe('Open the casino lobby as the funded player');
  expect(s1.attachments.find((a) => a.name === 'Betsson balance before')!.path).toBe(join(dir, 'files', 'balance-before.png'));

  const unit = tests.filter((t) => t.project === 'unit');
  expect(unit).toHaveLength(2);
  expect(unit[0]!.file).toBe('tests/unit/bonus.spec.ts');
  expect(unit[0]!.describes).toEqual(['bonus texts']);
});

test('writes a dashboard with every check, its evidence and the videos, without traces', () => {
  const out = test.info().outputPath('dashboard');
  const { index, data } = writeDashboard(out, { tests: sampleTests().tests });
  const html = readFileSync(index, 'utf8');

  for (const id of ['S1-01', 'S1-10', 'S2-05', 'S2-08']) expect(html).toContain(`<code>${id}</code>`);
  expect(html).toContain(CHECK_EXPLANATIONS['S1-10']!.title);
  expect(html).toContain(eur(s1Rule));
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
  const tests = sampleTests().tests.filter((t) => t.title === SCENARIOS.spinCompleted.title);
  const s1 = tests[0]!;
  s1.status = 'failed';
  s1.errors = ['Error: expect(received).toBe(expected)'];
  s1.checks = s1.checks.map((c) => (c.id === 'S1-10' ? { ...c, passed: false, detail: eur('98,55 € − 0,25 € + 0,05 € = 98,35 €; seen 98,30 €') } : c));
  const { index } = writeDashboard(test.info().outputPath('dashboard'), { tests });
  const html = readFileSync(index, 'utf8');
  expect(html).toMatch(/<div class="verdict fail">/);
  expect(html).toMatch(/<div class="check fail">[\s\S]*?<code>S1-10<\/code>[\s\S]*?class="badge fail"[\s\S]*?seen 98,30 €/);
});
