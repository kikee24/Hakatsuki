# Reconnaissance — betsson.es (15 Oct 2026)

Findings from exploring the site manually before writing page objects.

## Access
- `https://www.betsson.es/casino` loads from Spain without geo-blocking.
- OneTrust cookie banner: "Configuración de cookies" → "Rechazarlas todas".
- An anti-fraud script from Group-IB is loaded (`eu.id.group-ib.com` iframe, `/cdn/fraud/api/fl`).
  Risk: it may flag automated or datacenter traffic (GitHub-hosted runners).

## Lobby
- Provider filter: "Filtros" → "Pragmatic Play" → 309 games (`/casino/todos-los-juegos`).
- Game tiles are not `<a>` links; hovering shows "Ingresar y jugar" when logged out.
- No demo mode when logged out: "Para jugar a este juego debes iniciar sesión."

## Chosen game: Wolf Gold (Pragmatic Play)
- Classic 5x3 line slot, no cascades → simple "spin started / spin finished" detection.
- Direct URL: `/casino/tragaperras-slots/wolf-gold?gameAction=play`
- Launcher: `/api/v1/Gamelauncher/?gameId=pragmaticPlayWolfGold&marketCode=es&forReal=true&provider=PragmaticPlay&...`
  (`forReal=true` confirms Real Play).

## Login form
- Logged-out game URL redirects to `/inicio?gameAction=play&returnUrl=...`.
- The page is built with web components (open shadow DOM). Playwright CSS / `getByTestId` pierce it.

| Element | Selector |
|---|---|
| Username / email | `[data-testid="email-input"]` |
| Password | `[data-testid="password-input"]` |
| Submit | `[data-testid="account-login-btn-1-button"]` |
| Close dialog | `[data-testid="dialog-close-button"]` |

## Balance
- Header shows a "Saldo" button; the amount is only visible after opening its dropdown.
- The dropdown shows the player's display name next to the balance,
  then "Bono", "Reservado" and "Disponible para retirar". **Mask the name in every screenshot.**
- Wallet API: `GET /api/v2/wallet/balance` — useful as a cross-check, not as primary evidence.

## Practice vs Real Play
- Logged-in players can land in **practice mode**: an orange bar above the game says
  "Estás jugando a Wolf Gold en el modo Práctica. **Quiero jugar en modo real**".
- Practice credit is fake (100.000,00 €) and the bottom-left label reads "PRAGMATIC PLAY".
- In Real Play the orange bar is gone, the label reads "WOLF GOLD™" and
  **CRÉDITO equals the Betsson balance** (98,90 € in our run). Both are Real Play checks.
- Practice mode is free: use it to iterate on vision code without spending.

## Game HUD (Wolf Gold, desktop)
- Intro splash first (wolf + round "continue" button + "NO VOLVER A MOSTRAR" checkbox).
- Bottom-left: `CRÉDITO 98,90 €` and `APUESTA 2,00 €` (gold labels, white values).
  Spanish number format: `99.992,40 €` (dot thousands, comma decimals, € after).
- Bottom-right: spin button (greyed while spinning), `−` / `+` bet buttons, `TIR. AUTO.` below.
- Top: jackpot values `MINI 60,00 €`, `MAJOR 200,00 €`, `MEGA 2.000,00 €` — do not confuse with balance.
- **Default bet is 2,00 €.** Lower it with `−` before any real spin.

### Status message (bottom centre) — drives the spin state machine
| Text | Meaning |
|---|---|
| `¡HAGA SU APUESTA!` | Idle, ready to spin |
| `¡BUENA SUERTE!` | Spin in progress (credit already reduced by the bet) |
| `GANANCIA 0,40 €` + `LA LÍNEA 12 ABONA 0,40 €` | Spin settled with a win (payout) |

## Insufficient funds (empty account, Real Play)
- In-game modal titled `MENSAJE`:
  "Fondos insuficientes para realizar esta apuesta. Haga un depósito en su cuenta o reduzca el
  nivel de la apuesta." with an `ACEPTAR` button. Matches the `fondos insuficientes` keyword.

## Automation status
- **Logging in from a Playwright-driven browser triggered a temporary block**:
  "Actualiza la página y vuelve a intentarlo en breve. La resolución puede demorar hasta 10 minutos."
  Likely the anti-fraud layer. Asked the mentors whether test accounts can be allow-listed.
- The browser pane inside Claude Desktop cannot finish loading Pragmatic games (loader stops ~70%).
- Playwright's bundled Chromium 156 does not start on our Windows laptop; we use the installed
  Google Chrome locally (`BROWSER_CHANNEL`).

## Open questions
- Session-limits dialog (Spanish regulation): not seen in our manual run — confirm.
- Does the Betsson header balance update during play, or only after closing the game?
