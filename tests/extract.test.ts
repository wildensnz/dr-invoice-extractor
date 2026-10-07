import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  ExtractionError,
  extractInvoice,
  parseInvoiceText,
  SYSTEM_PROMPT,
} from '@/lib/extract';

const GOOD = {
  issuer: { name: 'Ferretería El Progreso SRL', rnc: '1-31-12345-7' },
  customer: { name: 'Grupo Cibao Logístico SRL', rnc: '131778895' },
  ncf: 'B0100006158',
  date: '2026-07-22',
  currency: 'DOP',
  items: [
    {
      description: 'Candado 50 mm',
      quantity: 12,
      unitPrice: 436.5,
      total: 5238,
      exempt: false,
    },
  ],
  subtotal: 5238,
  itbis: 942.84,
  total: 6180.84,
};

function message(
  text: string,
  overrides: Partial<Anthropic.Message> = {},
): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
      iterations: null,
      speed: null,
    },
    container: null,
    context_management: null,
    ...overrides,
  } as Anthropic.Message;
}

/** A fake client whose `messages.create` returns the given messages in order. */
function fakeClient(responses: Anthropic.Message[]) {
  const create = vi.fn();
  for (const response of responses) create.mockResolvedValueOnce(response);
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('parseInvoiceText', () => {
  it('returns the invoice for valid JSON', () => {
    const outcome = parseInvoiceText(JSON.stringify(GOOD));
    expect('invoice' in outcome).toBe(true);
  });

  it('lists zod issues with paths', () => {
    const outcome = parseInvoiceText(
      JSON.stringify({ ...GOOD, date: '22/07/2026', items: [] }),
    );
    expect(outcome).toHaveProperty('issues');
    const { issues } = outcome as { issues: string[] };
    expect(issues.some((i) => i.startsWith('date:'))).toBe(true);
    expect(issues.some((i) => i.startsWith('items:'))).toBe(true);
  });

  it('reports invalid JSON', () => {
    const outcome = parseInvoiceText('{not json');
    expect(outcome).toHaveProperty('issues');
    expect((outcome as { issues: string[] }).issues[0]).toMatch(
      /not valid JSON/,
    );
  });
});

describe('extractInvoice', () => {
  it('sends the file with structured output and returns a normalized, validated invoice', async () => {
    const { client, create } = fakeClient([message(JSON.stringify(GOOD))]);
    const result = await extractInvoice(
      { data: PNG, mediaType: 'image/png' },
      { client, model: 'test-model' },
    );

    expect(result.invoice.issuer.rnc).toBe('131123457');
    expect(result.checks.every((c) => c.status === 'ok')).toBe(true);
    expect(result.usage).toMatchObject({
      model: 'test-model',
      inputTokens: 1000,
      outputTokens: 200,
      attempts: 1,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0] as Anthropic.MessageCreateParams;
    expect(params.model).toBe('test-model');
    expect(params.system).toBe(SYSTEM_PROMPT);
    expect(params.tool_choice).toBeUndefined();
    expect(params.output_config?.format?.type).toBe('json_schema');
    const content = params.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png' },
    });
  });

  it('sends PDFs as document blocks', async () => {
    const { client, create } = fakeClient([message(JSON.stringify(GOOD))]);
    await extractInvoice(
      {
        data: new Uint8Array(Buffer.from('%PDF-')),
        mediaType: 'application/pdf',
      },
      { client },
    );
    const params = create.mock.calls[0][0] as Anthropic.MessageCreateParams;
    const content = params.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toMatchObject({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf' },
    });
  });

  it('retries once with the validation issues when the output does not parse', async () => {
    const bad = message(JSON.stringify({ ...GOOD, total: 'mucho' }));
    const { client, create } = fakeClient([bad, message(JSON.stringify(GOOD))]);
    const result = await extractInvoice(
      { data: PNG, mediaType: 'image/png' },
      { client },
    );

    expect(result.usage.attempts).toBe(2);
    expect(result.usage.inputTokens).toBe(2000);
    expect(create).toHaveBeenCalledTimes(2);
    const retry = create.mock.calls[1][0] as Anthropic.MessageCreateParams;
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[1].role).toBe('assistant');
    expect(retry.messages[2].content).toMatch(/total: /);
  });

  it('throws ExtractionError with the issues after the last attempt', async () => {
    const bad = message('{"nope": true}');
    const { client, create } = fakeClient([bad, bad]);
    await expect(
      extractInvoice({ data: PNG, mediaType: 'image/png' }, { client }),
    ).rejects.toMatchObject({
      name: 'ExtractionError',
      issues: expect.arrayContaining([expect.stringMatching(/issuer/)]),
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not retry on refusal', async () => {
    const refused = message('', {
      stop_reason: 'refusal',
      stop_details: {
        type: 'refusal',
        category: null,
        explanation: 'policy',
      },
    });
    const { client, create } = fakeClient([refused]);
    await expect(
      extractInvoice({ data: PNG, mediaType: 'image/png' }, { client }),
    ).rejects.toBeInstanceOf(ExtractionError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('mentions truncation when max_tokens was hit', async () => {
    const cut = message('{"issuer": {', { stop_reason: 'max_tokens' });
    const { client } = fakeClient([cut, cut]);
    await expect(
      extractInvoice({ data: PNG, mediaType: 'image/png' }, { client }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.stringMatching(/cut off/)]),
    });
  });
});
