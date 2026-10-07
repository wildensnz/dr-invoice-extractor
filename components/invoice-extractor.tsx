'use client';

import { Download, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { InvoicePreview } from '@/components/invoice-preview';
import { ReviewForm } from '@/components/review-form';
import { UploadDropzone } from '@/components/upload-dropzone';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EXAMPLES, type Example } from '@/lib/examples';
import type { ExtractResult, ExtractUsage } from '@/lib/extract';
import type { Invoice } from '@/lib/schema';
import { validateInvoice, type Check } from '@/lib/validate';

type State =
  | { status: 'idle' }
  | { status: 'loading'; file: File }
  | {
      status: 'review';
      file: File;
      invoice: Invoice;
      checks: Check[];
      usage: ExtractUsage;
    }
  | { status: 'error'; message: string; issues?: string[] };

interface ErrorBody {
  error?: string;
  issues?: string[];
}

export function InvoiceExtractor() {
  const [state, setState] = useState<State>({ status: 'idle' });

  async function submit(file: File) {
    setState({ status: 'loading', file });
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as
        ExtractResult | ErrorBody;
      if (!res.ok || !('invoice' in body)) {
        const err = body as ErrorBody;
        setState({
          status: 'error',
          message: err.error ?? `Request failed (${res.status}).`,
          issues: err.issues,
        });
        return;
      }
      setState({ status: 'review', file, ...body });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error.',
      });
    }
  }

  async function loadExample(example: Example) {
    const res = await fetch(example.file);
    const blob = await res.blob();
    const name = example.file.split('/').pop() ?? 'sample';
    await submit(new File([blob], name, { type: example.mediaType }));
  }

  function updateInvoice(invoice: Invoice) {
    if (state.status !== 'review') return;
    setState({ ...state, invoice, checks: validateInvoice(invoice) });
  }

  function download() {
    if (state.status !== 'review') return;
    const blob = new Blob([JSON.stringify(state.invoice, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.invoice.ncf || 'invoice'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (state.status === 'idle' || state.status === 'error') {
    return (
      <div className="flex flex-col gap-6">
        {state.status === 'error' && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Could not extract the invoice</AlertTitle>
            <AlertDescription>
              <p>{state.message}</p>
              {state.issues && state.issues.length > 0 && (
                <ul className="mt-2 list-disc pl-4">
                  {state.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}
        <UploadDropzone
          examples={EXAMPLES}
          onFile={(file) => void submit(file)}
          onExample={(example) => void loadExample(example)}
        />
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[60vh] lg:h-[calc(100vh-12rem)]">
          <InvoicePreview file={state.file} />
        </div>
        <div className="flex flex-col gap-4" aria-busy="true">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            Reading the invoice…
          </p>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  const warnings = state.checks.filter((c) => c.status === 'warning').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {warnings > 0 ? (
            <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              <TriangleAlert />
              {warnings} {warnings === 1 ? 'warning' : 'warnings'} to review
            </Badge>
          ) : (
            <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              All checks passed
            </Badge>
          )}
          <Badge variant="outline" className="tabular-nums">
            {state.usage.inputTokens.toLocaleString()} in ·{' '}
            {state.usage.outputTokens.toLocaleString()} out ·{' '}
            {(state.usage.ms / 1000).toFixed(1)}s
            {state.usage.attempts > 1 && ` · ${state.usage.attempts} attempts`}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setState({ status: 'idle' })}
          >
            <RotateCcw data-icon="inline-start" />
            New invoice
          </Button>
          <Button type="button" size="sm" onClick={download}>
            <Download data-icon="inline-start" />
            Download JSON
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[60vh] lg:sticky lg:top-4 lg:h-[calc(100vh-12rem)]">
          <InvoicePreview file={state.file} />
        </div>
        <ReviewForm
          invoice={state.invoice}
          checks={state.checks}
          onChange={updateInvoice}
        />
      </div>
    </div>
  );
}
