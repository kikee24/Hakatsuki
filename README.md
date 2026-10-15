# Hakatsuki — Intelligent Game Validation

Malackathon 2026 · Betsson Group challenge.

End-to-end validation of a **Pragmatic Play** slot in **Real Play** inside the Betsson casino,
done **the way a player does it**: the game is a canvas inside a cross-origin iframe, so every
in-game fact comes from what is on screen (OCR of the HUD, motion of the reels, template matching
of the buttons), never from the game's DOM. "A click on Spin proves nothing."

> **Single market: betsson.es, as instructed by the organizer (15 Oct).**
> *Mercado único betsson.es por indicación del organizador (15/10).* The configs for betsson.com and
> betsson.pe are kept only to show per-market configuration; they are not run.

---

## Notes for the grader — how to run it

Everything below is done once, in this order. Total time: about 10 minutes, most of it waiting.

### 0. What you need

- **Windows 10/11** with **Google Chrome or Microsoft Edge** installed (Edge ships with Windows).
- **Node.js 20 or newer** (`node --version`).
- An internet connection **from Spain** (betsson.es is geo-restricted).
- The two **test accounts** of the challenge: one *with balance* and one *without balance*.
  Their credentials are **not** in this repository and are never typed by the code (see decision 2).
- Nobody else using those two accounts while you run the tests (Betsson allows one session per
  account: a login elsewhere logs us out).

### 1. Install

```bash
npm ci
npx playwright install ffmpeg
```

`ffmpeg` is only used to record the videos shown in the dashboard. No browser download is needed:
the installed Chrome/Edge is used.

### 2. Log in to each account by hand — one at a time

```bash
npm run session:funded
```

A normal Chrome/Edge window opens on the Betsson login page and the console prints
`>>> La sesión FUNDED no está iniciada. Inicia sesión A MANO…` ("not logged in, log in by hand").
**Log in yourself with the account WITH balance**, keep **"Recordar"** ticked, and wait for
`>>> Sesión FUNDED lista.` ("session ready"; you have 10 minutes). If the window is already logged
in, it goes straight to "lista". Then:

```bash
npm run session:empty
```

Same with the account **WITHOUT balance**. The first window is closed automatically: only one account
window may be open at a time (decision 3).

This is needed only the first time on a machine. Each account keeps its own browser profile in
`.auth/` (git-ignored), and Betsson's "Recordar" logs it back in when the window is reopened.

### 3. Run the tests

```bash
npm test
```

This runs, in one go:

1. **Unit and vision tests** (~1 min): money parsing, balance rules, OCR on real screenshots of the
   games, spin state machine, auto-calibration, dashboard model. No browser, no account.
2. **Scenario 2 — insufficient balance** with the account without balance.
3. **Lobby smoke test** (anonymous).
4. **Scenario 1 — completed Real Play spin** with the funded account.
   ⚠️ **This places one real bet at the minimum stake** (0,25 € on Wolf Gold).

Each scenario opens its account's window by itself (closing the other one), opens Wolf Gold, passes
the regulated game-session screens, and plays like a player. Expect ~4–6 minutes for the scenarios.
**Please do not close the browser windows or stop the run**: if something waits too long, the
watchers give up on their own (at most 90 s per spin) and the report is still written.

### 4. Open the results dashboard

```bash
npm run report
```

