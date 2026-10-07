import { InvoiceExtractor } from '@/components/invoice-extractor';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          DR Invoice Extractor
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground sm:text-base">
          Upload a photo or PDF of a Dominican invoice. Claude reads it into
          structured JSON, local rules check RNC, NCF, ITBIS and totals, and you
          fix anything flagged before downloading.
        </p>
      </header>
      <InvoiceExtractor />
      <footer className="mt-auto border-t pt-4 text-xs text-muted-foreground">
        Files are processed in memory and never stored. Sample invoices are
        synthetic.
      </footer>
    </main>
  );
}
