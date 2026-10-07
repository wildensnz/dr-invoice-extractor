/**
 * Recalculations used by the review form when the human edits a line.
 * These are deliberate user actions, not the validator correcting values.
 */
import { round2 } from '@/lib/format';
import type { Invoice, LineItem } from '@/lib/schema';
import { ITBIS_RATE, taxableBase } from '@/lib/validate';

export function recalculateLine(item: LineItem): LineItem {
  return { ...item, total: round2(item.quantity * item.unitPrice) };
}

/** Subtotal from the lines, ITBIS from the taxable base, total from both. */
export function recalculateTotals(invoice: Invoice): Invoice {
  const subtotal = round2(
    invoice.items.reduce((acc, item) => acc + item.total, 0),
  );
  const withSubtotal = { ...invoice, subtotal };
  const itbis = round2(taxableBase(withSubtotal) * ITBIS_RATE);
  const total = round2(subtotal - (invoice.discount ?? 0) + itbis);
  return { ...withSubtotal, itbis, total };
}

export function emptyLine(): LineItem {
  return {
    description: '',
    quantity: 1,
    unitPrice: 0,
    total: 0,
    exempt: false,
  };
}
