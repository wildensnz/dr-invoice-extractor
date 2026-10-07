/**
 * Pure comparison and reporting for the eval. Nothing here calls the API.
 */
import type { Invoice } from '@/lib/schema';
import type { Check } from '@/lib/validate';

export type Format = 'pdf' | 'png';

/** Fields scored by the eval, in report order. */
export const FIELDS = [
  'issuer.rnc',
  'customer.rnc',
  'ncf',
  'date',
  'items.count',
  'items.totals',
  'subtotal',
  'discount',
  'itbis',
  'total',
] as const;

export type Field = (typeof FIELDS)[number];

/** Fields that must all match for an extraction to count as "perfect". */
export const CORE_FIELDS: Field[] = [
  'issuer.rnc',
  'ncf',
  'date',
  'items.count',
  'subtotal',
  'itbis',
  'total',
];

export const MONEY_TOLERANCE = 1;

export interface FieldResult {
  field: Field;
  ok: boolean;
  expected: string;
  actual: string;
}

export interface CaseResult {
  id: string;
  template: string;
  format: Format;
  fields: FieldResult[];
  /** Every core field matched. */
  perfect: boolean;
  warnings: number;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  attempts: number;
  /** Set when extraction threw; `fields` are then all failures. */
  error?: string;
}

const near = (a: number, b: number) => Math.abs(a - b) <= MONEY_TOLERANCE;
const money = (n: number | undefined) => (n === undefined ? '—' : String(n));

export function compareInvoices(
  expected: Invoice,
  actual: Invoice,
): FieldResult[] {
  const exact = (
    field: Field,
    e: string | undefined,
    a: string | undefined,
  ) => ({
    field,
    ok: e === a,
    expected: e ?? '—',
    actual: a ?? '—',
  });
  const amount = (field: Field, e: number, a: number) => ({
    field,
    ok: near(e, a),
    expected: money(e),
    actual: money(a),
  });

  const expectedTotals = expected.items.map((i) => i.total);
  const actualTotals = actual.items.map((i) => i.total);
  const totalsOk =
    expectedTotals.length === actualTotals.length &&
    expectedTotals.every((t, i) => near(t, actualTotals[i]));

  return [
    exact('issuer.rnc', expected.issuer.rnc, actual.issuer.rnc),
    exact('customer.rnc', expected.customer?.rnc, actual.customer?.rnc),
    exact('ncf', expected.ncf, actual.ncf),
    exact('date', expected.date, actual.date),
    exact(
      'items.count',
      String(expected.items.length),
      String(actual.items.length),
    ),
    {
      field: 'items.totals',
      ok: totalsOk,
      expected: expectedTotals.join(', '),
      actual: actualTotals.join(', '),
    },
    amount('subtotal', expected.subtotal, actual.subtotal),
    amount('discount', expected.discount ?? 0, actual.discount ?? 0),
    amount('itbis', expected.itbis, actual.itbis),
    amount('total', expected.total, actual.total),
  ];
}

export function failedFields(expected: Invoice): FieldResult[] {
  return compareInvoices(expected, expected).map((f) => ({
    ...f,
    ok: false,
    actual: '(error)',
  }));
}

export function isPerfect(fields: FieldResult[]): boolean {
  return fields.filter((f) => CORE_FIELDS.includes(f.field)).every((f) => f.ok);
}

export function countWarnings(checks: Check[]): number {
  return checks.filter((c) => c.status === 'warning').length;
}

/** USD per million tokens (input, output). */
export const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = PRICING[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1e6;
}

export interface Summary {
  cases: number;
  perfect: number;
  withWarnings: number;
  errors: number;
  byField: Record<Field, { ok: number; total: number }>;
  byFormat: Record<Format, { cases: number; perfect: number }>;
  byTemplate: Record<string, { cases: number; perfect: number }>;
  inputTokens: number;
  outputTokens: number;
  /** Extra API calls caused by validation retries. */
  retries: number;
  meanMs: number;
}

