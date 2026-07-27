// Editor → PNG/JPG exporter — pure SVG builder.
//
// Rasterization (sharp) lives in the /api/export route handler because sharp
// depends on node:child_process and can't be bundled into client components.
// Clients call `buildEditorSvg()` here, then POST the result to /api/export
// to receive a PNG/JPEG buffer.
//
// Sharp treats SVG units as PDF/PostScript points: 72 units per inch. So a
// 200×200 SVG at density=72 rasterizes to 200×200 px (1:1) and at
// density=300 it rasterizes to 200*300/72 ≈ 833 px on each axis.

import type { PdfPath, TextBox, FixedColor, BBox } from '@/lib/types';

export interface ExportInput {
  page: { width: number; height: number };
  paths: PdfPath[];
  colorOverrides?: Record<string, FixedColor | null | undefined>;
  textBoxes: TextBox[];
  // Clip regions captured by the parser (from PDF clip ops). Optional for
  // callers that don't have them (e.g. unit tests with synthetic data).
  clipRects?: BBox[];
}

export const SVG_UNITS_PER_INCH = 72;

/**
 * Escape characters that have special meaning in XML element content.
 * Used for text fragments rendered into native SVG <text> elements.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render a single textbox as native SVG (rotated `<text>` content only).
 * librsvg — the SVG renderer inside sharp — does NOT support
 * `<foreignObject>` (HTML embedded in SVG), so we can't use the browser's
 * DOM-backed foreignObject trick here; native SVG primitives are what
 * librsvg actually draws.
 *
 * No border / outline is rendered. The editor shows a thin gray outline
 * via CSS (`outline-1 outline-transparent hover:outline-gray-300`), but
 * the user explicitly asked for no rectangle around the text in the
 * export — text floats freely over the road network.
 *
 * Text auto-wraps inside the box width by splitting at `\n` and per-
 * character wrapping when a single word exceeds the box.
 *
 * Vertical centering: we use `dy="0.4em"`. librsvg positions the
 * alphabetic baseline at y by default; the glyph's visual center sits
 * ~0.4 em above the baseline (typical "x-height + half ascender" for
 * most fonts), so dy=0.4em puts the visible center at y. This matches
 * what `display: flex; align-items: center` does in the editor.
 * (We don't use `dominant-baseline="middle"` — librsvg's support for it
 * is brittle and renders text HIGHER than expected for many fonts,
 * including Chinese.)
 */
function buildTextBoxSvg(tb: TextBox): string {
  const cx = tb.x + tb.width / 2;
  const cy = tb.y + tb.height / 2;
  const safeText = xmlEscape(tb.text);
  const lines = wrapText(safeText, tb);
  const lineHeight = (tb.fontSize ?? 16) * 1.2;

  // Compute each line's y baseline directly so the BLOCK of text is
  // centered at (cx, cy). We can't use dy="0.4em" per line because dy
  // is independent per <text> — two lines would have their visual centers
  // at y[0]+0.05em and y[1]+0.05em, averaging y + 0.05em (still close to
  // target) BUT the entire block drifts DOWN by 0.05em relative to a
  // single-line label at the same cy. Using explicit baseline positions
  // (no dy) keeps the block centered regardless of line count.
  //
  // Empirical offset: librsvg + DejaVu Sans puts the visual glyph center
  // ~0.4 fontSize above the alphabetic baseline. So baseline_y =
  // visual_center_y + 0.4 * fontSize.
  const baselineOffset = (tb.fontSize ?? 16) * 0.4;
  const tspans = lines
    .map((line, i) => {
      // Line i's visual center sits at cy - (lines.length-1)/2 * lineHeight + i * lineHeight.
      const visualY =
        cy - ((lines.length - 1) * lineHeight) / 2 + i * lineHeight;
      const y = visualY + baselineOffset;
      const t = tb.text === '' ? '&#160;' : line;
      return (
        `<text x="${cx.toFixed(2)}" y="${y.toFixed(2)}" ` +
        `text-anchor="middle" ` +
        `font-family="${xmlEscape(tb.fontFamily)}" ` +
        `font-size="${tb.fontSize}" ` +
        `fill="${tb.color}"` +
        `>${t}</text>`
      );
    })
    .join('');

  // Wrap in a <g transform="rotate(...)"> so the text rotates around the
  // box's center, matching the editor's CSS `transform-origin: center`.
  return (
    `<g transform="rotate(${(tb.rotation ?? 0).toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})">` +
    tspans +
    `</g>`
  );
}

/**
 * Word-wrap that splits on `\n` and breaks long words. Approximate — we
 * can't actually measure glyph widths in librsvg without a font engine,
 * so character widths are estimated as ~0.55× fontSize per char in the
 * average font. Good enough for short annotation labels.
 */
function wrapText(safeText: string, tb: TextBox): string[] {
  if (safeText === '') return [''];
  const charW = (tb.fontSize ?? 16) * 0.55;
  const maxCharsPerLine = Math.max(
    1,
    Math.floor((tb.width - 8) / charW), // 4px padding each side
  );
  const out: string[] = [];
  for (const paragraph of safeText.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const ch of paragraph) {
      if (line.length + 1 > maxCharsPerLine) {
        out.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Serialize the editor state as a self-contained <svg> string. Safe to send
 * to /api/export, or to inject with `dangerouslySetInnerHTML` for screenshot.
 */
export function buildEditorSvg(input: ExportInput): string {
  const { page, paths, textBoxes } = input;
  const overrides = input.colorOverrides ?? {};
  const clipRects = input.clipRects ?? [];

  // SVG <defs> holds a <clipPath> per region the parser captured, named by
  // index so individual <path>s can reference them via clip-path="url(#cp-N)".
  const defs =
    clipRects.length === 0
      ? ''
      : `<defs>` +
        clipRects
          .map(
            (r, i) =>
              `<clipPath id="cp-${i}">` +
              `<rect x="${r.minX.toFixed(2)}" y="${r.minY.toFixed(2)}" ` +
              `width="${(r.maxX - r.minX).toFixed(2)}" ` +
              `height="${(r.maxY - r.minY).toFixed(2)}"/>` +
              `</clipPath>`,
          )
          .join('') +
        `</defs>`;

  const pathElements = paths
    .map((p) => {
      const stroke = overrides[p.id] ?? p.originalColor;
      const w = p.strokeWidth;
      const clip =
        p.clipIndex != null ? ` clip-path="url(#cp-${p.clipIndex})"` : '';
      return (
        `<path d="${p.d}" stroke="${stroke}" stroke-width="${w}" ` +
        `fill="none" stroke-linecap="round" stroke-linejoin="round"${clip}/>`
      );
    })
    .join('');
  const textElements = textBoxes.map(buildTextBoxSvg).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${page.width} ${page.height}" ` +
    `width="${page.width}" height="${page.height}">` +
    defs +
    `<rect width="100%" height="100%" fill="white"/>` +
    pathElements +
    textElements +
    `</svg>`
  );
}

/**
 * Client-side helper that POSTs an SVG to the server-side /api/export route
 * and returns a Blob ready for `URL.createObjectURL`. Centralized here so
 * components stay thin.
 */
export async function exportSvgToBlob(
  svg: string,
  format: 'png' | 'jpeg',
  dpi: number,
): Promise<Blob> {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ svg, format, dpi }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`export failed: ${err}`);
  }
  return res.blob();
}
