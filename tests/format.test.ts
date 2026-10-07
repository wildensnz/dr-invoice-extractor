import { describe, expect, it } from 'vitest';
import { formatMoney, round2 } from '@/lib/format';

describe('formatMoney', () => {
  it('formats pesos with thousands separator and two decimals', () => {
    expect(formatMoney(1248.5)).toBe('RD$ 1,248.50');
    expect(formatMoney(0)).toBe('RD$ 0.00');
    expect(formatMoney(1000000)).toBe('RD$ 1,000,000.00');
  });

  it('keeps the sign in front of the currency', () => {
    expect(formatMoney(-15)).toBe('-RD$ 15.00');
  });

  it('uses the ISO code for other currencies', () => {
    expect(formatMoney(99.9, 'USD')).toBe('USD 99.90');
  });
});

describe('round2', () => {
  it('rounds to two decimals without float noise', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});