It opens `dashboard/index.html`: every check of both scenarios as PASS / FAIL with what it verifies,
the values it compared (e.g. `98,55 € − 0,25 € + 0,05 € = 98,35 €; seen 98,35 €`) and the
screenshots, key frames and video that back it, plus all the unit tests. See
[Results dashboard](#results-dashboard).

The dashboard and its evidence stay on your machine (`dashboard/` is gitignored): they show the real
accounts' screens, so no run is committed to the repository. Run the tests first; until then
`npm run report` has nothing to show.

### If something goes wrong

| Symptom | Cause and fix |
|---|---|
| The console asks to log in again during a run | Betsson forgot the session (or someone else logged in with the account). Log in in the window that opened; the run waits 2 min. Or stop, run `npm run session:funded` / `session:empty`, and start again. |
| The game shows *"El juego no se inicia"* or a limits form | Expected: that is the regulated game session (decision 4). The test fills it in by itself. |
| `Neither Chrome nor Edge found` | Set `BROWSER_EXECUTABLE` in `.env` (copy `.env.example`) to a Chromium-based browser. |
| Scenario 1 fails with *"bet went up"* | A safety stop: the "−" press raised the bet, so it refused to spin. |
| A run shows "not run" for one scenario | That scenario was not part of the run (e.g. a single spec was launched). |

---

## What is validated

| Scenario | Account | Checks |
|---|---|---|
| **1. Completed Real Play spin** (`tests/e2e/spin-completed.spec.ts`) | with balance | S1-01 Betsson balance in EUR · S1-02 Real Play · S1-03 provider is Pragmatic Play · S1-04 in-game credit and wager in EUR · S1-05 in-game credit = Betsson balance · S1-06 spin visibly started (≥ 2 independent signals) · S1-07 displayed wager = amount charged · S1-08 spin finished and settled on screen · S1-09 in-game credit after = before − wager + payout · S1-10 Betsson balance after = before − wager + payout · S1-11 Betsson balance after = in-game credit after |
| **2. Insufficient balance** (`tests/e2e/insufficient-balance.spec.ts`) | without balance | S2-01 Betsson balance in EUR · S2-02 Real Play with Pragmatic Play · S2-03 credit and wager in EUR · S2-04 spin rejected (no wager taken, no spin shown) · S2-05 insufficient-balance message shown · S2-06 message in Spanish · S2-07 in-game credit unchanged · S2-08 Betsson balance unchanged |

Every check is its own report step with the values compared, using soft assertions so one failure
never hides the others. A check that could not run is shown as "not run", never silently dropped.

---

## Critical design decisions

1. **Only betsson.es.** The organizer replaced betsson.com and betsson.pe with betsson.es on 15 Oct.
   Everything market-specific (URL, language, currency and number format, keywords, regulated
   limits) still lives in `config/markets/<market>.json`, and the CI workflow runs one job per
   market, so a market is one config file.

2. **No automated login, no credentials anywhere.** Betsson's bot protection (AWS WAF + Group-IB)
   silently rejects a login typed by an automated browser, and the session it grants cannot be
   copied to another browser (it lives in localStorage and session-only cookies, tied to the
   device). The organizer's advice was to reuse a hand-made session. So a person logs in once per
   account in a normal browser window (no automation flags) and the tests **attach to that window
   over CDP** (ports 9301 / 9302) and work in a new tab (`src/session/`). There are no credentials in
   the code, `.env`, CI secrets or reports.

3. **One account window at a time.** With both accounts logged in from the same device, Betsson logs
   one of them out. Before using an account, the other account's window is closed; it is reopened
   (and logged back in by "Recordar") when needed.

4. **The regulated game session (DGOJ) is passed like a player would.** In Spain a *sesión de juego*
   with time and loss limits must be opened before Real Play (Orden HAP/1370/2014, art. 14). The
   test fills the limits form with small limits from the market config (15 min, 2,00 €; time only
   when there is no balance) and **never touches the irreversible self-exclusion option**, which is
   checked to be on *Sin exclusión* before submitting (`src/pages/game-session-gate.ts`).

5. **Vision only inside the game; DOM only for Betsson's own pages.** In-game values come from OCR
   (Tesseract) of the HUD (CRÉDITO, APUESTA, GANANCIA, status line), reel motion from pixel diffs, and
   buttons from template matching. Betsson's balance comes from its own page (DOM), which is exactly
   what the rule has to be cross-checked against. Network traffic is never used to decide pass/fail.

6. **"Started" and "finished" need on-screen evidence, not a click.** A spin *started* when at least
   two of these are seen: the credit dropped by exactly the wager, "¡BUENA SUERTE!", reels moving in
   consecutive frames. It *finished* when the status line shows a win or goes back to "¡HAGA SU
   APUESTA!" (or the reels stay still), and *settled* when the credit stops changing — confirmed once
   more 4 s later, because a bonus screen or a cascading win can still change the result. The game's
   previous win left on screen is not taken for this spin's. Free-spin bonuses are played through
   by pressing their "pulse en cualquier parte" screens (`src/game/spin-tracker.ts`,
   `src/game/spin-watcher.ts`).

7. **Controls are found on screen (auto-calibration), with safety thresholds.** When the game opens,
   the round "circular arrows" button of Pragmatic Play is found by template matching (continue on
   the intro, spin in the game) and the CRÉDITO / APUESTA labels by OCR; from them the money block,
   status line and "−" bet button follow (`src/game/calibration.ts`). The found regions are used only
   if the HUD then reads the same as with the configured ones. The intro "continue" is only pressed
   at a match score ≥ 0.85, which the in-game spin button never reaches, so the test can never spin
   by mistake. Lowering the bet stops before any spin if a press ever raises it.

8. **Money is exact.** Amounts are integer cents, parsed in the market format (`1.234,56 €`). An
   amount without two decimals is treated as an OCR misread (the game always shows them) and read
   again, so "0,15 €" can never become 15 €.

9. **Evidence without personal data.** The dashboard shows screenshots, key frames, OCR inputs and
   the video of the real tab; recording pauses while Betsson's balance menu (which shows the
   player's name) is open, and balance screenshots are cropped to the amount row. Traces of the
   real tab contain the session's cookies, so they are kept local only and never exported or
   published.

10. **Retries only for infrastructure, never for assertions.** Navigation and loading wait and retry;
    a check is evaluated once and reported as it is.

---

## How the checker sees the game

| Question | How it is answered | Code |
|---|---|---|
| Credit, bet and win? | OCR of the HUD regions, reading the amount right after each label; several image variants until one reads a valid amount | `src/game/hud.ts`, `src/vision/ocr.ts` |
| Where are the controls? | Template match of the round button + OCR of the labels, checked against a HUD reading | `src/game/calibration.ts`, `src/vision/icon-finder.ts` |
| Did the spin start? | ≥ 2 of: credit dropped by exactly the bet, "¡BUENA SUERTE!", reels moving | `src/game/spin-tracker.ts` |
| Did it finish? | Status line shows a new win, or is back to "¡HAGA SU APUESTA!" after the start, or reels still | `src/game/spin-tracker.ts` |
| Is the result final? | Credit identical in consecutive reads, no bonus running, and unchanged 4 s later | `src/game/spin-watcher.ts` |
| Did the reels move? | Pixel diff of the reel area; "still" is judged against the motion measured at rest (some games animate their symbols all the time) | `src/vision/motion.ts` |
| Bonus round? | "TIRADAS GRATIS RESTANTES" on the status line; "PULSE EN CUALQUIER PARTE…" screens are pressed | `src/game/hud.ts` |
| Insufficient funds? | OCR of the pop-up, fuzzy-matched against the market's keywords (and not another language's) | `src/game/hud-reader.ts` |

