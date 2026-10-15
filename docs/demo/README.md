# Manual recordings — betsson.es, Wolf Gold (15 Oct 2026)

Both scenarios played by hand in a regular Chrome window with the test accounts, recorded with the
Windows Game Bar. They show the player-visible behaviour the automated checks verify. No
credentials or account names appear in them.

| File | Scenario | What to look for |
|---|---|---|
| `scenario1-funded-spin.mp4` | 1 — completed Real Play spin (funded account) | Bet lowered with `−`, one spin: `CRÉDITO` drops by `APUESTA` when the reels start, the status line goes `¡BUENA SUERTE!` → result, and the credit settles |
| `scenario2-insufficient-balance.mp4` | 2 — insufficient balance (account without balance) | Spin attempted: the reels do not move, the `MENSAJE` pop-up says "Fondos insuficientes para realizar esta apuesta…", `CRÉDITO` does not change |

Why manual: Betsson's anti-fraud blocks logins from automated browsers ("Actualiza la página y
vuelve a intentarlo en breve"), so the automated scenarios could not log in during the build window.
The vision code that reads these screens is tested on real screenshots in `tests/fixtures/screens`.
