# DR Invoice Extractor — project context for Claude Code

Portfolio project: a small, polished web app that turns photos/PDFs of
**Dominican invoices** into structured JSON with Claude vision, validates them
with local business rules, lets a human review and fix, and measures accuracy
with an eval suite. Priorities: **correct structured extraction → honest evals
→ clean, testable code → good screenshots.** Do not add features that are not
in PLAN.md without asking.

## What it is

Next.js single page: upload → `/api/extract` → Claude (image or PDF input,
forced `extract_invoice` tool call = guaranteed JSON) → zod parse →
`lib/validate.ts` rules → review form → download JSON. Nothing is stored.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui ·
`@anthropic-ai/sdk` · `zod` (+ JSON schema for the tool) · Vitest · Playwright
(fixtures generation only). Node 22. npm.

## Conventions (same as my other repos)

- Prettier: single quotes, semicolons, trailing commas, 80 cols, 2 spaces,
  `prettier-plugin-tailwindcss`. ESLint type-checked. `npm run check`
  (typecheck + lint + format:check + test) must pass before every commit.
- Pure logic in `lib/` with unit tests; UI components small and dumb.
- UI copy in English; invoice field labels keep the Dominican terms
  (RNC, NCF, ITBIS). Money shown as `RD$ 1,248.50`.
- Commit per phase. Never commit `.env.local`. Fixtures ARE committed
  (they are synthetic).

## Dominican invoice domain (for prompts and validation)

- **RNC**: 9 digits (companies). **Cédula**: 11 digits (people). May appear
  with dashes; normalize to digits.
- **NCF**: comprobante fiscal number, 1 letter + 10 digits (`B0100000123`;
  series B01 crédito fiscal, B02 consumo, B14 regímenes especiales, B15
  gubernamental) or e-CF: `E` + 2-digit type + 10 digits (`E310000000001`).
- **ITBIS**: 18% VAT on taxable base. Some items are exempt (`exento`).
  Rule: `itbis ≈ 0.18 × taxable_subtotal` (tolerance RD$1); `total ≈ subtotal
− discount + itbis`; `Σ line totals ≈ subtotal`.
- Dates commonly `dd/mm/yyyy`. Currency RD$ (sometimes `$` meaning pesos).

## Hard rules

- Only `image/jpeg|png|webp` and `application/pdf`, max 5 MB, checked
  server-side before any API call. Rate limit on `/api/extract`.
- `tool_choice` forced to `extract_invoice`; parse with zod; on failure one
  retry with the validation error, then a clear error to the UI.
- Validation never auto-corrects values; it flags them (`ok | warning` with
  reason). The human decides.
- Evals use only the synthetic fixtures; report accuracy honestly, including
  failures. `npm run eval` never runs in CI (costs API tokens).

## Done means

`npm run check` green · `npm run fixtures` reproducible (30 invoices × pdf,
png, json) · 4 samples work in the UI with no warnings · bad file rejected
without API call · `evals/report.md` committed with per-field accuracy ·
deployed on Vercel · README with eval table and screenshots · CI green.
