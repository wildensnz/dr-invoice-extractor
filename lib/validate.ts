import type { Invoice } from '@/lib/schema';
import { round2 } from '@/lib/format';

export type CheckStatus = 'ok' | 'warning';

export interface Check {
  /** Dot path into the invoice: `issuer.rnc`, `items[2].total`, `itbis`. */
  field: string;
  status: CheckStatus;
  message: string;
}

export interface ValidateOptions {
  /** Money tolerance for arithmetic rules, in invoice currency. */
  tolerance?: number;
  /** ITBIS rate. */
  itbisRate?: number;
  /** "Today", for the future-date rule. Defaults to the current date. */
  now?: Date;
}

export const ITBIS_RATE = 0.18;
export const MONEY_TOLERANCE = 1;

/** Comprobante types (DGII). Shared by the classic `B` series and e-CF. */
export const NCF_TYPES: Record<string, string> = {
  '01': 'Crédito fiscal',
  '02': 'Consumo',
  '03': 'Nota de débito',
  '04': 'Nota de crédito',
  '11': 'Compras',
  '12': 'Registro único de ingresos',
  '13': 'Gastos menores',
  '14': 'Regímenes especiales',
  '15': 'Gubernamental',
  '16': 'Exportaciones',
  '17': 'Pagos al exterior',
  '31': 'Crédito fiscal electrónico',
  '32': 'Consumo electrónico',
  '33': 'Nota de débito electrónica',
  '34': 'Nota de crédito electrónica',
  '41': 'Compras electrónico',
  '43': 'Gastos menores electrónico',
  '44': 'Regímenes especiales electrónico',
  '45': 'Gubernamental electrónico',
  '46': 'Exportaciones electrónico',
  '47': 'Pagos al exterior electrónico',
};

export interface ParsedNcf {
  kind: 'classic' | 'ecf';
  series: string;
  type: string;
  sequence: string;
}

/** `B0100000123` → classic B series; `E310000000001` → e-CF. Null if malformed. */
export function parseNcf(ncf: string): ParsedNcf | null {
  // `E` is reserved for e-CF, which always has 13 characters.
  const classic = /^([A-DF-Z])(\d{2})(\d{8})$/.exec(ncf);
  if (classic) {
    return {
      kind: 'classic',
      series: classic[1],
      type: classic[2],
      sequence: classic[3],
    };
  }
  const ecf = /^(E)(\d{2})(\d{10})$/.exec(ncf);
  if (ecf) {
    return { kind: 'ecf', series: ecf[1], type: ecf[2], sequence: ecf[3] };
  }
  return null;
}

/**
 * DGII check digit for a 9-digit RNC: weights 7 9 8 6 5 4 3 2 over the first
 * eight digits, remainder mod 11 → 0 ⇒ 2, 1 ⇒ 1, otherwise 11 − remainder.
 */
export function rncCheckDigit(firstEight: string): number {
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(firstEight[i]), 0);
  const rem = sum % 11;
  if (rem === 0) return 2;
  if (rem === 1) return 1;
  return 11 - rem;
}

export function isValidRnc(value: string): boolean {
  return (
    /^\d{9}$/.test(value) &&
    rncCheckDigit(value.slice(0, 8)) === Number(value[8])
  );
}

/** Cédula: 11 digits. The checksum is intentionally not enforced. */
export function isValidCedula(value: string): boolean {
  return /^\d{11}$/.test(value);
}

function checkTaxId(field: string, value: string, label: string): Check {
  if (/^\d{9}$/.test(value)) {
    return isValidRnc(value)
      ? { field, status: 'ok', message: `${label} RNC has a valid check digit` }
      : {
          field,
          status: 'warning',
          message: `${label} RNC ${value} fails the DGII check digit; a digit may be misread`,
        };
  }
  if (isValidCedula(value)) {
    return { field, status: 'ok', message: `${label} cédula has 11 digits` };
  }
  return {
    field,
    status: 'warning',
    message: `${label} tax id must be a 9-digit RNC or an 11-digit cédula (got "${value}")`,
  };
}

function checkDate(value: string, now: Date): Check {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const field = 'date';
  if (!match) {
    return {
      field,
      status: 'warning',
      message: `Date must be YYYY-MM-DD (got "${value}")`,
    };
  }
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  if (!real) {
    return {
      field,
      status: 'warning',
      message: `${value} is not a real calendar date`,
    };
  }
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today) {
    return { field, status: 'warning', message: `${value} is in the future` };
  }
  return { field, status: 'ok', message: 'Valid date' };
}

function near(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance + 1e-9;
}

/**
 * ITBIS base: taxable line totals, minus the share of the discount that
 * falls on them (discount is assumed to apply proportionally to all lines).
 */
