/**
 * Sends an invoice image or PDF to Claude and returns a validated Invoice.
 *
 * JSON is guaranteed by structured outputs: `output_config.format` carries the
 * JSON Schema derived from `InvoiceSchema`, so the model can only emit a
 * document of that shape. The SDK strips the constraints the API does not
 * enforce (regex, minimums) and we re-check everything with zod client-side.
 * If zod still rejects the output, we retry once with the issues in the
 * prompt; after that the caller gets an `ExtractionError`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { MediaType } from '@/lib/files';
import { toBase64 } from '@/lib/files';
import { InvoiceSchema, normalizeInvoice, type Invoice } from '@/lib/schema';
import { validateInvoice, type Check } from '@/lib/validate';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MAX_ATTEMPTS = 2;

export const SYSTEM_PROMPT = `You extract structured data from invoices issued in the Dominican Republic (facturas dominicanas). You receive one invoice as an image or PDF and return exactly one JSON document matching the schema. Read values exactly as printed; never invent or "fix" numbers. If a value is unreadable, use your best reading of the digits.

Domain notes:
- RNC (Registro Nacional de Contribuyentes) identifies a business: 9 digits, often printed as 1-31-12345-6. Cédula identifies a person: 11 digits, often 001-1234567-8. Return digits only.
- NCF (Número de Comprobante Fiscal) is the fiscal invoice number: one letter plus 10 digits (B0100000123; B01 crédito fiscal, B02 consumo, B14 regímenes especiales, B15 gubernamental) or an e-CF: E plus 12 digits (E310000000001). Return it without spaces or dashes. Do not confuse it with the internal invoice/ticket number.
- The issuer is the business whose name, RNC and address appear in the header. The customer (cliente) may be a company with RNC, a person with cédula, a name only, or absent ("consumidor final" means absent).
- Dates are usually dd/mm/yyyy; convert to YYYY-MM-DD.
- Amounts are Dominican pesos (DOP) when shown as RD$, $, or with no symbol. Parse 1,234.56 as 1234.56.
- ITBIS is the 18% VAT. Lines marked E, Exento or EXENTO are exempt (exempt: true). Line totals are before ITBIS.
- subtotal is the sum of lines before discount and ITBIS; discount only when a descuento line is printed; total is the final amount to pay. Ignore cash tendered (efectivo) and change (cambio).`;

export const USER_PROMPT =
  'Extract this invoice. Include every line item in print order.';

export interface ExtractInput {
  data: Uint8Array;
  mediaType: MediaType;
}

export interface ExtractUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  attempts: number;
}

export interface ExtractResult {
  invoice: Invoice;
  checks: Check[];
  usage: ExtractUsage;
}

export interface ExtractOptions {
  client?: Pick<Anthropic, 'messages'>;
  model?: string;
  maxAttempts?: number;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

type ParseOutcome = { invoice: Invoice } | { issues: string[] };

/** JSON.parse + zod. Exported for tests. */
export function parseInvoiceText(text: string): ParseOutcome {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      issues: [
        `Output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  const parsed = InvoiceSchema.safeParse(json);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }
  return { invoice: parsed.data };
}

function fileBlock(input: ExtractInput): Anthropic.ContentBlockParam {
  const data = toBase64(input.data);
  if (input.mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data },
    };
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: input.mediaType, data },
  };
}

export async function extractInvoice(
  input: ExtractInput,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const started = Date.now();
  const usage: ExtractUsage = {
    model,
    inputTokens: 0,
    outputTokens: 0,
    ms: 0,
    attempts: 0,
  };

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [fileBlock(input), { type: 'text', text: USER_PROMPT }],
    },
  ];

  let lastIssues: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages,
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(InvoiceSchema),
      },
    });
    usage.attempts = attempt;
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    if (response.stop_reason === 'refusal') {
      throw new ExtractionError(
        `The model declined to process this file${
          response.stop_details?.explanation
            ? `: ${response.stop_details.explanation}`
            : '.'
        }`,
      );
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const outcome = parseInvoiceText(text);

    if ('invoice' in outcome) {
      const invoice = normalizeInvoice(outcome.invoice);
      usage.ms = Date.now() - started;
      return { invoice, checks: validateInvoice(invoice), usage };
    }

    lastIssues = outcome.issues;
    if (response.stop_reason === 'max_tokens') {
      lastIssues.unshift('Output was cut off before the JSON was complete.');
    }
    messages.push(
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content: `The previous output failed validation:\n${lastIssues
          .map((issue) => `- ${issue}`)
          .join(
            '\n',
          )}\nReturn the complete invoice again, fixing these issues.`,
      },
    );
  }

  usage.ms = Date.now() - started;
  throw new ExtractionError(
    `Could not extract a valid invoice after ${maxAttempts} attempts.`,
    lastIssues,
  );
}
