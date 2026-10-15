import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { checksOf, cleanError, isUnit, notesOf, testsFromJsonReport, type JsonReport, type RawAttachment, type TestEntry } from './dashboard/model';
import { writeDashboard } from './dashboard/write';

interface Options {
  /** Folder for index.html, dashboard.json and files/. */
  outputDir?: string;
  /** Link to the Playwright HTML report, relative to outputDir. */
  reportLink?: string;
  /**
   * JSON report of the last unit-only run (npm run test:unit). Shown when this run has no unit
   * tests, so a scenario-only run still has the unit results next to it.
   */
  unitResults?: string;
}

const isSession = (project: string) => project.endsWith('-session');
const projectOf = (test: TestCase) => test.parent.project()?.name ?? '';
const repoPath = (file: string) => relative(process.cwd(), file).replace(/\\/g, '/');

/**
 * Writes the results dashboard when a run ends: per scenario and market, every check with PASS/FAIL,
 * what it verifies and the values it saw, with the screenshots and video of each test.
 * Also used by `playwright merge-reports` in CI (merge.config.ts), which publishes it.
 */
export default class DashboardReporter implements Reporter {
  private readonly tests = new Map<string, TestEntry<RawAttachment>>();
  private readonly outputDir: string;
  private readonly reportLink?: string;
  private readonly unitResults?: string;

  constructor(options: Options = {}) {
    this.outputDir = options.outputDir ?? 'dashboard';
    this.reportLink = options.reportLink;
    this.unitResults = options.unitResults;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    // Every planned scenario gets an entry first, so one that never reports back shows as not run.
    for (const test of suite.allTests()) {
      const project = projectOf(test);
      if (project === 'unit' || isSession(project)) continue;
      this.tests.set(test.id, this.entry(test, project, undefined));
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = projectOf(test);
    if (isSession(project)) return;
    this.tests.set(test.id, this.entry(test, project, result));
  }

  onEnd(result: FullResult): void {
    const tests = [...this.tests.values()];
    if (tests.length === 0) return;
    let unitSource: string | undefined;
    if (!tests.some(isUnit) && this.unitResults && existsSync(this.unitResults)) {
      const report = JSON.parse(readFileSync(this.unitResults, 'utf8')) as JsonReport;
      tests.push(...testsFromJsonReport(report, dirname(this.unitResults)).filter(isUnit));
      unitSource = `de la última ejecución de unitarios (${statSync(this.unitResults).mtime.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })})`;
    }
    const { index } = writeDashboard(this.outputDir, {
      startedAt: result.startTime.toISOString(),
      durationMs: result.duration,
      reportLink: this.reportLink,
      unitSource,
      tests,
    });
    console.log(`Dashboard → ${index}`);
  }

  private entry(test: TestCase, project: string, result: TestResult | undefined): TestEntry<RawAttachment> {
    const annotations = [...test.annotations, ...(result?.annotations ?? [])];
    const unique = annotations.filter((a, i) => annotations.findIndex((b) => b.type === a.type && b.description === a.description) === i);
    return {
      project,
      file: repoPath(test.location.file),
      // titlePath: root, project, file, ...describe blocks, title
      describes: test.titlePath().slice(3, -1),
      title: test.title,
      status: result?.status ?? 'did not run',
      durationMs: result?.duration ?? 0,
      errors: (result?.errors ?? []).map((e) => cleanError(e.message ?? e.value)).filter((e): e is string => !!e),
      steps: (result?.steps ?? [])
        .filter((s) => s.category === 'test.step')
        .map((s) => ({ title: s.title, durationMs: s.duration, error: cleanError(s.error?.message) })),
      checks: checksOf(unique),
      notes: notesOf(unique),
      attachments: (result?.attachments ?? []).map((a) => ({ name: a.name, contentType: a.contentType, path: a.path, body: a.body })),
    };
  }
}
