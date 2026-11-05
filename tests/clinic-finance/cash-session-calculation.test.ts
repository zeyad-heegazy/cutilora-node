import { describe, expect, it } from 'vitest';
import { calculateCashSessionBalance } from '../../src/modules/clinic-finance/cash-session.service.js';

describe('cash session expected balance', () => {
  it('reconciles opening cash, collections, refunds, paid expenses and movements', () => {
    expect(calculateCashSessionBalance({
      openingBalanceMinor: 10000,
      collectedMinor: 8500,
      refundedMinor: 1000,
      cashExpensesMinor: 2500,
      movements: [
        { direction: 'in', amountMinor: 700 },
        { direction: 'out', amountMinor: 200 },
      ],
    })).toBe(15500);
  });

  it('does not use floating-point arithmetic for cash balances', () => {
    expect(calculateCashSessionBalance({
      openingBalanceMinor: 9000000000000000,
      collectedMinor: 10,
      refundedMinor: 0,
      cashExpensesMinor: 0,
      movements: [],
    })).toBe(9000000000000010);
  });

  it('rejects expected balances outside safe integer precision', () => {
    expect(() => calculateCashSessionBalance({
      openingBalanceMinor: Number.MAX_SAFE_INTEGER,
      collectedMinor: 1,
      refundedMinor: 0,
      cashExpensesMinor: 0,
      movements: [],
    })).toThrow();
  });
});
