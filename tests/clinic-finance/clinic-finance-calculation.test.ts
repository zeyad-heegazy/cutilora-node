import { describe, expect, it } from 'vitest';
import { calculateInvoiceLines } from '../../src/modules/clinic-finance/clinic-finance.service.js';

describe('clinic invoice calculations', () => {
  it('calculates discounts and tax using integer minor currency units', () => {
    const result = calculateInvoiceLines([
      { description: 'Treatment', quantity: 2, unitPriceMinor: 10001, discountBps: 1000, taxBps: 1400 },
    ]);
    expect(result.lines[0]).toMatchObject({
      subtotalMinor: 20002,
      discountMinor: 2000,
      taxMinor: 2520,
      totalMinor: 20522,
    });
    expect(result.totals).toEqual({ subtotalMinor: 20002, discountMinor: 2000, taxMinor: 2520, totalMinor: 20522 });
  });

  it('rejects line totals outside safe integer precision', () => {
    expect(() => calculateInvoiceLines([
      { description: 'Overflow', quantity: 10000, unitPriceMinor: Number.MAX_SAFE_INTEGER, discountBps: 0, taxBps: 0 },
    ])).toThrow();
  });

  it('supports zero-price lines without introducing floating-point amounts', () => {
    const result = calculateInvoiceLines([
      { description: 'Included service', quantity: 1, unitPriceMinor: 0, discountBps: 0, taxBps: 0 },
    ]);
    expect(result.totals.totalMinor).toBe(0);
  });
});