Thresholds were measured on real screenshots (`tests/fixtures/screens/`, including frames of a real
free-spins bonus and of Bubble Up).

---

## Games

Wolf Gold (classic 5×3 line slot, no cascades) is the default and the one validated end to end.
Run the scenarios on another configured game with:

```bash
npm run test:slot -- bubble-up
```

(Extra Playwright arguments go after the game id, e.g. `npm run test:slot -- bubble-up tests/e2e/insufficient-balance.spec.ts`.)

A new Pragmatic Play game only needs `config/games/<game-id>.json` with `id`, `name`, `provider`
and `path` (its Betsson URL). Regions and captions it does not list come from
`config/games/_pragmatic-defaults.json`, and auto-calibration (decision 7) finds the controls on
screen. The frame with the regions drawn is attached to the report as *Auto-calibration*.

---

## Results dashboard

When a run ends, `dashboard/index.html` is written (`npm run report` opens it). For each scenario
and market it lists every check (`S1-01`…`S2-08`) as PASS / FAIL / not run, what it verifies and how,
and the values it saw, with the screenshots that back it. Each test also shows its video, its key
frames per spin phase (playable in order), the full screenshot gallery (Betsson balance, HUD and OCR
crops, pop-up, auto-calibration), the OCR text and JSON it read, and its steps. The unit tests are
listed by file at the end.

- The hand-logged-in tab is recorded with Playwright's screencast (needs `npx playwright install ffmpeg`;
  `RECORD_LIVE=0` turns it off). Recording pauses while the Betsson balance menu is open, because it
  shows the player's name, so a scenario has a video in parts.