export function taxableBase(invoice: Invoice): number {
  const taxable = invoice.items
    .filter((item) => !item.exempt)
    .reduce((acc, item) => acc + item.total, 0);
  const discount = invoice.discount ?? 0;
  if (discount === 0 || invoice.subtotal === 0) return round2(taxable);
  return round2(taxable - discount * (taxable / invoice.subtotal));
}

/**
 * Applies the Dominican business rules and returns one check per rule.
 * Never mutates or corrects the invoice: warnings are for a human to resolve.
 */
export function validateInvoice(
  invoice: Invoice,
  options: ValidateOptions = {},
): Check[] {
  const tolerance = options.tolerance ?? MONEY_TOLERANCE;
  const rate = options.itbisRate ?? ITBIS_RATE;
  const now = options.now ?? new Date();
  const checks: Check[] = [];

  checks.push(checkTaxId('issuer.rnc', invoice.issuer.rnc, 'Issuer'));

  const ncf = parseNcf(invoice.ncf);
  if (!ncf) {
    checks.push({
      field: 'ncf',
      status: 'warning',
      message: `NCF must be a letter + 10 digits (B0100000123) or E + 12 digits (got "${invoice.ncf}")`,
    });
  } else if (!(ncf.type in NCF_TYPES)) {
    checks.push({
      field: 'ncf',
      status: 'warning',
      message: `Unknown comprobante type ${ncf.series}${ncf.type}`,
    });
  } else if (ncf.kind === 'classic' && ncf.series !== 'B') {
    checks.push({
      field: 'ncf',
      status: 'warning',
      message: `Series ${ncf.series} is not in use; current NCFs start with B or E`,
    });
  } else {
    checks.push({
      field: 'ncf',
      status: 'ok',
      message: `${NCF_TYPES[ncf.type]} (${ncf.series}${ncf.type})`,
    });
  }

  const creditFiscal = ncf?.type === '01' || ncf?.type === '31';
  if (invoice.customer?.rnc !== undefined) {
    checks.push(checkTaxId('customer.rnc', invoice.customer.rnc, 'Customer'));
  } else if (creditFiscal) {
    checks.push({
      field: 'customer.rnc',
      status: 'warning',
      message: 'Crédito fiscal invoices must print the customer RNC',
    });
  }

  checks.push(checkDate(invoice.date, now));

  invoice.items.forEach((item, i) => {
    const expected = round2(item.quantity * item.unitPrice);
    checks.push(
      near(expected, item.total, tolerance)
        ? {
            field: `items[${i}].total`,
            status: 'ok',
            message: 'quantity × unit price matches',
          }
        : {
            field: `items[${i}].total`,
            status: 'warning',
            message: `${item.quantity} × ${item.unitPrice} = ${expected}, but line total is ${item.total}`,
          },
    );
  });

  const linesSum = round2(
    invoice.items.reduce((acc, item) => acc + item.total, 0),
  );
  checks.push(
    near(linesSum, invoice.subtotal, tolerance)
      ? { field: 'subtotal', status: 'ok', message: 'Line totals add up' }
      : {
          field: 'subtotal',
          status: 'warning',
          message: `Line totals add up to ${linesSum}, not ${invoice.subtotal}`,
        },
  );

  const discount = invoice.discount ?? 0;
  if (invoice.discount !== undefined) {
    checks.push(
      discount <= invoice.subtotal + tolerance
        ? {
            field: 'discount',
            status: 'ok',
            message: 'Discount within subtotal',
          }
        : {
            field: 'discount',
            status: 'warning',
            message: `Discount ${discount} exceeds subtotal ${invoice.subtotal}`,
          },
    );
  }

  const base = taxableBase(invoice);
  const expectedItbis = round2(base * rate);
  checks.push(
    near(expectedItbis, invoice.itbis, tolerance)
      ? {
          field: 'itbis',
          status: 'ok',
          message: `${rate * 100}% of taxable base ${base}`,
        }
      : {
          field: 'itbis',
          status: 'warning',
          message: `${rate * 100}% of taxable base ${base} is ${expectedItbis}, not ${invoice.itbis}`,
        },
  );

  const expectedTotal = round2(invoice.subtotal - discount + invoice.itbis);
  checks.push(
    near(expectedTotal, invoice.total, tolerance)
      ? {
          field: 'total',
          status: 'ok',
          message: 'subtotal − discount + ITBIS matches',
        }
      : {
          field: 'total',
          status: 'warning',
          message: `subtotal − discount + ITBIS = ${expectedTotal}, not ${invoice.total}`,
        },
  );

  return checks;
}

export function hasWarnings(checks: Check[]): boolean {
  return checks.some((check) => check.status === 'warning');
}
