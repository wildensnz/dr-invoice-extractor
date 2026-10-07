import { describe, expect, it } from 'vitest';
import {
  compareInvoices,
  estimateCost,
  failedFields,
  FIELDS,
  isPerfect,
  renderReport,
  summarize,
  type CaseResult,
} from '@/evals/compare';
import { generateFixtures } from '@/fixtures/data';

const [fixture] = generateFixtures();
const expected = fixture.invoice;

function caseResult(overrides: Partial<CaseResult> = {}): CaseResult {
  const fields = compareInvoices(expected, expected);
  return {
    id: '0001',
    template: 'classic',
    format: 'png',
    fields,
    perfect: isPerfect(fields),
    warnings: 0,
    inputTokens: 1000,
    outputTokens: 100,
    ms: 3000,
    attempts: 1,
    ...overrides,
  };
}

describe('compareInvoices', () => {
  it('matches an identical invoice on every field', () => {
    const fields = compareInvoices(expected, expected);
    expect(fields.map((f) => f.field)).toEqual([...FIELDS]);
    expect(fields.every((f) => f.ok)).toBe(true);
    expect(isPerfect(fields)).toBe(true);
  });

  it('tolerates RD$1 on money fields but not on exact fields', () => {
    const fields = compareInvoices(expected, {
      ...expected,
      total: expected.total + 0.9,
      ncf: expected.ncf.replace(/\d$/, 'X'),
    });
    const byField = Object.fromEntries(fields.map((f) => [f.field, f.ok]));
    expect(byField.total).toBe(true);
    expect(byField.ncf).toBe(false);
    expect(isPerfect(fields)).toBe(false);
  });

  it('treats a missing customer and a missing discount as "—" and 0', () => {
    const noCustomer = { ...expected, customer: undefined };
    const fields = compareInvoices(noCustomer, noCustomer);
    const customer = fields.find((f) => f.field === 'customer.rnc');
    expect(customer).toMatchObject({ ok: true, expected: '—', actual: '—' });
    const discount = fields.find((f) => f.field === 'discount');
    expect(discount).toMatchObject({ ok: true, expected: '0' });
  });

  it('checks line totals in order and the line count', () => {
    const fields = compareInvoices(expected, {
      ...expected,
      items: [...expected.items].reverse(),
    });
    const byField = Object.fromEntries(fields.map((f) => [f.field, f.ok]));
    expect(byField['items.count']).toBe(true);
    expect(byField['items.totals']).toBe(expected.items.length <= 1);
  });

  it('informational fields do not affect "perfect"', () => {
    const fields = compareInvoices(expected, {
      ...expected,
      customer: { name: 'X', rnc: '000000000' },
      items: expected.items.map((i) => ({ ...i, total: i.total + 5 })),
    });
    expect(isPerfect(fields)).toBe(true);
  });
});

describe('failedFields', () => {
  it('marks every field as failed', () => {
    const fields = failedFields(expected);
    expect(fields).toHaveLength(FIELDS.length);
    expect(fields.every((f) => !f.ok && f.actual === '(error)')).toBe(true);
  });
});

describe('summarize + renderReport', () => {
  const results: CaseResult[] = [
    caseResult(),
    caseResult({ format: 'pdf', warnings: 1 }),
    caseResult({
      id: '0002',
      template: 'modern',
      fields: compareInvoices(expected, { ...expected, itbis: 0 }),
      perfect: false,
      attempts: 2,
    }),
    caseResult({
      id: '0003',
      template: 'thermal',
      format: 'pdf',
      fields: failedFields(expected),
      perfect: false,
      error: 'boom',
      inputTokens: 0,
      outputTokens: 0,
    }),
  ];

  it('aggregates per field, format and template', () => {
    const s = summarize(results);
    expect(s.cases).toBe(4);
    expect(s.perfect).toBe(2);
    expect(s.errors).toBe(1);
    expect(s.withWarnings).toBe(1);
    expect(s.byField.itbis).toEqual({ ok: 2, total: 4 });
    expect(s.byField.ncf).toEqual({ ok: 3, total: 4 });
    expect(s.byFormat.png).toEqual({ cases: 2, perfect: 1 });
    expect(s.byTemplate.classic).toEqual({ cases: 2, perfect: 2 });
    expect(s.inputTokens).toBe(3000);
    expect(s.retries).toBe(1);
  });

  it('renders a markdown report with the headline, tables and mismatches', () => {
    const report = renderReport(results, {
      model: 'claude-sonnet-5-5',
      date: '2026-10-07',
      formats: ['pdf', 'png'],
    });
    expect(report).toContain('# Eval report');
    expect(report).toContain(
      'Perfect extractions (all core fields): 2/4 (50.0%)',
    );
    expect(report).toContain('| `ncf` | 75.0% |');
    expect(report).toContain('| thermal | 0.0% | 1 |');
    expect(report).toContain('| 0002.png | modern | `itbis` |');
    expect(report).toContain('| 0003.pdf | thermal | `extraction` |  | boom |');
    expect(report).toMatch(/\(~\$0\.0\d\)/);
  });

  it('omits the cost for unknown models', () => {
    expect(estimateCost('unknown-model', 1000, 1000)).toBeNull();
    const report = renderReport(results, {
      model: 'unknown-model',
      date: '2026-10-07',
      formats: ['png'],
    });
    expect(report).not.toContain('~$');
  });
});
