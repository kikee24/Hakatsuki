import { CATALOG } from './check-catalog';
import type { CheckRecord } from './checks';

export type CellState = 'pass' | 'fail' | 'not-run';

export interface MatrixCell {
  state: CellState;
  detail?: string;
}

/** One scenario test in one market project. */
export interface ScenarioRun {
  scenario: string;
  market: string;
  /** Playwright status, or "did not run" when a dependency (login) failed first. */
  status: string;
  checks: CheckRecord[];
  error?: string;
  durationMs?: number;
}

/** Something that failed outside the scenarios, e.g. the login setup. */
export interface RunProblem {
  where: string;
  error: string;
}

export interface MatrixRow {
  scenario: string;
  id: string;
  title: string;
  cells: Record<string, MatrixCell>;
}

export interface CheckMatrix {
  generatedAt: string;
  verdict: 'pass' | 'fail';
  totals: Record<CellState, number>;
  markets: string[];
  runs: ScenarioRun[];
  rows: MatrixRow[];
  problems: RunProblem[];
}

export function buildMatrix(runs: ScenarioRun[], problems: RunProblem[] = [], now = new Date()): CheckMatrix {
  const markets = [...new Set(runs.map((r) => r.market))].sort();
  const runOf = (scenario: string, market: string) => runs.find((r) => r.scenario === scenario && r.market === market);

  const definitions = CATALOG.flatMap(({ scenario, checks }) => checks.map((c) => ({ scenario, ...c })));
  // Checks a spec reported that are not (yet) in the catalog still get a row.
  for (const run of runs) {
    for (const c of run.checks) {
      if (!definitions.some((d) => d.scenario === run.scenario && d.id === c.id)) {
        definitions.push({ scenario: run.scenario, id: c.id, title: c.title });
      }
    }
  }

  const rows: MatrixRow[] = definitions.map((d) => ({
    ...d,
    cells: Object.fromEntries(
      markets.map((market) => {
        const record = runOf(d.scenario, market)?.checks.find((c) => c.id === d.id);
        const cell: MatrixCell = record ? { state: record.passed ? 'pass' : 'fail', detail: record.detail } : { state: 'not-run' };
        return [market, cell];
      }),
    ),
  }));

  const totals: Record<CellState, number> = { pass: 0, fail: 0, 'not-run': 0 };
  for (const row of rows) for (const cell of Object.values(row.cells)) totals[cell.state]++;
  const allRunsPassed = runs.every((r) => r.status === 'passed');
  const verdict = totals.fail === 0 && totals['not-run'] === 0 && allRunsPassed && runs.length > 0 ? 'pass' : 'fail';

  return { generatedAt: now.toISOString(), verdict, totals, markets, runs, rows, problems };
}

const ICON: Record<CellState, string> = { pass: '✅ pass', fail: '❌ fail', 'not-run': '⚪ not run' };
const mdCell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function toMarkdown(matrix: CheckMatrix, reportLink?: string): string {
  const { totals, markets } = matrix;
  const lines = [
    '## Intelligent Game Validation — check matrix',
    '',
    `**Verdict: ${matrix.verdict === 'pass' ? '✅ PASS' : '❌ FAIL'}** · ${totals.pass} passed · ${totals.fail} failed · ${totals['not-run']} not run`,
    '',
  ];
  if (markets.length === 0) {
    lines.push('_No scenario ran._', '');
  } else {
    lines.push(`| Check | ${markets.join(' | ')} |`, `|---|${markets.map(() => '---').join('|')}|`);
    for (const { scenario } of groupByScenario(matrix.rows)) {
      const runs = markets.map((m) => matrix.runs.find((r) => r.scenario === scenario && r.market === m)?.status ?? 'did not run');
      lines.push(`| **${mdCell(scenario)}** | ${runs.map((s) => `_test ${s}_`).join(' | ')} |`);
      for (const row of matrix.rows.filter((r) => r.scenario === scenario)) {
        lines.push(`| ${row.id} ${mdCell(row.title)} | ${markets.map((m) => ICON[row.cells[m]!.state]).join(' | ')} |`);
      }
    }
    lines.push('');
  }

  const failures = matrix.rows.flatMap((row) =>
    markets.filter((m) => row.cells[m]!.state === 'fail').map((m) => `- **${row.id}** (${m}): ${mdCell(row.cells[m]!.detail ?? 'no detail')}`),
  );
  if (failures.length) lines.push('### Failed checks', '', ...failures, '');

  const errors = [
    ...matrix.runs.filter((r) => r.error).map((r) => `- **${mdCell(r.scenario)}** (${r.market}): ${mdCell(r.error!)}`),
    ...matrix.problems.map((p) => `- **${mdCell(p.where)}**: ${mdCell(p.error)}`),
  ];
  if (errors.length) lines.push('### Run errors', '', ...errors, '');
  if (reportLink) lines.push(`Screenshots, OCR evidence, traces and videos: [Playwright report](${reportLink})`, '');
  return lines.join('\n');
}

