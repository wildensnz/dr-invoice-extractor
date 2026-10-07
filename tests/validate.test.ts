import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/lib/schema';
import {
  hasWarnings,
  isValidRnc,
  parseNcf,
  rncCheckDigit,
  taxableBase,
  validateInvoice,
} from '@/lib/validate';

const NOW = new Date('2026-10-07T12:00:00Z');

/** A correct B01 invoice: two taxable lines, one exempt, no discount. */
function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    issuer: { name: 'Ferretería El Progreso SRL', rnc: '101001577' },
    customer: { name: 'Constructora Duarte SRL', rnc: '401007551' },
    ncf: 'B0100004521',
    date: '2026-03-14',
    currency: 'DOP',
    items: [
      {
        description: 'Cemento gris 42.5 kg',
        quantity: 10,
        unitPrice: 425,
        total: 4250,
        exempt: false,
      },
      {
        description: 'Varilla 3/8 x 20 pies',
        quantity: 4,
        unitPrice: 312.5,
        total: 1250,
        exempt: false,
      },
      {
        description: 'Arroz selecto 1 lb',
        quantity: 2,
        unitPrice: 50,
        total: 100,
        exempt: true,
      },
    ],
    subtotal: 5600,
    itbis: 990, // 18% of 5500
    total: 6590,
    ...overrides,
  };
}

function byField(invoice: Invoice, field: string) {
  const check = validateInvoice(invoice, { now: NOW }).find(
    (c) => c.field === field,
  );
  if (!check) throw new Error(`no check for ${field}`);
  return check;
}

describe('rncCheckDigit / isValidRnc', () => {
  it('matches the DGII algorithm on public RNCs', () => {
    // Claro Dominicana and Banreservas, both public.
    expect(rncCheckDigit('10100157')).toBe(7);
    expect(rncCheckDigit('40100755')).toBe(1);
    expect(isValidRnc('101001577')).toBe(true);
    expect(isValidRnc('401007551')).toBe(true);
  });

  it('rejects a single misread digit', () => {
    expect(isValidRnc('101001578')).toBe(false);
    expect(isValidRnc('107001577')).toBe(false);
  });

  it('rejects wrong lengths', () => {
    expect(isValidRnc('10100157')).toBe(false);
    expect(isValidRnc('1010015777')).toBe(false);
  });
});

describe('parseNcf', () => {
  it('parses classic B series', () => {
    expect(parseNcf('B0100000123')).toEqual({
      kind: 'classic',
      series: 'B',
      type: '01',
      sequence: '00000123',
    });
  });

  it('parses e-CF', () => {
    expect(parseNcf('E310000000001')).toEqual({
      kind: 'ecf',
      series: 'E',
      type: '31',
      sequence: '0000000001',
    });
  });

  it('rejects malformed values', () => {
    expect(parseNcf('B01-00000123')).toBeNull();
    expect(parseNcf('B010000012')).toBeNull();
    expect(parseNcf('E3100000001')).toBeNull(); // 10 digits after E
    expect(parseNcf('b0100000123')).toBeNull();
  });
});

describe('validateInvoice on a correct invoice', () => {
  it('returns no warnings and one check per rule', () => {
    const checks = validateInvoice(baseInvoice(), { now: NOW });
    expect(hasWarnings(checks)).toBe(false);
    expect(checks.map((c) => c.field)).toEqual([
      'issuer.rnc',
      'ncf',
      'customer.rnc',
      'date',
      'items[0].total',
      'items[1].total',
      'items[2].total',
      'subtotal',
      'itbis',
      'total',
    ]);
  });

  it('describes the comprobante type', () => {
    expect(byField(baseInvoice(), 'ncf').message).toBe('Crédito fiscal (B01)');
    expect(byField(baseInvoice({ ncf: 'E320000000042' }), 'ncf').message).toBe(
      'Consumo electrónico (E32)',
    );
  });
});

describe('tax id rules', () => {
  it('flags an RNC with a wrong check digit', () => {
    const check = byField(
      baseInvoice({ issuer: { name: 'X', rnc: '101001578' } }),
      'issuer.rnc',
    );
    expect(check.status).toBe('warning');
    expect(check.message).toMatch(/check digit/);
  });

  it('accepts an 11-digit cédula', () => {
    const check = byField(
      baseInvoice({ customer: { name: 'Juan Pérez', rnc: '00112345678' } }),
      'customer.rnc',
    );
    expect(check.status).toBe('ok');
  });

  it('flags other lengths', () => {
    const check = byField(
      baseInvoice({ issuer: { name: 'X', rnc: '12345' } }),
      'issuer.rnc',
    );
    expect(check.status).toBe('warning');
  });

  it('requires a customer RNC on crédito fiscal invoices only', () => {
    const b01 = byField(
      baseInvoice({ customer: { name: 'Sin RNC' } }),
      'customer.rnc',
    );
    expect(b01.status).toBe('warning');

    const b02 = validateInvoice(
      baseInvoice({ ncf: 'B0200000001', customer: undefined }),
      { now: NOW },
    );
    expect(b02.find((c) => c.field === 'customer.rnc')).toBeUndefined();
    expect(hasWarnings(b02)).toBe(false);
  });
});

