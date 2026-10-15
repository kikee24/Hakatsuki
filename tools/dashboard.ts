/**
 * Opens the results dashboard, or builds it from an exported run:
 *
 *   npm run report                                 dashboard of the last run (dashboard/index.html)
 *   npm run report -- results-export/<timestamp>   build it from a folder written by export:results
 *   npm run report -- <folder> --no-open           build only
 *
 * The last run's dashboard is written by the dashboard reporter when the tests end. Without one,
 * the newest results-export/ folder is used. Everything stays on this machine: dashboard/,
 * results-export/ and dashboard-export/ are gitignored, since they show the real accounts' screens.
 * Exports are built into dashboard-export/, so they never replace the last run's dashboard.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { testsFromJsonReport, type JsonReport } from '../src/reporting/dashboard/model';
import { writeDashboard } from '../src/reporting/dashboard/write';

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const source = args.find((a) => !a.startsWith('--'));

const LAST_RUN = join('dashboard', 'index.html');
const EXPORT_OUT = 'dashboard-export';

const hasResults = (dir: string) => existsSync(join(dir, 'scenarios.json')) || existsSync(join(dir, 'unit.json'));

function newestExport(): string | undefined {
  if (!existsSync('results-export')) return undefined;
  return readdirSync('results-export')
    .map((name) => join('results-export', name))
    .filter((dir) => statSync(dir).isDirectory() && hasResults(dir))
    .sort()
    .at(-1);
}

function build(dir: string): string {
  if (!hasResults(dir)) {
    console.error(`${dir} has no scenarios.json or unit.json (see docs/panel-de-control.md).`);
    process.exit(1);
  }
  const reports = ['scenarios.json', 'unit.json'].map((f) => join(dir, f)).filter(existsSync);
  const parsed = reports.map((f) => JSON.parse(readFileSync(f, 'utf8')) as JsonReport);
  const tests = parsed.flatMap((r) => testsFromJsonReport(r, resolve(dir)));
  const stats = parsed[0]?.stats;
  const { index, data } = writeDashboard(EXPORT_OUT, { startedAt: stats?.startTime, durationMs: stats?.duration, tests });
  console.log(`Dashboard of ${dir} (${data.tests.length} tests) → ${index}`);
  return index;
}

function open(file: string): void {
  const target = resolve(file);
  const [command, commandArgs]: [string, string[]] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', target]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [target]];
  spawn(command, commandArgs, { stdio: 'ignore', detached: true }).unref();
}

let index: string;
if (source) {
  index = build(source);
} else if (existsSync(LAST_RUN)) {
  index = LAST_RUN;
  console.log(`Dashboard of the last run → ${index}`);
} else {
  const dir = newestExport();
  if (!dir) {
    console.error('No run yet: the dashboard is written to dashboard/ when the tests end. Run npm test first (see README).');
    process.exit(1);
  }
  console.log(`No dashboard from a run yet (it is written when the tests end); using ${dir}.`);
  index = build(dir);
}
if (!noOpen) open(index);