function groupByScenario(rows: MatrixRow[]) {
  return [...new Set(rows.map((r) => r.scenario))].map((scenario) => ({ scenario }));
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toHtml(matrix: CheckMatrix, reportLink?: string): string {
  const { markets, totals } = matrix;
  const head = markets.map((m) => `<th scope="col">${esc(m)}</th>`).join('');
  const body = groupByScenario(matrix.rows)
    .map(({ scenario }) => {
      const runCells = markets
        .map((m) => {
          const run = matrix.runs.find((r) => r.scenario === scenario && r.market === m);
          const status = run?.status ?? 'did not run';
          return `<td class="run ${status === 'passed' ? 'ok' : 'ko'}">test ${esc(status)}${run?.error ? `<small>${esc(run.error)}</small>` : ''}</td>`;
        })
        .join('');
      const checkRows = matrix.rows
        .filter((r) => r.scenario === scenario)
        .map((row) => {
          const cells = markets
            .map((m) => {
              const cell = row.cells[m]!;
              return `<td class="cell ${cell.state}"><span class="state">${ICON[cell.state]}</span>${cell.detail ? `<small>${esc(cell.detail)}</small>` : ''}</td>`;
            })
            .join('');
          return `<tr><th scope="row"><code>${esc(row.id)}</code> ${esc(row.title)}</th>${cells}</tr>`;
        })
        .join('');
      return `<tr class="scenario"><th scope="row">${esc(scenario)}</th>${runCells}</tr>${checkRows}`;
    })
    .join('');
  const problems = matrix.problems.length
    ? `<section><h2>Run errors</h2><ul>${matrix.problems.map((p) => `<li><strong>${esc(p.where)}</strong>: ${esc(p.error)}</li>`).join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Check Matrix</title>
<style>
  :root { --bg:#f7f7f8; --surface:#fff; --text:#1c1c21; --muted:#5e5e6a; --line:#dcdce2;
          --pass:#0f7b3f; --pass-bg:#e6f4ec; --fail:#b42318; --fail-bg:#fdecea; --idle:#6b6b76; --idle-bg:#efeff2; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#141418; --surface:#1d1d23; --text:#ececf1; --muted:#a3a3ae; --line:#33333c;
            --pass:#5fd394; --pass-bg:#16301f; --fail:#ff8a7a; --fail-bg:#3a1a17; --idle:#a3a3ae; --idle-bg:#26262d; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px; background:var(--bg); color:var(--text);
         font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:1100px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  .meta { color:var(--muted); margin:0 0 16px; }
  .verdict { display:inline-block; padding:4px 12px; border-radius:999px; font-weight:600; }
  .verdict.pass { color:var(--pass); background:var(--pass-bg); }
  .verdict.fail { color:var(--fail); background:var(--fail-bg); }
  .scroll { overflow-x:auto; background:var(--surface); border:1px solid var(--line); border-radius:10px; }
  table { border-collapse:collapse; width:100%; min-width:320px; }
  th, td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
  tbody th[scope=row] { width:55%; }
  @media (max-width: 600px) { th, td { padding:8px; } }
  thead th { font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  tr.scenario th, tr.scenario td { background:var(--idle-bg); font-weight:600; }
  th[scope=row] { font-weight:500; }
  code { font-size:13px; color:var(--muted); }
  small { display:block; color:var(--muted); font-size:12px; font-weight:400; margin-top:2px; }
  .cell.pass .state, .run.ok { color:var(--pass); }
  .cell.fail .state, .run.ko { color:var(--fail); }
  .cell.not-run .state { color:var(--idle); }
  .cell.fail { background:var(--fail-bg); }
  a { color:inherit; }
</style>
</head>
<body>
<main>
  <h1>Intelligent Game Validation — check matrix</h1>
  <p class="meta">Generated ${esc(matrix.generatedAt)} ·
    <span class="verdict ${matrix.verdict}">${matrix.verdict === 'pass' ? 'PASS' : 'FAIL'}</span>
    · ${totals.pass} passed · ${totals.fail} failed · ${totals['not-run']} not run
    ${reportLink ? `· <a href="${esc(reportLink)}">Evidence: Playwright report</a>` : ''}</p>
  ${markets.length ? `<div class="scroll"><table><thead><tr><th scope="col">Check</th>${head}</tr></thead><tbody>${body}</tbody></table></div>` : '<p>No scenario ran.</p>'}
  ${problems}
</main>
</body>
</html>
`;
}
