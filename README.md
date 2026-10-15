# Hakatsuki — Intelligent Game Validation

Malackathon 2026 · Betsson Group challenge.

Visual end-to-end checks for Pragmatic Play games inside the Betsson casino. The game runs in a
cross-origin iframe rendered on a canvas, so the checker validates **what the player sees**:
OCR on the game HUD, motion detection on the reels and template matching on controls, instead of
relying on the game's DOM.

## Scenarios × markets

| Scenario | betsson.es (ES · EUR) | betsson.com (EN · EUR) | betsson.pe (ES · PEN) |
|---|---|---|---|
| 1. Completed Real Play spin — `balance_after = balance_before − wager + payout` | planned | config ready | config ready |
| 2. Insufficient balance — localized message, balances unchanged | planned | config ready | config ready |

The test accounts we were given are on **betsson.es**, so it is the default market. The other
markets are kept as configuration and can be enabled with `MARKETS=betsson-es,betsson-pe`.

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
