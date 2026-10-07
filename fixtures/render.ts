/**
 * Tiny mustache-like renderer plus the view model each template receives.
 * Supports `{{key}}` (HTML-escaped), `{{#key}}…{{/key}}` (array → loop,
 * object → scoped block, truthy → block) and `{{^key}}…{{/key}}` (falsy).
 */
import { NCF_TYPES, parseNcf } from '@/lib/validate';
import type { Fixture } from './data';

type Ctx = Record<string, unknown>;

const pesos = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lookup(key: string, scopes: Ctx[]): unknown {
  for (const scope of scopes) {
    if (key in scope) return scope[key];
  }
  return undefined;
}

export function renderTemplate(template: string, view: Ctx): string {
  const render = (src: string, scopes: Ctx[]): string => {
    const withSections = src.replace(
      /\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g,
      (_, mode: string, key: string, inner: string) => {
        const value = lookup(key, scopes);
        const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value);
        if (mode === '^') return truthy ? '' : render(inner, scopes);
        if (!truthy) return '';
        if (Array.isArray(value)) {
          return value
            .map((item) => render(inner, [item as Ctx, ...scopes]))
            .join('');
        }
        if (typeof value === 'object') {
          return render(inner, [value as Ctx, ...scopes]);
        }
        return render(inner, scopes);
      },
    );
    return withSections.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const value = lookup(key, scopes);
      if (value === undefined || value === null || value === false) return '';
      if (typeof value === 'string') return escapeHtml(value);
      if (typeof value === 'number' || typeof value === 'boolean') {
        return escapeHtml(String(value));
      }
      throw new Error(`{{${key}}} is not printable; use {{#${key}}} instead`);
    });
  };
  return render(template, [view]);
}

/** `131123456` → `1-31-12345-6`; `00112345678` → `001-1234567-8`. */
export function formatTaxId(id: string): string {
  if (id.length === 9) {
    return `${id[0]}-${id.slice(1, 3)}-${id.slice(3, 8)}-${id[8]}`;
  }
  if (id.length === 11) {
    return `${id.slice(0, 3)}-${id.slice(3, 10)}-${id[10]}`;
  }
  return id;
}

function printedDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const TITLES: Record<string, string> = {
  '01': 'FACTURA PARA CRÉDITO FISCAL',
  '02': 'FACTURA DE CONSUMO',
  '14': 'FACTURA REGÍMENES ESPECIALES',
  '15': 'FACTURA GUBERNAMENTAL',
  '31': 'FACTURA DE CRÉDITO FISCAL ELECTRÓNICA',
  '32': 'FACTURA DE CONSUMO ELECTRÓNICA',
};

/**
 * Builds the values a template prints. Each template formats money
 * differently on purpose (RD$ 1,234.56 / $1,234.56 / 1,234.56) and the
 * classic one prints tax ids with dashes, so the extractor has to normalize.
 */
export function buildView(fixture: Fixture): Ctx {
  const { invoice, printed, template } = fixture;
  const ncf = parseNcf(invoice.ncf);
  const type = ncf?.type ?? '02';
  const ecf = ncf?.kind === 'ecf';
  const dashed = template === 'classic';
  const money = (n: number): string =>
    template === 'classic'
      ? `RD$ ${pesos.format(n)}`
      : template === 'modern'
        ? `$${pesos.format(n)}`
        : pesos.format(n);
  const qty = (n: number): string =>
    Number.isInteger(n) ? String(n) : n.toFixed(2);

  return {
    title: TITLES[type] ?? `COMPROBANTE ${ncf?.series ?? ''}${type}`,
    ncfLabel: NCF_TYPES[type] ?? '',
    ecf,
    issuerName: invoice.issuer.name,
    issuerRnc: dashed ? formatTaxId(invoice.issuer.rnc) : invoice.issuer.rnc,
    issuerAddress: printed.issuerAddress,
    issuerPhone: printed.issuerPhone,
    invoiceNumber: printed.invoiceNumber,
    ncf: invoice.ncf,
    ncfValidUntil: printed.ncfValidUntil,
    date: printedDate(invoice.date),
    customer: invoice.customer
      ? {
          customerName: invoice.customer.name,
          customerRnc: invoice.customer.rnc
            ? dashed
              ? formatTaxId(invoice.customer.rnc)
              : invoice.customer.rnc
            : '',
          customerIdLabel:
            invoice.customer.rnc && invoice.customer.rnc.length === 11
              ? 'Cédula'
              : 'RNC',
        }
      : false,
    items: invoice.items.map((item, i) => ({
      n: i + 1,
      qty: qty(item.quantity),
      description: item.description,
      unitPrice: money(item.unitPrice),
      total: money(item.total),
      exemptMark: item.exempt ? 'E' : '',
      exempt: item.exempt,
    })),
    hasExempt: invoice.items.some((item) => item.exempt),
    subtotal: money(invoice.subtotal),
    discount: invoice.discount !== undefined ? money(invoice.discount) : false,
    itbis: money(invoice.itbis),
    total: money(invoice.total),
    paymentMethod: printed.paymentMethod,
    paid: printed.paid !== undefined ? money(printed.paid) : false,
    change: printed.change !== undefined ? money(printed.change) : false,
    securityCode: printed.securityCode ?? false,
  };
}
