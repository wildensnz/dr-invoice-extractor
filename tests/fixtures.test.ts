import { describe, expect, it } from 'vitest';
import { generateFixtures, rncFromBase } from '@/fixtures/data';
import { buildView, formatTaxId, renderTemplate } from '@/fixtures/render';
import { InvoiceSchema } from '@/lib/schema';
import { hasWarnings, isValidRnc, validateInvoice } from '@/lib/validate';

const NOW = new Date('2026-10-07T12:00:00Z');
const fixtures = generateFixtures();

describe('generateFixtures', () => {
  it('produces 30 invoices, 10 per template', () => {
    expect(fixtures).toHaveLength(30);
    const byTemplate = Object.groupBy(fixtures, (f) => f.template);
    expect(byTemplate.classic).toHaveLength(10);
    expect(byTemplate.modern).toHaveLength(10);
    expect(byTemplate.thermal).toHaveLength(10);
  });

  it('is deterministic for the same seed and differs for another', () => {
    expect(JSON.stringify(generateFixtures())).toBe(JSON.stringify(fixtures));
    expect(JSON.stringify(generateFixtures(7))).not.toBe(
      JSON.stringify(fixtures),
    );
  });

  it('every invoice matches the schema and passes validation', () => {
    for (const fixture of fixtures) {
      expect(InvoiceSchema.safeParse(fixture.invoice).success).toBe(true);
      const checks = validateInvoice(fixture.invoice, { now: NOW });
      expect(
        hasWarnings(checks),
        `${fixture.id}: ${JSON.stringify(checks.filter((c) => c.status === 'warning'))}`,
      ).toBe(false);
    }
  });

  it('covers the interesting cases', () => {
    const withDiscount = fixtures.filter((f) => f.invoice.discount);
    expect(withDiscount).toHaveLength(2);
    const withExempt = fixtures.filter((f) =>
      f.invoice.items.some((i) => i.exempt),
    );
    expect(withExempt.length).toBeGreaterThanOrEqual(8);
    const types = new Set(fixtures.map((f) => f.invoice.ncf.slice(0, 3)));
    expect([...types]).toEqual(
      expect.arrayContaining(['B01', 'B02', 'E31', 'E32']),
    );
    const withoutCustomer = fixtures.filter((f) => !f.invoice.customer);
    expect(withoutCustomer.length).toBeGreaterThan(0);
    const counts = fixtures.map((f) => f.invoice.items.length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...counts)).toBeLessThanOrEqual(8);
  });

  it('uses RNCs with valid check digits', () => {
    for (const fixture of fixtures) {
      expect(isValidRnc(fixture.invoice.issuer.rnc)).toBe(true);
    }
    expect(rncFromBase('10100157')).toBe('101001577');
  });
});

describe('renderTemplate', () => {
  it('escapes values and handles loops, blocks and inverted blocks', () => {
    const out = renderTemplate(
      '<p>{{name}}</p>{{#items}}[{{n}}]{{/items}}{{#flag}}Y{{/flag}}{{^flag}}N{{/flag}}{{#obj}}{{a}}{{/obj}}',
      {
        name: 'A & B <x>',
        items: [{ n: 1 }, { n: 2 }],
        flag: false,
        obj: { a: 'ok' },
      },
    );
    expect(out).toBe('<p>A &amp; B &lt;x&gt;</p>[1][2]Nok');
  });

  it('renders every fixture without leaving placeholders behind', () => {
    const template =
      '{{issuerName}}|{{ncf}}|{{#customer}}{{customerName}}{{/customer}}|{{#items}}{{description}}={{total}};{{/items}}|{{total}}';
    for (const fixture of fixtures) {
      const html = renderTemplate(template, buildView(fixture));
      expect(html).not.toMatch(/\{\{/);
      expect(html).toContain(fixture.invoice.ncf);
    }
  });
});

describe('formatTaxId', () => {
  it('prints RNC and cédula with the usual dashes', () => {
    expect(formatTaxId('131123456')).toBe('1-31-12345-6');
    expect(formatTaxId('00112345678')).toBe('001-1234567-8');
    expect(formatTaxId('12')).toBe('12');
  });
});
