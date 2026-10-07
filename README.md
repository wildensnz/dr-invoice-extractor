# DR Invoice Extractor

Turn photos and PDFs of **Dominican invoices** into structured JSON with Claude
vision, validate them with local business rules (RNC, NCF, ITBIS, totals), review
and fix them in the browser, and measure extraction accuracy with an eval suite.

> Work in progress. Phases: scaffold ✅ · schema + validation + fixtures ✅ ·
> extraction API ✅ · review UI ✅ · evals · CI + deploy.

## How extraction works

`POST /api/extract` takes a multipart `file` and returns
`{ invoice, checks, usage }`.

1. The file is sniffed by magic bytes (JPEG, PNG, WebP or PDF) and capped at
   5 MB before anything is sent anywhere. Requests are rate limited per client.
2. `lib/extract.ts` sends the image (`image` block) or PDF (`document` block)
   to Claude with a short system prompt that explains the Dominican context
   (RNC, NCF series, ITBIS 18 %, dd/mm/yyyy dates, RD$).
3. The response is constrained with **structured outputs**:
   `output_config.format` carries the JSON Schema derived from the zod
   `InvoiceSchema`, so the model can only emit a document of that shape. (The
   older trick of forcing `tool_choice` to an extraction tool is rejected by
   current models, structured outputs is its replacement.)
4. The JSON is parsed again with zod on our side. If that fails, the issues are
   sent back to the model for one retry; after that the API answers 422.
5. The validation rules below run on the parsed invoice and the result goes to
   the review UI. Nothing is stored.

## Validation rules

Every extracted invoice goes through `lib/validate.ts`. Rules never change a
value; they flag it as `ok` or `warning` with a reason so a human decides.

| Field            | Rule                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `issuer.rnc`     | 9-digit RNC with a valid DGII check digit, or 11-digit cédula       |
| `customer.rnc`   | Same; required when the NCF is crédito fiscal (B01 / E31)           |
| `ncf`            | `B` + type + 8 digits or e-CF `E` + type + 10 digits; known type    |
| `date`           | Real calendar date, not in the future                               |
| `items[i].total` | quantity × unit price (± RD$1)                                      |
| `subtotal`       | Σ line totals (± RD$1)                                              |
| `itbis`          | 18 % of the taxable base (exempt lines excluded, discount prorated) |
| `total`          | subtotal − discount + ITBIS (± RD$1)                                |

## Synthetic fixtures

`npm run fixtures` renders 30 invented invoices (3 layouts: formal A4, modern
A4, 80 mm thermal ticket) to `fixtures/invoices/NNNN.{pdf,png,json}` with
Playwright. Data is seeded, so the output is byte-for-byte reproducible. They
cover B01/B02/B14/B15 and e-CF (E31/E32), ITBIS-exempt lines, discounts,
customers with RNC, cédula or none, and tax ids printed with and without
dashes. Nothing in them is real.

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
