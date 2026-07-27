<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# pdf2png — Project Notes

## What this is
A Next.js + TypeScript web app that turns traffic-modeling PDF road-network maps
into an interactive editor: each PDF path becomes an individually clickable line
that can be recolored (one of 4 fixed colors: red / blue / green / cyan). Users
can add editable text boxes on top, then export the result as PNG or JPG at
72 / 150 / 300 DPI.

## Stack
- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript 5 (strict)
- Tailwind CSS v4 (CSS-variable theming via `@theme inline`)
- shadcn/ui (style: `base-nova`, base: `@base-ui/react` — not Radix)
- pdfjs-dist 4.x for PDF vector extraction
- Zustand 5 for state
- Vitest + React Testing Library + jsdom (unit + integration)
- Playwright (E2E)

## Project Structure
```
app/                      # routes (home placeholder; editor route in M3+)
components/
  ui/                     # shadcn primitives (generated)
  editor/                 # editor components (M3+)
lib/
  utils.ts                # cn() helper
  types.ts                # domain types (M2)
  pdf-parser.ts           # pdfjs-dist OPS parser (M2)
  svg-renderer.ts         # OPS → SVG "d" (M2)
  exporter.ts             # SVG → PNG/JPG (M9)
  editor-store.ts         # Zustand store (M3+)
  undo-store.ts           # snapshot history (M8)
  ops.ts                  # pure mutator helpers
  constants.ts            # 4 colors, fonts, sizes, DPIs
public/pdf.worker.min.mjs # pdfjs worker (copied via postinstall)
__tests__/                # unit + integration + e2e
scripts/copy-pdf-worker.mjs # postinstall script
```

## Conventions
- File size: keep files <800 lines; split if approaching the limit.
- TDD: write failing test → make it pass → refactor. 80% coverage gate.
- PDF path coordinates: parsed at PDF user-space units, Y-flipped once at parse time
  so the SVG uses a plain top-left `<svg viewBox="0 0 W H">` without transforms.
- Color normalization: only paths whose stroke normalizes to one of the 4 legend
  colors are kept; black/gray/anything else is dropped (this is how the CUBE
  logo and footer text get stripped).

## Common Commands
- `npm run dev`         — Next.js dev server
- `npm test`            — Vitest (unit + integration)
- `npm run coverage`    — Vitest + v8 coverage (80% gate)
- `npm run e2e`         — Playwright (auto-starts dev server)
- `npm run lint`        — ESLint