# Hakatsuki — Intelligent Game Validation

Malackathon 2026 · Betsson Group challenge.

Visual end-to-end checks for Pragmatic Play games inside the Betsson casino. The game runs in a
cross-origin iframe rendered on a canvas, so the checker validates **what the player sees**:
OCR on the game HUD, motion detection on the reels and template matching on controls, instead of
relying on the game's DOM.

## Market

> **Mercado único betsson.es por indicación del organizador (15/10).**

The organizer replaced betsson.com and betsson.pe with **betsson.es** only: Spanish UI, EUR,
amounts formatted as `1.234,56 €`. The market abstraction is kept (`config/markets/betsson-es.json`,
`MARKETS=betsson-es`), so another market is one config file away.

| Scenario | betsson.es (ES · EUR) |
|---|---|
| 1. Completed Real Play spin — `balance_after = balance_before − wager + payout` | planned |
| 2. Insufficient balance — Spanish message, balances unchanged | planned |

## Project layout

```
config/markets/     one JSON per market (URL, language, currency, localized keywords)
config/games/       calibrated screen regions per game
assets/templates/   reference crops for template matching
src/config/         config loading and validation, credentials from env
src/domain/         money parsing, balance rule, fuzzy text matching (pure, unit-tested)
src/pages/          Betsson page objects (DOM)
src/game/           Pragmatic game screen object (canvas, vision only)
src/vision/         OCR, preprocessing, motion and template detection
src/evidence/       attachments and masking of personal data
src/reporting/      pass/fail matrix per scenario, market and check
tests/unit/         fast tests without a browser
tests/e2e/          scenarios, run once per market project
```

## Setup

```bash
npm ci
npx playwright install --with-deps chromium
cp .env.example .env   # fill in the test accounts locally
```

Credentials are read only from environment variables (`.env` locally, repository secrets in CI).
They are never committed, and login runs without tracing so they never appear in reports.

## Running

```bash
npm run test:unit      # domain logic, no browser
npm run test:es        # all scenarios on betsson.es
npm run report         # open the HTML report
```
