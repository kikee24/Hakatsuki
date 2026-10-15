import { resolve } from 'node:path';
import { CATALOG } from '../check-catalog';
import type { ScenarioRun } from '../check-matrix';
import { CHECK_ANNOTATION, type CheckRecord } from '../checks';

/** An attachment as the test produced it, before it is copied next to the dashboard. */
export interface RawAttachment {
  name: string;
  contentType: string;
  /** Absolute path of the file. */
  path?: string;
  body?: Buffer;
  /** Why the file is not available (e.g. a trace left out of an export). */
  omitted?: string;
}

/** An attachment as the dashboard shows it. */
export interface Evidence {
  name: string;
  contentType: string;
  /** Path relative to the dashboard's index.html. */
  href?: string;
  /** Contents of small text and JSON attachments, shown inline. */
  text?: string;
  omitted?: string;
}

export interface StepEntry {
  title: string;
  durationMs: number;
  error?: string;
}

export interface TestEntry<A = Evidence> {
  /** Playwright project: the market id, or "unit". */
  project: string;
  /** Spec file, relative to the repository. */
  file: string;
  /** Describe blocks around the test (unit tests). */
  describes: string[];
  title: string;
  /** passed | failed | timedOut | skipped | interrupted | did not run */
  status: string;
  durationMs: number;
  errors: string[];
  steps: StepEntry[];
  checks: CheckRecord[];
  /** Annotations other than checks, e.g. bonus, rejected-by, dismiss. */
  notes: { type: string; description?: string }[];
  attachments: A[];
}

export interface DashboardData {
  generatedAt: string;
  startedAt?: string;
  durationMs?: number;
  /** Where the unit results come from when they are not part of this run. */
  unitSource?: string;
  /** Link to the Playwright HTML report, relative to index.html. */
  reportLink?: string;
  tests: TestEntry[];
}

export const isUnit = (t: Pick<TestEntry<unknown>, 'project'>) => t.project === 'unit';

export function cleanError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.replace(/\u001b\[[0-9;]*m/g, '').trim().split('\n').slice(0, 6).join('\n').slice(0, 1200);
}

export function checksOf(annotations: { type: string; description?: string }[]): CheckRecord[] {
  return annotations.filter((a) => a.type === CHECK_ANNOTATION && a.description).map((a) => JSON.parse(a.description!) as CheckRecord);
}

export function notesOf(annotations: { type: string; description?: string }[]) {
  return annotations.filter((a) => a.type !== CHECK_ANNOTATION).map(({ type, description }) => ({ type, description }));
}

/** Scenario tests in the shape the check matrix is built from. */
export function scenarioRuns(tests: TestEntry<unknown>[]): ScenarioRun[] {
  return tests
    .filter((t) => !isUnit(t))
    .map((t) => ({
      scenario: t.title,
      market: t.project,
      status: t.status,
      checks: t.checks,
      error: t.errors[0]?.split('\n')[0],
      durationMs: t.durationMs,
    }));
}

const SCENARIO_ORDER = CATALOG.map((c) => c.scenario);

/** Catalog scenarios first (Scenario 1, 2), then other tests; by market within each. */
export function sortTests<T extends TestEntry<unknown>>(tests: T[]): T[] {
  const rank = (t: T) => {
    const i = SCENARIO_ORDER.indexOf(t.title);
    return i === -1 ? SCENARIO_ORDER.length : i;
  };
  return [...tests].sort((a, b) => rank(a) - rank(b) || a.project.localeCompare(b.project));
}

// ---------------------------------------------------------------------------------------------
// Playwright JSON report (the `json` reporter, or a folder written by `npm run export:results`)

interface JsonResult {
  status: string;
  duration: number;
  errors?: { message?: string }[];
  steps?: { title: string; duration: number; error?: { message?: string } }[];
  annotations?: { type: string; description?: string }[];
  attachments?: { name: string; contentType: string; path?: string; body?: string; omitted?: string }[];
}

interface JsonSuite {
  title: string;
  file?: string;
  specs?: { title: string; file?: string; tests: { projectName: string; annotations?: { type: string; description?: string }[]; results: JsonResult[] }[] }[];
  suites?: JsonSuite[];
}

export interface JsonReport {
  stats?: { startTime?: string; duration?: number };
  suites?: JsonSuite[];
}

/**
 * Tests of a JSON report, with attachment paths resolved against `baseDir` (relative paths are
 * what `npm run export:results` writes; the json reporter writes absolute ones).
 */
export function testsFromJsonReport(report: JsonReport, baseDir: string): TestEntry<RawAttachment>[] {
  const tests: TestEntry<RawAttachment>[] = [];
  const walk = (suite: JsonSuite, file: string, describes: string[]) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        // One result per attempt; the last one is the outcome (there are no retries by default).
        const result = test.results.at(-1);
        const annotations = [...(test.annotations ?? []), ...(result?.annotations ?? [])];
        const unique = annotations.filter((a, i) => annotations.findIndex((b) => b.type === a.type && b.description === a.description) === i);
        tests.push({
          project: test.projectName,
          file: (spec.file ?? file).replace(/\\/g, '/'),
          describes,
          title: spec.title,
          status: result?.status ?? 'did not run',
          durationMs: result?.duration ?? 0,
          errors: (result?.errors ?? []).map((e) => cleanError(e.message)).filter((e): e is string => !!e),
          steps: (result?.steps ?? []).map((s) => ({ title: s.title, durationMs: s.duration, error: cleanError(s.error?.message) })),
          checks: checksOf(unique),
          notes: notesOf(unique),
          attachments: (result?.attachments ?? []).map((a) => ({
            name: a.name,
            contentType: a.contentType,
            path: a.path ? resolve(baseDir, a.path) : undefined,
            body: a.body !== undefined ? Buffer.from(a.body, 'base64') : undefined,
            omitted: a.omitted,
          })),
        });
      }
    }
    // Top-level suites are files; the suites inside them are describe blocks.
    for (const child of suite.suites ?? []) walk(child, child.file ?? file, [...describes, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file ?? suite.title, []);
  return tests;
}