- Traces are never copied into the dashboard (they hold the session's cookies); open them locally
  with `npm run report:playwright`.
- `npm run report -- results-export/<timestamp>` builds it from an exported run into
  `dashboard-export/`.
- Everything is local: `dashboard/`, `results-export/` and `dashboard-export/` are gitignored, and CI
  publishes the dashboard on GitHub Pages only if the repository variable `PUBLISH_PAGES` is `true`.

`check-matrix/index.html` still holds the bare check × market matrix, and `npm run report:playwright`
the full Playwright report.

---

## Other commands

| Command | What it does |
|---|---|
| `npm run test:unit` | Unit and vision tests only (own report in `playwright-report-unit/`, never replaces a scenario run's) |
| `npm run test:es` | Both scenarios and the lobby smoke test on betsson.es |
| `npm run test:slot -- <game>` | The same on another game |
| `npm run export:results` | Copies the last run (results, check matrix, every attachment as a file; traces left out) to `results-export/<timestamp>/` to share it |
| `npm run report:playwright` | Playwright's own HTML report, with traces |
| `npm run recon -- funded 60` | Opens the game in the logged-in window and records screenshots for 60 s without clicking in the game |
| `npm run typecheck` | TypeScript check |

---

## Project layout

```
config/markets/       one JSON per market (URL, language, currency, keywords, game-session limits)
config/games/         one JSON per game; _pragmatic-defaults.json for what a game does not list
assets/templates/     reference crops for template matching (Pragmatic's round button)
src/config/           config loading and validation
src/session/          hand-logged-in browser windows per account (decision 2)
src/pages/            Betsson page objects (DOM): balance menu, game page, game-session gate
src/game/             the game seen from outside: HUD reading, calibration, spin tracker and watcher
src/vision/           OCR, preprocessing, motion and template matching
src/domain/           money parsing, balance rules, fuzzy text matching (pure, unit-tested)
src/evidence/         report attachments, live tab recorder
src/reporting/        check catalog, check matrix and results dashboard
tests/unit/           fast tests without a browser (real screenshots in tests/fixtures/screens/)
tests/e2e/            the scenarios
tests/setup/          opens each account window and waits for a manual login if needed
tools/                dashboard, test-slot, export, recon
docs/                 dashboard guide, recon notes, reviewed sample run
```

---

## GitHub Actions

Workflow: `.github/workflows/game-validation.yml`.

| Job | When | What |
|---|---|---|
| Unit and vision tests | every push and pull request | typecheck + `--project=unit` (no account, no browser) |
| Scenarios · *market* | manual (*Actions → Game validation → Run workflow*) | both scenarios, one matrix job per market |
| Publish report | after the scenarios | merges the unit and market results into the dashboard, writes the check matrix to the job summary and keeps the dashboard as a run artifact (GitHub Pages only with `PUBLISH_PAGES=true`) |

The scenarios are manual on purpose: each run spends the minimum bet. They run on the team laptop
(self-hosted runner) because they need its hand-logged-in browser windows.

**Dashboard in CI**: each scenario run keeps the dashboard as the private run artifact
`game-validation-report`: `index.html` is the dashboard, `check-matrix/` the matrix and
`playwright-report/` the full Playwright report. It is not published by default, because it shows
the real accounts' screens. To deploy it to GitHub Pages as well, set `PUBLISH_PAGES=true` and
*Settings → Pages → Source: GitHub Actions* once (Pages on a private repository needs a paid plan).

**Secrets** (*Settings → Secrets and variables → Actions*): no account credentials. Optionally
`BETSSON_ES_PROXY_SERVER`.

**Variables** (same page → *Variables*, optional):

| Variable | Effect |
|---|---|
| `E2E_RUNNER` | Runner label for the scenarios. Default `self-hosted` (the team laptop with the logged-in windows) |
| `E2E_ON_PUSH` | `true` also runs the scenarios on every push to `main` |
| `PUBLISH_PAGES` | `true` also deploys the dashboard to GitHub Pages. Default: run artifact only |

A self-hosted runner is registered from *Settings → Actions → Runners → New self-hosted runner*.
Run it interactively (`run.cmd`, not as a Windows service) so it can reach the browser windows,
and open them once with `npm run session:funded` / `session:empty` before the first run.

---

## Known limitations

- Pragmatic Play games only: auto-calibration relies on their standard round button and HUD labels.
- Bubble Up (a 6×5 grid game) is supported but less proven than Wolf Gold: its large gold
  "GANANCIA" is sometimes misread by OCR.
- The reels, message and bonus-click areas still come from the game config.
- A login is needed by hand once per account and machine, and again whenever Betsson forgets it.
