/**
 * Copies the last run's results into results-export/<timestamp>/, ready to share or to feed a
 * dashboard, without anything that holds session data:
 *
 *   npm run export:results
 *
 * Output (git-ignored):
 *   scenarios.json     Playwright JSON report of the last scenario run (test-results/results.json)
 *   unit.json          same for the last unit-only run (test-results-unit/results.json), if any
 *   check-matrix.json  pass / fail / not run per check and market (check-matrix/check-matrix.json)
 *   files/             every attachment as a file; in the JSON, `path` points here (relative)
 *
 * Traces are left out: they record the live tab's network traffic, cookies and tokens included.
 * Each attachment that was dropped keeps its name with `omitted` explaining why.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

interface Attachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
  omitted?: string;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'video/webm': '.webm',
  'application/json': '.json',
  'text/plain': '.txt',
  'text/markdown': '.md',
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join('results-export', stamp);
const filesDir = join(outDir, 'files');
mkdirSync(filesDir, { recursive: true });
let fileCount = 0;

function isSensitive(a: Attachment): boolean {
  return a.name === 'trace' || a.contentType === 'application/zip';
}

function exportAttachment(a: Attachment): Attachment {
  if (isSensitive(a)) {
    return { name: a.name, contentType: a.contentType, omitted: 'trace: holds session cookies/tokens; open it locally with npx playwright show-trace' };
  }
  const n = String(++fileCount).padStart(4, '0');
  const safeName = a.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'attachment';
  if (a.body !== undefined) {
    const file = `${n}-${safeName}${EXTENSIONS[a.contentType] ?? '.bin'}`;
    writeFileSync(join(filesDir, file), Buffer.from(a.body, 'base64'));
    return { name: a.name, contentType: a.contentType, path: `files/${file}` };
  }
  if (a.path && existsSync(a.path)) {
    const file = `${n}-${basename(a.path, extname(a.path))}${extname(a.path)}`;
    copyFileSync(a.path, join(filesDir, file));
    return { name: a.name, contentType: a.contentType, path: `files/${file}` };
  }
  return { name: a.name, contentType: a.contentType, omitted: 'file no longer on disk' };
}

/** Rewrites every `attachments` array found anywhere in a Playwright JSON report. */
function rewrite(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewrite);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) =>
        key === 'attachments' && Array.isArray(value) ? [key, (value as Attachment[]).map(exportAttachment)] : [key, rewrite(value)],
      ),
    );
  }
  return node;
}

/**
 * Nothing about the machine that ran the tests: the report's `config` section (absolute paths,
 * options) is dropped and the repository path in error stacks or messages becomes "." .
 */
function sanitize(report: Record<string, unknown>): string {
  const { config: _machineConfig, ...rest } = report;
  let json = JSON.stringify(rest, null, 2);
  const root = process.cwd();
  for (const form of [root, root.replace(/\\/g, '/')]) {
    json = json.split(JSON.stringify(form).slice(1, -1)).join('.');
  }
  return json.replace(/C:\\\\Users\\\\[^\\\\"]+/gi, 'C:\\\\Users\\\\<user>').replace(/C:\/Users\/[^/"]+/gi, 'C:/Users/<user>');
}

const sources: [string, string][] = [
  ['test-results/results.json', 'scenarios.json'],
  ['test-results-unit/results.json', 'unit.json'],
];
const written: string[] = [];
for (const [src, dst] of sources) {
  if (!existsSync(src)) continue;
  writeFileSync(join(outDir, dst), sanitize(rewrite(JSON.parse(readFileSync(src, 'utf8'))) as Record<string, unknown>));
  written.push(dst);
}
if (existsSync('check-matrix/check-matrix.json')) {
  copyFileSync('check-matrix/check-matrix.json', join(outDir, 'check-matrix.json'));
  written.push('check-matrix.json');
}

if (written.length === 0) {
  console.error('Nothing to export: run the tests first (npm run test:es / npm run test:unit).');
  process.exit(1);
}
console.log(`Exported ${written.join(', ')} and ${fileCount} attachment files to ${outDir}`);
