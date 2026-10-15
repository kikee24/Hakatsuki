import { ACCOUNT_KINDS } from '../../src/config/env';
import { test as setup } from '../../src/fixtures';
import { ensureLoggedIn } from '../../src/session/ensure-session';

// Opens one account's window (closing the other one) and, only if Betsson has forgotten the login,
// waits for a person to log in by hand. Run with: npm run session:funded / npm run session:empty
for (const kind of ACCOUNT_KINDS) {
  setup(`${kind.toLowerCase()} session is logged in`, async ({ market }) => {
    await ensureLoggedIn(market, kind);
    console.log(`>>> Sesión ${kind} lista.`);
  });
}
