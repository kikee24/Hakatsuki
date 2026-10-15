/**
 * Runs the E2E scenarios for one configured game without requiring the user to set
 * an environment variable:
 *
 *   npm run test:slot -- wolf-gold
 *   npm run test:slot -- sweet-bonanza
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const gameId = process.argv[2]?.trim() || 'wolf-gold';
const configPath = resolve('config', 'games', `${gameId}.json`);

if (!existsSync(configPath)) {
  console.error(`Unknown game "${gameId}". Missing configuration: ${configPath}`);
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['exec', '--', 'playwright', 'test', '--project=betsson-es'], {
  stdio: 'inherit',
  env: { ...process.env, GAME_ID: gameId },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
