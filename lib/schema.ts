import { z } from 'zod';
import { round2 } from '@/lib/format';

/**
 * Invoice shape produced by the `extract_invoice` tool and consumed by the
 * validator, the review form and the evals. Amounts are numbers in the
 * invoice currency; dates are ISO (YYYY-MM-DD) regardless of how they are
 * printed.
 */
export const LineItemSchema = z.object({
  description: z.string().min(1).describe('Item description as printed.'),
  quantity: z
    .number()
    .positive()
    .describe('Quantity. Use 1 when the invoice does not print one.'),
  unitPrice: z
    .number()
    .nonnegative()
    .describe('Unit price before ITBIS, as printed.'),
  total: z
    .number()
    .nonnegative()
    .describe('Line total before ITBIS (quantity x unit price).'),
  exempt: z
    .boolean()
    .describe(
      'true when the line is marked exempt from ITBIS (E, Exento, 0%). false otherwise.',
    ),
});

export const IssuerSchema = z.object({
  name: z.string().min(1).describe('Legal or trade name of the business.'),
  rnc: z
    .string()
    .describe(
      'Issuer RNC (9 digits) or cedula (11 digits), digits only, no dashes.',
    ),
});

export const CustomerSchema = z.object({
  name: z.string().min(1).describe('Customer name as printed.'),
  rnc: z
    .string()
    .optional()
    .describe(
      'Customer RNC (9 digits) or cedula (11 digits), digits only. Omit if not printed.',
    ),
});

export const InvoiceSchema = z.object({
  issuer: IssuerSchema,
  customer: CustomerSchema.optional().describe(
    'Customer block. Omit entirely when the invoice has no customer data.',
  ),
  ncf: z
    .string()
    .min(1)
    .describe(
      'Numero de Comprobante Fiscal: one letter + 10 digits (B0100000123) or e-CF: E + 12 digits (E310000000001). No spaces or dashes.',
    ),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe(
      'Issue date in ISO format YYYY-MM-DD. Dominican invoices usually print dd/mm/yyyy.',
    ),
  currency: z
    .enum(['DOP', 'USD'])
    .describe('DOP for RD$ or $ (pesos). USD only when explicitly US dollars.'),
  items: z.array(LineItemSchema).min(1).describe('Line items in print order.'),
  subtotal: z
    .number()
    .nonnegative()
    .describe('Sum of line totals before discount and ITBIS.'),
  discount: z
    .number()
    .nonnegative()
    .optional()
    .describe('Discount amount applied to the subtotal. Omit when none.'),
  itbis: z.number().nonnegative().describe('ITBIS (VAT) amount.'),
  total: z.number().nonnegative().describe('Grand total as printed.'),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;

/** JSON Schema for the `extract_invoice` tool `input_schema`. */
export function invoiceJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(InvoiceSchema, { target: 'draft-7' });
  delete schema.$schema;
  return schema;
}

/** Drops separators: `1-31-12345-6` → `131123456`. Letters are preserved. */
export function normalizeId(value: string): string {
  return value.replace(/[\s.\-]/g, '');
}

/**
 * Cosmetic normalization only (separators, case, rounding). It never changes
 * what the model read; that is what `validateInvoice` flags.
 */
export function normalizeInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    issuer: {
      name: invoice.issuer.name.trim(),
      rnc: normalizeId(invoice.issuer.rnc),
    },
    customer: invoice.customer
      ? {
          name: invoice.customer.name.trim(),
          ...(invoice.customer.rnc !== undefined && {
            rnc: normalizeId(invoice.customer.rnc),
          }),
        }
      : undefined,
    ncf: normalizeId(invoice.ncf).toUpperCase(),
    items: invoice.items.map((item) => ({
      ...item,
      description: item.description.trim(),
      quantity: round2(item.quantity),
      unitPrice: round2(item.unitPrice),
      total: round2(item.total),
    })),
    subtotal: round2(invoice.subtotal),
    ...(invoice.discount !== undefined && {
      discount: round2(invoice.discount),
    }),
    itbis: round2(invoice.itbis),
    total: round2(invoice.total),
  };
}
