# Hakatsuki — Intelligent Game Validation

Malackathon 2026 · Betsson Group challenge.

Visual end-to-end checks for Pragmatic Play games inside the Betsson casino. The game runs in a
cross-origin iframe rendered on a canvas, so the checker validates **what the player sees**:
OCR on the game HUD, motion detection on the reels and template matching on controls, instead of
relying on the game's DOM.

## Scenarios × markets

| Scenario | betsson.es (ES · EUR) | betsson.com (EN · EUR) | betsson.pe (ES · PEN) |
|---|---|---|---|
| 1. Completed Real Play spin — `balance_after = balance_before − wager + payout` | written (`tests/e2e/spin-completed.spec.ts`), not yet run live | config ready | config ready |
| 2. Insufficient balance — localized message, balances unchanged | written (`tests/e2e/insufficient-balance.spec.ts`), not yet run live | config ready | config ready |

Every requirement is a numbered check (`S1-01`…`S1-11`, `S2-01`…`S2-08`) reported as its own
step with the values that were compared, using soft assertions so one failure does not hide the rest.

The test accounts we were given are on **betsson.es**, so it is the default market. The other
markets are kept as configuration and can be enabled with `MARKETS=betsson-es,betsson-pe`.

## How the checker sees the game

The game is a canvas inside a cross-origin iframe, so every in-game fact comes from screenshots
of that iframe:

| Question | How it is answered | Code |
|---|---|---|
| What are the credit, bet and win? | OCR (Tesseract) on HUD regions, reading the amount right after each label (`CRÉDITO`, `APUESTA`, `GANANCIA`) | `src/game/hud.ts`, `src/vision/ocr.ts` |
| Did the spin start? | At least one of: status line says `¡BUENA SUERTE!`, credit dropped by exactly the bet, reels moved in two consecutive frames | `src/game/spin-tracker.ts` |
| Did it finish? | Status line shows a win, or reels still for 2 frames after having moved | `src/game/spin-tracker.ts` |
| Is the result final? | Credit identical in 2 consecutive reads (win count-up done) | `src/game/spin-tracker.ts` |
| Did the reels move? | Pixel diff of the reel area between frames (> 2% changed) | `src/vision/motion.ts` |
| Insufficient funds? | OCR of the pop-up, fuzzy-matched against the market's localized keywords | `src/game/hud-reader.ts` |

Thresholds were measured on real screenshots (`tests/fixtures/screens`): compression noise gives
0% reel change, one reel still spinning ~6%, a new set of symbols 55-67%.

## Project layout

```
config/markets/     one JSON per market (URL, language, currency, localized keywords)
config/games/       calibrated screen regions per game
assets/templates/   reference crops for template matching
src/config/         config loading and validation
src/session/        hand-logged-in browser windows per account (see Login)
src/domain/         money parsing, balance rule, fuzzy text matching (pure, unit-tested)
src/pages/          Betsson page objects (DOM)
src/game/           Pragmatic game screen object (canvas, vision only)
src/vision/         OCR, preprocessing, motion and template detection
src/evidence/       attachments and masking of personal data
src/reporting/      pass/fail matrix per scenario, market and check
tests/unit/         fast tests without a browser
tests/e2e/          scenarios, run once per market project
tests/setup/        opens each account window and waits for a manual login if needed
```

## Setup

```bash
npm ci
npx playwright install ffmpeg   # videos; on Windows the installed Chrome/Edge is used
cp .env.example .env              # optional settings, no credentials
npm run session:funded            # first time only: log in by hand in the window that opens
npm run session:empty             # same for the account without balance
```

## Login: one hand-logged-in window per account

Betsson's bot protection (AWS WAF + Group-IB) silently rejects logins typed by an automated
browser, and the session it grants cannot be copied to another browser (it lives in localStorage,
in session-only cookies and is tied to the device). So **there are no credentials in the code,
`.env` or CI**:

- Each account has its own Chrome/Edge window with a persistent profile in `.auth/` (git-ignored,
  never upload it). The window is a normal browser, without automation flags.
- The first time, `npm run session:funded` / `session:empty` opens it on the login page and waits
  for a person to log in (tick *Recordar*). After that Betsson logs the profile back in by itself.
- Tests attach to that window over CDP (ports 9301/9302) and work in a new tab: when a test sets
  `account`, the `page` fixture is that tab. A closed window is reopened automatically; a manual
  login is only requested again if Betsson forgets it.
- Only **one account window is open at a time**: with both accounts logged in from the same
  device, Betsson logs one out. Betsson also allows one session per account, so do not run the
  scenarios from two machines at once with the same accounts.

## Game session (DGOJ)

In Spain a regulated *sesión de juego* with time and loss limits must be opened before Real Play
(Orden HAP/1370/2014, art. 14). `GamePage.open()` passes it whenever it shows up
(`src/pages/game-session-gate.ts`): the "El juego no se inicia" screen, the "Hace menos de 60 mins…"
notice and the limits form, set from `gameSession` in the market config (15 min, 2,00 €). With no
balance the form has no loss limit field and only the time is set. The optional self-exclusion
(irreversible) is never touched and is checked to be on *Sin exclusión* before submitting. What
the form showed is attached to the report as *Game session (DGOJ)*.

## Running

```bash
npm run test:unit      # domain logic and OCR on fixtures, no browser
npm run test:es        # run both scenarios on betsson.es in the hand-logged-in windows
npm run report         # open the Playwright HTML report
```

After a scenario run, `check-matrix/index.html` shows every check (rows) per market (columns) as
pass / fail / not run, with the compared values. The Playwright report holds the evidence: game
frames per spin phase, reel-motion diffs, the exact OCR inputs and text, traces and videos.

## GitHub Actions

Workflow: `.github/workflows/game-validation.yml`.

| Job | When | What |
|---|---|---|
| Unit and vision tests | every push and pull request | typecheck + `--project=unit` (no account, no browser) |
| Scenarios · *market* | manual (*Actions → Game validation → Run workflow*) | both scenarios, one matrix job per market |
| Publish report | after the scenarios | merges all markets into one report and writes the check matrix to the job summary |

The scenarios are manual on purpose: each run spends the minimum bet. They run on the team laptop
(self-hosted runner) because they need its hand-logged-in browser windows.

**Report artifact** `game-validation-report`: `index.html` is the check matrix,
`playwright-report/` the full evidence. The matrix also appears on the run's summary page.

### Repository secrets (*Settings → Secrets and variables → Actions → Secrets*)

No account credentials. Optionally `BETSSON_ES_PROXY_SERVER` (same with `COM` / `PE`).

### Repository variables (optional, same page → *Variables*)

| Variable | Effect |
|---|---|
| `E2E_RUNNER` | Runner label for the scenarios. Default `self-hosted` (the team laptop with the logged-in windows) |
| `E2E_ON_PUSH` | `true` also runs the scenarios on every push to `main` |
| `PUBLISH_PAGES` | `true` also publishes the report to GitHub Pages (enable Pages with source *GitHub Actions* first) |

A self-hosted runner is registered from *Settings → Actions → Runners → New self-hosted runner*.
Run it interactively (`run.cmd`, not as a Windows service) so it can reach the browser windows,
and open them once with `npm run session:funded` / `session:empty` before the first run.
