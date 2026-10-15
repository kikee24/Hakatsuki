import { expect, test } from '@playwright/test';
import { SCENARIOS } from '../../src/reporting/check-catalog';
import { buildMatrix, toHtml, toMarkdown, type ScenarioRun } from '../../src/reporting/check-matrix';

const S1 = SCENARIOS.spinCompleted;
const S2 = SCENARIOS.insufficientBalance;

const run = (over: Partial<ScenarioRun>): ScenarioRun => ({ scenario: S1.title, market: 'betsson-es', status: 'passed', checks: [], ...over });

test('lists every catalog check, marking unreached ones as not run', () => {
  const matrix = buildMatrix([
    run({
      status: 'failed',
      checks: [
        { ...S1.checks.betssonCurrency, passed: true, detail: '98,90 € (expected EUR)' },
        { ...S1.checks.realPlay, passed: false, detail: 'practice banner hidden: false' },
      ],
    }),
  ]);

  const total = Object.keys(S1.checks).length + Object.keys(S2.checks).length;
  expect(matrix.rows).toHaveLength(total);
  expect(matrix.totals).toEqual({ pass: 1, fail: 1, 'not-run': total - 2 });
  expect(matrix.verdict).toBe('fail');
  expect(matrix.rows.find((r) => r.id === 'S1-02')!.cells['betsson-es']).toEqual({ state: 'fail', detail: 'practice banner hidden: false' });
  expect(matrix.rows.find((r) => r.id === 'S2-05')!.cells['betsson-es']!.state).toBe('not-run');
});

test('passes only when every check of every scenario passed', () => {
  const all = (scenario: { title: string; checks: Record<string, { id: string; title: string }> }) =>
    run({ scenario: scenario.title, checks: Object.values(scenario.checks).map((c) => ({ ...c, passed: true })) });
  expect(buildMatrix([all(S1), all(S2)]).verdict).toBe('pass');
  expect(buildMatrix([]).verdict).toBe('fail');
});

test('one column per market', () => {
  const matrix = buildMatrix([run({ market: 'betsson-pe' }), run({ market: 'betsson-es' })]);
  expect(matrix.markets).toEqual(['betsson-es', 'betsson-pe']);
});

test('markdown shows the verdict, the table, failed check details and run errors', () => {
  const matrix = buildMatrix(
    [run({ status: 'failed', error: 'Login blocked', checks: [{ ...S1.checks.realPlay, passed: false, detail: 'a | b' }] })],
    [{ where: 'betsson-es-setup: log in with the funded account', error: 'Betsson blocked the login' }],
  );
  const md = toMarkdown(matrix, 'playwright-report/index.html');
  expect(md).toContain('**Verdict: ❌ FAIL**');
  expect(md).toContain('| Check | betsson-es |');
  expect(md).toContain('| S1-02 Game runs in Real Play | ❌ fail |');
  expect(md).toContain('a \\| b'); // pipes in details must not break the table
  expect(md).toContain('Betsson blocked the login');
  expect(md).toContain('[Playwright report](playwright-report/index.html)');
});

test('html escapes values coming from the page', () => {
  const html = toHtml(buildMatrix([run({ checks: [{ ...S1.checks.realPlay, passed: true, detail: '<script>x</script>' }] })]));
  expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  expect(html).not.toContain('<script>x</script>');
});
