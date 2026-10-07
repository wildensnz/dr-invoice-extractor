# Plan: DR Invoice Extractor — facturas dominicanas a datos estructurados

## Contexto

Tercer proyecto de IA del portafolio. Una app web donde subes la foto o el PDF de una factura dominicana y obtienes sus datos en JSON (RNC, NCF, fecha, emisor, ITBIS, totales y líneas), con una pantalla para revisar y corregir, y un set de pruebas que mide qué tan bien extrae. Muestra visión multimodal, salidas estructuradas, validación con reglas de negocio locales y **evals**, que es lo que más diferencia a un AI Engineer de alguien que solo llama a una API.

Decisiones tomadas:

- Carpeta `D:\dr-invoice-extractor`, repo `wildensnz/dr-invoice-extractor` (coincide con el README de perfil).
- Facturas de prueba **inventadas y generadas por script**: 30 facturas ficticias con 3 diseños distintos, en PDF y PNG, cada una con su JSON de valores correctos. Nada real.
- **Sin base de datos.** Todo ocurre en memoria: subir, extraer, revisar, descargar JSON.
- Stack: Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Anthropic SDK (imagen y PDF como entrada; salida estructurada forzando una tool) + zod + Vitest + Playwright (solo para generar las facturas de prueba). Mismas convenciones que los otros repos.

## Qué hace el demo

1. Arrastras una factura (JPG/PNG/PDF, máx. 5 MB) o eliges una de las de ejemplo.
2. La API la manda a Claude con una **tool `extract_invoice`** cuyo schema es el JSON que queremos; Claude está obligado a responder llamando a esa tool, así la salida siempre es JSON válido.
3. Un **validador** aplica reglas dominicanas: formato de RNC (9 dígitos) o cédula (11), formato de NCF (letra + 10 dígitos, p. ej. `B0100000123`, o e-CF `E31...`), ITBIS ≈ 18 % de la base gravada, subtotal + ITBIS ≈ total, suma de líneas ≈ subtotal. Cada regla marca el campo como `ok` o `warning` con un motivo.
4. La **pantalla de revisión** muestra la imagen a la izquierda y el formulario a la derecha: campos con alerta en ámbar, líneas editables, totales recalculados al editar. Botón "Descargar JSON".
5. `npm run eval` extrae las 30 facturas de prueba y reporta precisión por campo (RNC, NCF, fecha, total, ITBIS, nº de líneas) y global. El número va al README.

## Estructura del proyecto

```
dr-invoice-extractor/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   └── api/extract/route.ts      # POST multipart -> { invoice, checks, usage }
├── components/
│   ├── upload-dropzone.tsx       # drag & drop + ejemplos
│   ├── invoice-preview.tsx       # imagen o PDF (primera página) con zoom
│   ├── review-form.tsx           # campos + alertas + líneas editables
│   ├── line-items-table.tsx, field.tsx
│   └── ui/                       # shadcn: button, input, card, badge, table, alert, skeleton
├── lib/
│   ├── schema.ts                 # zod: Invoice { issuer{name,rnc}, customer?, ncf, date, currency, items[], subtotal, itbis, total }
│   ├── extract.ts                # llama a Claude con tool extract_invoice (tool_choice forzado)
│   ├── validate.ts               # reglas RNC/NCF/ITBIS/totales -> checks[]
│   ├── files.ts                  # tipo/tamaño permitidos, base64, media type
│   ├── rate-limit.ts
│   └── examples.ts               # 4 facturas de ejemplo servidas desde /public/samples
├── fixtures/
│   ├── generate.ts               # genera 30 facturas: datos deterministas + 3 plantillas HTML -> PDF y PNG (Playwright)
│   ├── templates/{classic,modern,thermal}.html
│   └── invoices/0001.pdf, 0001.png, 0001.json ...
├── evals/
│   ├── run.ts                    # extrae todas las fixtures, compara con el JSON, imprime tabla de precisión
│   └── report.md                 # última corrida (se commitea)
├── tests/
│   ├── validate.test.ts          # cada regla, casos borde (NCF viejo/e-CF, exentos de ITBIS)
│   └── schema.test.ts
├── .github/workflows/ci.yml
├── .env.example, README.md, docs/screenshots/
```

