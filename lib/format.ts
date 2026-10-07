const pesos = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats an amount as Dominican pesos: `RD$ 1,248.50`. */
export function formatMoney(amount: number, currency = 'DOP'): string {
  const prefix = currency === 'DOP' ? 'RD$' : currency;
  const sign = amount < 0 ? '-' : '';
  return `${sign}${prefix} ${pesos.format(Math.abs(amount))}`;
}

/** Rounds to 2 decimals without floating-point noise (0.1 + 0.2 → 0.3). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
