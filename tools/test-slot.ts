/**
 * Runs the E2E scenarios for one configured game without requiring the user to set
 * an environment variable:
 *
 *   npm run test:slot -- wolf-gold
 *   npm run test:slot -- bubble-up
 *   npm run test:slot -- bubble-up tests/e2e/spin-completed.spec.ts   (extra Playwright arguments)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const gameId = process.argv[2]?.trim() || 'wolf-gold';
const extraArgs = process.argv.slice(3);
const configPath = resolve('config', 'games', `${gameId}.json`);

if (!existsSync(configPath)) {
  console.error(`Unknown game "${gameId}". Missing configuration: ${configPath}`);
  process.exit(1);
}

// Run Playwright's CLI with this same Node: spawning npm.cmd without a shell fails on Windows with
// Node 20+ (EINVAL), and a shell would need quoting.
const playwrightCli = resolve('node_modules', '@playwright', 'test', 'cli.js');
const result = spawnSync(process.execPath, [playwrightCli, 'test', '--project=betsson-es', ...extraArgs], {
  stdio: 'inherit',
  env: { ...process.env, GAME_ID: gameId },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