Env: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

## Fases

### Fase 0 — Preparación (tú)

- Crear `D:\dr-invoice-extractor` con `CLAUDE.md` y `PLAN.md`; repo público vacío en GitHub.
- `.env.local` con `ANTHROPIC_API_KEY`.

### Fase 1 — Scaffold

- `create-next-app` (TS, Tailwind, App Router, sin `src/`), shadcn, prettier/eslint/vitest como los otros repos, scripts `check`. Commit.

### Fase 2 — Schema, validación y facturas de prueba

- `lib/schema.ts` con zod y `zod-to-json-schema` para la tool.
- `lib/validate.ts` + tests (es la parte "de negocio" que vas a explicar en entrevistas).
- `fixtures/generate.ts`: datos con semilla fija (razones sociales, RNC válidos ficticios, NCF, 1–8 líneas, algunos exentos de ITBIS, 2 con descuento), 3 plantillas HTML (factura formal, factura moderna, ticket térmico estrecho), render a PDF y PNG con Playwright; guarda el JSON esperado. `npm run fixtures`. Copiar 4 a `public/samples`.

### Fase 3 — Extracción

- `lib/extract.ts`: construye el mensaje con la imagen (`image` base64) o el PDF (`document` base64), system prompt corto con el contexto dominicano (qué es NCF, RNC, ITBIS 18 %, formatos de fecha y moneda RD$), `tools: [extract_invoice]`, `tool_choice: { type: 'tool', name: 'extract_invoice' }`, `max_tokens` acotado. Parsea con zod; si falla, un reintento con el error en el prompt.
- `app/api/extract/route.ts`: multipart, `lib/files.ts` (jpg/png/webp/pdf, ≤ 5 MB), rate limit, devuelve `{ invoice, checks, usage: { inputTokens, outputTokens, ms } }`.

### Fase 4 — UI

- Dropzone con 4 ejemplos; estado de carga con skeleton "Leyendo la factura…".
- Vista dividida: previsualización + `review-form`. Campos con `warning` en ámbar con tooltip del motivo; totales recalculados al editar líneas; badge de tokens y ms; "Descargar JSON" y "Nueva factura".
- Móvil: apilado (imagen arriba, formulario abajo).

### Fase 5 — Evals

- `evals/run.ts`: por cada fixture, extrae y compara: campos exactos (RNC, NCF, fecha, nº de líneas) y numéricos con tolerancia ±1 peso (subtotal, ITBIS, total). Imprime tabla por campo y global, en PDF vs PNG, y coste total en tokens. Guarda `evals/report.md`.
- Ajustar el prompt hasta un resultado razonable; documentar en README el antes/después si hubo mejora.

### Fase 6 — Pulido y publicación

- CI (typecheck, lint, test; el eval no corre en CI porque gasta API).
- README en inglés: GIF/captura, "How it works", tabla de reglas de validación, **resultados del eval** con la tabla, límites y privacidad (nada se guarda), cómo correrlo.
- Deploy en Vercel con `ANTHROPIC_API_KEY`. Capturas en `docs/screenshots/`.

## Verificación

- `npm run check` verde.
- `npm run fixtures` genera 30×(pdf, png, json) reproducibles (misma semilla → mismos archivos).
- Subir una factura de ejemplo: JSON correcto, sin alertas. Subir una con ITBIS mal calculado (editar una fixture a mano): alerta ámbar en ITBIS con el motivo.
- Subir un archivo de 8 MB o un `.txt` → error claro, sin llamada a la API.
- `npm run eval`: tabla de precisión; objetivo orientativo ≥ 90 % en total y NCF.
- Deploy en Vercel: probar desde el teléfono con una foto de pantalla de una fixture.
- CI verde en el primer push.