export function summarize(results: CaseResult[]): Summary {
  const byField = Object.fromEntries(
    FIELDS.map((f) => [f, { ok: 0, total: 0 }]),
  ) as Summary['byField'];
  const byFormat: Summary['byFormat'] = {
    pdf: { cases: 0, perfect: 0 },
    png: { cases: 0, perfect: 0 },
  };
  const byTemplate: Summary['byTemplate'] = {};
  let inputTokens = 0;
  let outputTokens = 0;
  let retries = 0;
  let ms = 0;

  for (const r of results) {
    for (const f of r.fields) {
      byField[f.field].total += 1;
      if (f.ok) byField[f.field].ok += 1;
    }
    byFormat[r.format].cases += 1;
    if (r.perfect) byFormat[r.format].perfect += 1;
    byTemplate[r.template] ??= { cases: 0, perfect: 0 };
    byTemplate[r.template].cases += 1;
    if (r.perfect) byTemplate[r.template].perfect += 1;
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    retries += Math.max(0, r.attempts - 1);
    ms += r.ms;
  }

  return {
    cases: results.length,
    perfect: results.filter((r) => r.perfect).length,
    withWarnings: results.filter((r) => r.warnings > 0).length,
    errors: results.filter((r) => r.error).length,
    byField,
    byFormat,
    byTemplate,
    inputTokens,
    outputTokens,
    retries,
    meanMs: results.length ? ms / results.length : 0,
  };
}

const pct = (ok: number, total: number) =>
  total === 0 ? '—' : `${((100 * ok) / total).toFixed(1)}%`;

export interface ReportMeta {
  model: string;
  date: string;
  formats: Format[];
}

export function renderReport(results: CaseResult[], meta: ReportMeta): string {
  const s = summarize(results);
  const cost = estimateCost(meta.model, s.inputTokens, s.outputTokens);
  const lines: string[] = [];

  lines.push('# Eval report');
  lines.push('');
  lines.push(`- Date: ${meta.date}`);
  lines.push(`- Model: \`${meta.model}\``);
  lines.push(
    `- Cases: ${s.cases} (${meta.formats.join(' + ')}), ${s.errors} failed to extract`,
  );
  lines.push(
    `- **Perfect extractions (all core fields): ${s.perfect}/${s.cases} (${pct(s.perfect, s.cases)})**`,
  );
  lines.push(
    `- Extractions with validation warnings: ${s.withWarnings}/${s.cases}`,
  );
  lines.push(
    `- Tokens: ${s.inputTokens.toLocaleString('en-US')} in / ${s.outputTokens.toLocaleString('en-US')} out` +
      (cost === null ? '' : ` (~$${cost.toFixed(2)})`) +
      `, ${s.retries} retries, mean ${(s.meanMs / 1000).toFixed(1)}s per invoice`,
  );
  lines.push('');

  lines.push('## Accuracy by field');
  lines.push('');
  lines.push('| Field | All | PDF | PNG |');
  lines.push('| --- | --- | --- | --- |');
  for (const field of FIELDS) {
    const all = s.byField[field];
    const per = (format: Format) => {
      const subset = results
        .filter((r) => r.format === format)
        .flatMap((r) => r.fields.filter((f) => f.field === field));
      return pct(subset.filter((f) => f.ok).length, subset.length);
    };
    const core = CORE_FIELDS.includes(field) ? '' : ' *';
    lines.push(
      `| \`${field}\`${core} | ${pct(all.ok, all.total)} | ${per('pdf')} | ${per('png')} |`,
    );
  }
  lines.push('');
  lines.push(
    '\\* informational, not part of the "perfect" score. Money fields use a ±RD$1 tolerance.',
  );
  lines.push('');

  lines.push('## Perfect extractions by layout');
  lines.push('');
  lines.push('| Layout | Perfect | Cases |');
  lines.push('| --- | --- | --- |');
  for (const [template, t] of Object.entries(s.byTemplate)) {
    lines.push(`| ${template} | ${pct(t.perfect, t.cases)} | ${t.cases} |`);
  }
  lines.push('');

  const failures = results.flatMap((r) =>
    r.error
      ? [{ r, field: 'extraction', expected: '', actual: r.error }]
      : r.fields
          .filter((f) => !f.ok)
          .map((f) => ({
            r,
            field: f.field,
            expected: f.expected,
            actual: f.actual,
          })),
  );
  lines.push('## Mismatches');
  lines.push('');
  if (failures.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Fixture | Layout | Field | Expected | Got |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const f of failures) {
      lines.push(
        `| ${f.r.id}.${f.r.format} | ${f.r.template} | \`${f.field}\` | ${escapeCell(f.expected)} | ${escapeCell(f.actual)} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
