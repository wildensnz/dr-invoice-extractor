export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          DR Invoice Extractor
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Upload a photo or PDF of a Dominican invoice and get its RNC, NCF,
          ITBIS, totals and line items as structured JSON. Nothing is stored.
        </p>
      </header>
      <p className="text-sm text-muted-foreground">
        Upload and review UI coming in the next phases.
      </p>
    </main>
  );
}
