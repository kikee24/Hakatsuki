import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { buildMatrix, toHtml, toMarkdown, type RunProblem, type ScenarioRun } from './check-matrix';
import { CHECK_ANNOTATION, type CheckRecord } from './checks';

interface Options {
  /** Folder for index.html, check-matrix.md and check-matrix.json. */
  outputDir?: string;
  /** Link from the matrix to the Playwright HTML report, relative to outputDir. */
  reportLink?: string;
}

const isSetup = (project: string) => project.endsWith('-setup');
const projectOf = (test: TestCase) => test.parent.project()?.name ?? '';

function cleanError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const plain = message.replace(/\u001b\[[0-9;]*m/g, '').trim();
  return plain.split('\n').slice(0, 2).join(' ').slice(0, 300);
}

/**
 * Builds the pass/fail matrix (check × market) from the "check" annotations the scenarios record.
 * Also writes it to the GitHub Actions job summary when running in CI.
 */
export default class CheckMatrixReporter implements Reporter {
  private readonly runs = new Map<string, ScenarioRun>();
  private readonly problems: RunProblem[] = [];
  private readonly outputDir: string;
  private readonly reportLink?: string;

  constructor(options: Options = {}) {
    this.outputDir = options.outputDir ?? 'check-matrix';
    this.reportLink = options.reportLink;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    // Register every planned scenario first: if the login setup fails, they never report back.
    for (const test of suite.allTests()) {
      const market = projectOf(test);
      if (market === 'unit' || isSetup(market)) continue;
      this.runs.set(`${market}::${test.title}`, { scenario: test.title, market, status: 'did not run', checks: [] });
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const market = projectOf(test);
    if (market === 'unit') return;
    if (isSetup(market)) {
      if (result.status !== 'passed' && result.status !== 'skipped') {
        this.problems.push({ where: `${market}: ${test.title}`, error: cleanError(result.error?.message) ?? result.status });
      }
      return;
    }
    const checks = result.annotations
      .filter((a) => a.type === CHECK_ANNOTATION && a.description)
      .map((a) => JSON.parse(a.description!) as CheckRecord);
    this.runs.set(`${market}::${test.title}`, {
      scenario: test.title,
      market,
      status: result.status,
      checks,
      error: cleanError(result.error?.message),
      durationMs: result.duration,
    });
  }

  onEnd(): void {
    const runs = [...this.runs.values()];
    if (runs.length === 0 && this.problems.length === 0) return; // e.g. unit tests only
    const matrix = buildMatrix(runs, this.problems);
    const markdown = toMarkdown(matrix);

    mkdirSync(this.outputDir, { recursive: true });
    writeFileSync(join(this.outputDir, 'index.html'), toHtml(matrix, this.reportLink));
    writeFileSync(join(this.outputDir, 'check-matrix.md'), toMarkdown(matrix, this.reportLink));
    writeFileSync(join(this.outputDir, 'check-matrix.json'), JSON.stringify(matrix, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');

    console.log(
      `\nCheck matrix: ${matrix.verdict.toUpperCase()} (${matrix.totals.pass} passed, ${matrix.totals.fail} failed, ` +
        `${matrix.totals['not-run']} not run) → ${join(this.outputDir, 'index.html')}`,
    );
  }
}