describe('ncf rules', () => {
  it('flags malformed NCFs', () => {
    expect(byField(baseInvoice({ ncf: 'B01-0000452' }), 'ncf').status).toBe(
      'warning',
    );
  });

  it('flags unknown comprobante types', () => {
    const check = byField(baseInvoice({ ncf: 'B0900000001' }), 'ncf');
    expect(check.status).toBe('warning');
    expect(check.message).toMatch(/Unknown comprobante type B09/);
  });

  it('flags retired series letters', () => {
    expect(byField(baseInvoice({ ncf: 'A0100000001' }), 'ncf').status).toBe(
      'warning',
    );
  });

  it('accepts B02, B14, B15 and e-CF types', () => {
    for (const ncf of [
      'B0200000001',
      'B1400000001',
      'B1500000001',
      'E310000000001',
      'E320000000001',
      'E440000000001',
    ]) {
      expect(byField(baseInvoice({ ncf }), 'ncf').status).toBe('ok');
    }
  });
});

describe('date rule', () => {
  it('flags impossible and future dates', () => {
    expect(byField(baseInvoice({ date: '2026-02-30' }), 'date').status).toBe(
      'warning',
    );
    expect(byField(baseInvoice({ date: '2027-01-01' }), 'date').status).toBe(
      'warning',
    );
  });

  it('accepts today', () => {
    expect(byField(baseInvoice({ date: '2026-10-07' }), 'date').status).toBe(
      'ok',
    );
  });

  it('flags non-ISO strings', () => {
    expect(byField(baseInvoice({ date: '14/03/2026' }), 'date').status).toBe(
      'warning',
    );
  });
});

describe('arithmetic rules', () => {
  it('flags a line whose total is not quantity × unit price', () => {
    const invoice = baseInvoice();
    invoice.items[1] = { ...invoice.items[1], total: 1300 };
    const check = byField(invoice, 'items[1].total');
    expect(check.status).toBe('warning');
    expect(check.message).toBe('4 × 312.5 = 1250, but line total is 1300');
  });

  it('flags a subtotal that does not match the lines', () => {
    expect(byField(baseInvoice({ subtotal: 5700 }), 'subtotal').status).toBe(
      'warning',
    );
  });

  it('tolerates RD$1 of rounding', () => {
    expect(byField(baseInvoice({ subtotal: 5601 }), 'subtotal').status).toBe(
      'ok',
    );
    expect(byField(baseInvoice({ itbis: 990.9 }), 'itbis').status).toBe('ok');
  });

  it('computes ITBIS on taxable lines only', () => {
    expect(taxableBase(baseInvoice())).toBe(5500);
    const check = byField(baseInvoice({ itbis: 1008 }), 'itbis'); // 18% of 5600
    expect(check.status).toBe('warning');
    expect(check.message).toBe('18% of taxable base 5500 is 990, not 1008');
  });

  it('accepts a fully exempt invoice with zero ITBIS', () => {
    const invoice = baseInvoice({
      ncf: 'B0200000001',
      customer: undefined,
      items: [
        {
          description: 'Leche entera 1 L',
          quantity: 3,
          unitPrice: 75,
          total: 225,
          exempt: true,
        },
      ],
      subtotal: 225,
      itbis: 0,
      total: 225,
    });
    expect(hasWarnings(validateInvoice(invoice, { now: NOW }))).toBe(false);
  });

  it('allocates the discount proportionally to the taxable base', () => {
    // 10% discount on 5600 = 560; taxable share = 560 × 5500/5600 = 550.
    const invoice = baseInvoice({
      discount: 560,
      itbis: 891, // 18% of 4950
      total: 5931, // 5600 − 560 + 891
    });
    expect(taxableBase(invoice)).toBe(4950);
    const checks = validateInvoice(invoice, { now: NOW });
    expect(hasWarnings(checks)).toBe(false);
    expect(checks.find((c) => c.field === 'discount')?.status).toBe('ok');
  });

  it('flags a discount larger than the subtotal', () => {
    expect(byField(baseInvoice({ discount: 9000 }), 'discount').status).toBe(
      'warning',
    );
  });

  it('flags a total that does not match subtotal − discount + ITBIS', () => {
    const check = byField(baseInvoice({ total: 6600 }), 'total');
    expect(check.status).toBe('warning');
    expect(check.message).toBe('subtotal − discount + ITBIS = 6590, not 6600');
  });

  it('never changes the invoice it checks', () => {
    const invoice = baseInvoice({ total: 6600 });
    const snapshot = JSON.stringify(invoice);
    validateInvoice(invoice, { now: NOW });
    expect(JSON.stringify(invoice)).toBe(snapshot);
  });
});
