import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { buildMatrix } from '../check-matrix';
import { isUnit, scenarioRuns, sortTests, type DashboardData, type Evidence, type RawAttachment, type TestEntry } from './model';
import { renderDashboard } from './render';

export type DashboardInput = Omit<DashboardData, 'tests' | 'generatedAt'> & { generatedAt?: string; tests: TestEntry<RawAttachment>[] };

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'video/webm': '.webm',
  'video/mp4': '.mp4',
  'application/json': '.json',
  'text/plain': '.txt',
  'text/markdown': '.md',
};

/** Text attachments up to this size are also embedded in the page (OCR text, JSON evidence). */
const INLINE_TEXT_BYTES = 64 * 1024;

const TRACE_OMITTED = 'traza solo en local: graba el tráfico de la sesión real (cookies, tokens); ábrela con npx playwright show-trace';

/** Traces hold the live session's cookies and tokens: never copied next to a page meant to be shared. */
const isTrace = (a: RawAttachment) => a.name === 'trace' || a.contentType === 'application/zip';
const isText = (contentType: string) => contentType.startsWith('text/') || contentType === 'application/json';

/**
 * Writes the dashboard to `outDir`: index.html, dashboard.json (the same data) and files/ with
 * every attachment it links to. Returns the path of index.html.
 */
export function writeDashboard(outDir: string, input: DashboardInput): { index: string; data: DashboardData } {
  const filesDir = join(outDir, 'files');
  rmSync(filesDir, { recursive: true, force: true });
  mkdirSync(filesDir, { recursive: true });
  let count = 0;

  const exportOne = (a: RawAttachment): Evidence => {
    const base = { name: a.name, contentType: a.contentType };
    if (isTrace(a)) return { ...base, omitted: TRACE_OMITTED };
    if (a.omitted) return { ...base, omitted: a.omitted };
    const n = String(++count).padStart(4, '0');
    const safe = a.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'attachment';
    const ext = (a.path && extname(a.path)) || EXTENSIONS[a.contentType] || '.bin';
    const file = `${n}-${safe}${ext}`;
    let size: number;
    if (a.body !== undefined) {
      writeFileSync(join(filesDir, file), a.body);
      size = a.body.length;
    } else if (a.path && existsSync(a.path)) {
      copyFileSync(a.path, join(filesDir, file));
      size = statSync(a.path).size;
    } else {
      return { ...base, omitted: 'el fichero ya no está en disco' };
    }
    const text = isText(a.contentType) && size <= INLINE_TEXT_BYTES ? readFileSync(join(filesDir, file), 'utf8') : undefined;
    return { ...base, href: `files/${file}`, text };
  };

  const tests = sortTests(input.tests).map((t) => ({
    ...t,
    // The unit tests are listed without their attachments (traces, fixture images).
    attachments: isUnit(t) ? [] : t.attachments.map(exportOne),
  }));
  const data: DashboardData = { ...input, generatedAt: input.generatedAt ?? new Date().toISOString(), tests };
  const matrix = buildMatrix(scenarioRuns(tests), [], new Date(data.generatedAt));

  const index = join(outDir, 'index.html');
  writeFileSync(index, renderDashboard(data, matrix));
  writeFileSync(join(outDir, 'dashboard.json'), JSON.stringify({ ...data, matrix }, null, 2));
  return { index, data };
}
