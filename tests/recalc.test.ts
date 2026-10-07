import { describe, expect, it } from 'vitest';
import { emptyLine, recalculateLine, recalculateTotals } from '@/lib/recalc';
import type { Invoice } from '@/lib/schema';
import { hasWarnings, validateInvoice } from '@/lib/validate';

const invoice: Invoice = {
  issuer: { name: 'X', rnc: '101001577' },
  ncf: 'B0200000001',
  date: '2026-01-01',
  currency: 'DOP',
  items: [
    {
      description: 'A',
      quantity: 3,
      unitPrice: 100,
      total: 300,
      exempt: false,
    },
    { description: 'B', quantity: 2, unitPrice: 50, total: 100, exempt: true },
  ],
  subtotal: 400,
  itbis: 54,
  total: 454,
};

describe('recalculateLine', () => {
  it('sets total = quantity × unit price, rounded', () => {
    expect(
      recalculateLine({ ...emptyLine(), quantity: 1.5, unitPrice: 33.33 })
        .total,
    ).toBe(50);
  });
});

describe('recalculateTotals', () => {
  it('derives subtotal, ITBIS on taxable lines only, and total', () => {
    const edited = {
      ...invoice,
      items: [
        recalculateLine({ ...invoice.items[0], quantity: 4 }), // 400 taxable
        invoice.items[1],
      ],
    };
    const result = recalculateTotals(edited);
    expect(result.subtotal).toBe(500);
    expect(result.itbis).toBe(72);
    expect(result.total).toBe(572);
    expect(hasWarnings(validateInvoice(result))).toBe(false);
  });

  it('keeps the discount and prorates it', () => {
    const result = recalculateTotals({ ...invoice, discount: 40 });
    // taxable 300 − 40 × 300/400 = 270 → itbis 48.6; total 400 − 40 + 48.6
    expect(result.itbis).toBe(48.6);
    expect(result.total).toBe(408.6);
  });

  it('handles an invoice with no lines', () => {
    const result = recalculateTotals({ ...invoice, items: [] });
    expect(result).toMatchObject({ subtotal: 0, itbis: 0, total: 0 });
  });
});
