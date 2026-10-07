import { describe, expect, it } from 'vitest';
import {
  InvoiceSchema,
  invoiceJsonSchema,
  normalizeId,
  normalizeInvoice,
} from '@/lib/schema';

const valid = {
  issuer: { name: 'Colmado Doña Carmen', rnc: '131123456' },
  ncf: 'B0200001234',
  date: '2026-01-05',
  currency: 'DOP',
  items: [
    {
      description: 'Pan de agua',
      quantity: 6,
      unitPrice: 10,
      total: 60,
      exempt: true,
    },
  ],
  subtotal: 60,
  itbis: 0,
  total: 60,
};

describe('InvoiceSchema', () => {
  it('accepts a minimal valid invoice without customer or discount', () => {
    const parsed = InvoiceSchema.parse(valid);
    expect(parsed.customer).toBeUndefined();
    expect(parsed.discount).toBeUndefined();
  });

  it('rejects wrong date format, empty items and unknown currency', () => {
    expect(
      InvoiceSchema.safeParse({ ...valid, date: '05/01/2026' }).success,
    ).toBe(false);
    expect(InvoiceSchema.safeParse({ ...valid, items: [] }).success).toBe(
      false,
    );
    expect(InvoiceSchema.safeParse({ ...valid, currency: 'EUR' }).success).toBe(
      false,
    );
  });

  it('rejects negative amounts and non-positive quantities', () => {
    expect(InvoiceSchema.safeParse({ ...valid, total: -1 }).success).toBe(
      false,
    );
    expect(
      InvoiceSchema.safeParse({
        ...valid,
        items: [{ ...valid.items[0], quantity: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe('invoiceJsonSchema', () => {
  it('is a plain JSON schema object usable as a tool input_schema', () => {
    const schema = invoiceJsonSchema();
    expect(schema.$schema).toBeUndefined();
    expect(schema.type).toBe('object');
    const required = schema.required as string[];
    expect(required).toEqual(
      expect.arrayContaining(['issuer', 'ncf', 'date', 'items', 'total']),
    );
    expect(required).not.toContain('customer');
    expect(required).not.toContain('discount');
    const props = schema.properties as Record<string, { description?: string }>;
    expect(props.ncf.description).toMatch(/Comprobante Fiscal/);
  });
});

describe('normalizeId / normalizeInvoice', () => {
  it('strips dashes, dots and spaces but keeps letters', () => {
    expect(normalizeId('1-31-12345-6')).toBe('131123456');
    expect(normalizeId('001-1234567-8')).toBe('00112345678');
    expect(normalizeId('B01 00001234')).toBe('B0100001234');
  });

  it('normalizes ids, case and rounding without touching values', () => {
    const normalized = normalizeInvoice({
      ...InvoiceSchema.parse(valid),
      issuer: { name: '  Colmado Doña Carmen ', rnc: '1-31-12345-6' },
      customer: { name: 'Ana', rnc: '001-1234567-8' },
      ncf: 'b02-00001234',
      itbis: 0.1 + 0.2,
    });
    expect(normalized.issuer).toEqual({
      name: 'Colmado Doña Carmen',
      rnc: '131123456',
    });
    expect(normalized.customer).toEqual({ name: 'Ana', rnc: '00112345678' });
    expect(normalized.ncf).toBe('B0200001234');
    expect(normalized.itbis).toBe(0.3);
    expect(normalized.total).toBe(60);
  });
});
