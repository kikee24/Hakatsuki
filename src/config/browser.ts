/**
 * Browser channel to drive: BROWSER_CHANNEL=chrome|msedge, or empty for Playwright's bundled Chromium.
 * On Windows we default to the installed Google Chrome: the bundled Chromium 156 build fails to
 * start there ("side-by-side configuration is incorrect"). CI on Linux uses the bundled one.
 */
export function browserChannel(): string | undefined {
  const value = process.env.BROWSER_CHANNEL?.trim();
  if (value) return value === 'chromium' ? undefined : value;
  return process.platform === 'win32' ? 'chrome' : undefined;
}
