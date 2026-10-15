import { existsSync } from 'node:fs';

/** Installed Chromium-based browsers on Windows, preferred first (Chrome starts faster than Edge). */
const WINDOWS_BROWSERS: { channel: 'chrome' | 'msedge'; paths: (string | undefined)[] }[] = [
  {
    channel: 'chrome',
    paths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
  },
  {
    channel: 'msedge',
    paths: ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'],
  },
];

function installedWindowsBrowser(): { channel: 'chrome' | 'msedge'; path: string } | undefined {
  for (const { channel, paths } of WINDOWS_BROWSERS) {
    const path = paths.find((p) => p && existsSync(p));
    if (path) return { channel, path };
  }
  return undefined;
}

/**
 * Browser channel to drive: BROWSER_CHANNEL=chrome|msedge, or empty for Playwright's bundled Chromium.
 * On Windows we default to an installed Chrome, else Edge: the bundled Chromium 156 build fails to
 * start there ("side-by-side configuration is incorrect"). CI on Linux uses the bundled one.
 */
export function browserChannel(): string | undefined {
  const value = process.env.BROWSER_CHANNEL?.trim();
  if (value) return value === 'chromium' ? undefined : value;
  return process.platform === 'win32' ? (installedWindowsBrowser()?.channel ?? 'chrome') : undefined;
}

/** Executable for the hand-logged-in windows (src/session/): BROWSER_EXECUTABLE, else Chrome, else Edge. */
export function browserExecutable(): string {
  const explicit = process.env.BROWSER_EXECUTABLE?.trim();
  if (explicit) return explicit;
  const found = process.platform === 'win32' ? installedWindowsBrowser()?.path : undefined;
  if (!found) throw new Error('Neither Chrome nor Edge found. Set BROWSER_EXECUTABLE to a Chromium-based browser.');
  return found;
}
