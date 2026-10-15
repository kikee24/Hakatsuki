export interface CheckDefinition {
  id: string;
  title: string;
}

/**
 * Every check of every scenario, in report order. The specs verify these and the matrix lists them
 * all, so a check that never ran (e.g. the login was blocked) shows as "not run" instead of vanishing.
 */
export const SCENARIOS = {
  spinCompleted: {
    title: 'Scenario 1 — completed Real Play spin',
    checks: {
      betssonCurrency: { id: 'S1-01', title: 'Betsson balance is shown in the market currency' },
      realPlay: { id: 'S1-02', title: 'Game runs in Real Play' },
      provider: { id: 'S1-03', title: 'Game provider is Pragmatic Play' },
      gameCurrency: { id: 'S1-04', title: 'In-game credit and wager are shown in the market currency' },
      creditMatchesBetsson: { id: 'S1-05', title: 'In-game credit matches the Betsson balance before the spin' },
      spinStarted: { id: 'S1-06', title: 'Spin visibly started (at least two independent on-screen signals)' },
      wagerCharged: { id: 'S1-07', title: 'The displayed wager is the amount charged when the spin started' },
      spinSettled: { id: 'S1-08', title: 'Spin completed and its result settled on screen' },
      inGameRule: { id: 'S1-09', title: 'In-game credit: after = before − wager + payout' },
      betssonRule: { id: 'S1-10', title: 'Betsson balance: after = before − wager + payout' },
      betssonMatchesGame: { id: 'S1-11', title: 'Betsson balance after matches the in-game credit after' },
    },
  },
  insufficientBalance: {
    title: 'Scenario 2 — insufficient balance',
    checks: {
      betssonCurrency: { id: 'S2-01', title: 'Betsson balance is shown in the market currency' },
      realPlay: { id: 'S2-02', title: 'Game runs in Real Play with the Pragmatic Play provider' },
      gameCurrency: { id: 'S2-03', title: 'In-game credit and wager are shown in the market currency' },
      spinRejected: { id: 'S2-04', title: 'Spin is rejected: no wager taken and no spin in progress shown' },
      messageShown: { id: 'S2-05', title: 'Player sees an insufficient-balance message' },
      messageLanguage: { id: 'S2-06', title: 'Message is in the market language' },
      creditUnchanged: { id: 'S2-07', title: 'In-game credit did not change' },
      betssonUnchanged: { id: 'S2-08', title: 'Betsson balance did not change' },
    },
  },
} as const satisfies Record<string, { title: string; checks: Record<string, CheckDefinition> }>;

export const CATALOG: { scenario: string; checks: CheckDefinition[] }[] = Object.values(SCENARIOS).map((s) => ({
  scenario: s.title,
  checks: Object.values(s.checks),
}));
