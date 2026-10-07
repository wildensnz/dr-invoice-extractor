/**
 * `npm run eval` — extracts every fixture (PDF and PNG) with the real API,
 * compares against the expected JSON and writes evals/report.md.
 * Costs tokens: ~60 calls. Never run in CI.
 *
 * Options:
 *   --format pdf|png|both   (default both)
 *   --ids 0001,0002         subset of fixtures
 *   --limit N               first N fixtures
 *   --concurrency N         parallel requests (default 3)
 *   --model <id>            overrides ANTHROPIC_MODEL
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { extractInvoice, DEFAULT_MODEL } from '@/lib/extract';
import { InvoiceSchema, type Invoice } from '@/lib/schema';
import {
  compareInvoices,
  countWarnings,
  failedFields,
  isPerfect,
  renderReport,
  summarize,
  type CaseResult,
  type Format,
} from './compare';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures', 'invoices');
const REPORT = path.join(ROOT, 'evals', 'report.md');
const RESULTS = path.join(ROOT, 'evals', 'results.json');

if (existsSync(path.join(ROOT, '.env.local'))) {
  process.loadEnvFile(path.join(ROOT, '.env.local'));
}

const { values: args } = parseArgs({
  options: {
    format: { type: 'string', default: 'both' },
    ids: { type: 'string' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    model: { type: 'string' },
  },
});

interface FixtureFile {
  id: string;
  template: string;
  invoice: Invoice;
}

async function loadFixtures(): Promise<FixtureFile[]> {
  const files = (await readdir(FIXTURES)).filter((f) => f.endsWith('.json'));
  const wanted = args.ids ? new Set(args.ids.split(',')) : null;
  const fixtures: FixtureFile[] = [];
  for (const file of files.sort()) {
    const raw = JSON.parse(
      await readFile(path.join(FIXTURES, file), 'utf8'),
    ) as {
      id: string;
      template: string;
      invoice: unknown;
    };
    if (wanted && !wanted.has(raw.id)) continue;
    fixtures.push({
      id: raw.id,
      template: raw.template,
      invoice: InvoiceSchema.parse(raw.invoice),
    });
  }
  return args.limit ? fixtures.slice(0, Number(args.limit)) : fixtures;
}

async function runCase(
  fixture: FixtureFile,
  format: Format,
  model: string,
): Promise<CaseResult> {
  const data = new Uint8Array(
    await readFile(path.join(FIXTURES, `${fixture.id}.${format}`)),
  );
  const base = { id: fixture.id, template: fixture.template, format };
  try {
    const result = await extractInvoice(
      { data, mediaType: format === 'pdf' ? 'application/pdf' : 'image/png' },
      { model },
    );
    const fields = compareInvoices(fixture.invoice, result.invoice);
    return {
      ...base,
      fields,
      perfect: isPerfect(fields),
      warnings: countWarnings(result.checks),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ms: result.usage.ms,
      attempts: result.usage.attempts,
    };
  } catch (error) {
    return {
      ...base,
      fields: failedFields(fixture.invoice),
      perfect: false,
      warnings: 0,
      inputTokens: 0,
      outputTokens: 0,
      ms: 0,
      attempts: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set (put it in .env.local).');
    process.exit(1);
  }
  const model = args.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const formats: Format[] =
    args.format === 'both' ? ['pdf', 'png'] : [args.format as Format];
  const fixtures = await loadFixtures();
  const cases = fixtures.flatMap((fixture) =>
    formats.map((format) => ({ fixture, format })),
  );
  console.log(
    `Evaluating ${cases.length} cases (${fixtures.length} fixtures × ${formats.join('+')}) with ${model}…`,
  );

  const results = await pool(
    cases,
    Number(args.concurrency),
    async ({ fixture, format }) => {
      const result = await runCase(fixture, format, model);
      const status = result.error
        ? `ERROR ${result.error}`
        : result.perfect
          ? 'ok'
          : `miss ${result.fields
              .filter((f) => !f.ok)
              .map((f) => f.field)
              .join(',')}`;
      console.log(
        `${fixture.id}.${format} ${fixture.template.padEnd(7)} ${status}`,
      );
      return result;
    },
  );

  const report = renderReport(results, {
    model,
    date: new Date().toISOString().slice(0, 10),
    formats,
  });
  await writeFile(REPORT, report);
  await writeFile(RESULTS, JSON.stringify(results, null, 2));

  const s = summarize(results);
  console.log(
    `\nPerfect: ${s.perfect}/${s.cases}. Report written to evals/report.md`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
