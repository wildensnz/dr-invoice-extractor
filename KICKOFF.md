# Cómo arrancar DR Invoice Extractor con Claude Code

Este proyecto es independiente: no necesita Neon ni los otros dos proyectos.

## Antes de abrir Claude Code (~10 min)

1. Crea la carpeta `D:\dr-invoice-extractor` y copia dentro `CLAUDE.md` y `PLAN.md`.
2. Crea el repo público y vacío `wildensnz/dr-invoice-extractor` en GitHub.
3. Crea `D:\dr-invoice-extractor\.env.local` con:
   ```
   ANTHROPIC_API_KEY=...
   ```

## Prompt de arranque (pégalo en Claude Code dentro de D:\dr-invoice-extractor)

```
Lee CLAUDE.md y PLAN.md. Vamos a construir el proyecto por fases, una a la vez.
Empieza por la Fase 1 (scaffold). Al terminar cada fase: corre `npm run check`,
haz commit, y dime en 3 líneas qué hiciste y qué sigue. No empieces la
siguiente fase hasta que yo te diga "siguiente".
```

## Prompts por fase

- `siguiente` → Fase 2 (schema, validación, facturas de prueba). Al terminar,
  abre `fixtures/invoices/` y mira varias facturas en PDF y PNG: deben verse
  como facturas dominicanas creíbles con 3 diseños distintos. Si alguna se ve
  rota, pídele que arregle la plantilla antes de seguir.
- `siguiente` → Fase 3 (extracción y API). Pídele que te explique en 5 líneas
  cómo fuerza la salida JSON con `tool_choice`: lo vas a contar en entrevistas.
- `siguiente` → Fase 4 (UI). Prueba los 4 ejemplos en el navegador y sube una
  foto de pantalla de una fixture desde el móvil.
- `siguiente` → Fase 5 (evals). Corre `npm run eval` tú mismo: gasta tokens
  (unas 60 llamadas). Mira `evals/report.md` y, si un campo sale bajo, pídele
  una mejora de prompt y vuelve a correr una vez. No busques el 100 %.
- `siguiente` → Fase 6 (CI, README, deploy).

## Al terminar

- Descripción y topics en GitHub: `nextjs`, `typescript`, `anthropic`,
  `claude`, `vision`, `structured-outputs`, `invoice-extraction`, `evals`,
  `dominican-republic`.
- Fíjalo en tu perfil. Con esto, los 3 proyectos de IA del README existen.
