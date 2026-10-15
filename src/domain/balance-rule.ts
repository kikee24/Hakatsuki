export interface BalanceInputs {
  beforeCents: number;
  wagerCents: number;
  payoutCents: number;
  afterCents: number;
}

export interface BalanceCheck extends BalanceInputs {
  expectedAfterCents: number;
  differenceCents: number;
  ok: boolean;
}

/** balance_after = balance_before - wager + payout, compared exactly in cents. */
export function reconcileBalance(inputs: BalanceInputs): BalanceCheck {
  const expectedAfterCents = inputs.beforeCents - inputs.wagerCents + inputs.payoutCents;
  const differenceCents = inputs.afterCents - expectedAfterCents;
  return { ...inputs, expectedAfterCents, differenceCents, ok: differenceCents === 0 };
}
