# DR Invoice Extractor

Turn photos and PDFs of **Dominican invoices** into structured JSON with Claude
vision, validate them with local business rules (RNC, NCF, ITBIS, totals), review
and fix them in the browser, and measure extraction accuracy with an eval suite.

> Work in progress. Phases: scaffold ✅ · schema + validation + fixtures ·
> extraction API · review UI · evals · CI + deploy.

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
`@anthropic-ai/sdk` · zod · Vitest · Playwright (fixture generation only).

## Run locally

```bash
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm install
npm run dev
```

## Scripts

| Script             | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run check`    | typecheck + lint + format check + unit tests        |
| `npm run fixtures` | generate the 30 synthetic invoices (pdf, png, json) |
| `npm run eval`     | extract every fixture and report per-field accuracy |

Nothing is stored: files are processed in memory and discarded.
