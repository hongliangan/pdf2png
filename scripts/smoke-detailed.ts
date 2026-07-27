// Dump first N paths from the real PDF to inspect what the parser actually
// extracts. Helps diagnose "rendered output doesn't match" reports.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parsePdf } from '../lib/pdf-parser';

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const result = await parsePdf(ab);

  console.log('page:', result.page);
  console.log('total paths:', result.paths.length);

  const sample = result.paths.slice(0, 5);
  for (const p of sample) {
    console.log('---');
    console.log('id:', p.id);
    console.log('color:', p.originalColor);
    console.log('strokeWidth:', p.strokeWidth);
    console.log('bbox:', p.bbox);
    console.log('d length:', p.d.length, 'chars');
    console.log('d (first 100):', p.d.slice(0, 100));
  }

  // Stroke-width distribution
  const widths: Record<number, number> = {};
  for (const p of result.paths) {
    widths[p.strokeWidth] = (widths[p.strokeWidth] ?? 0) + 1;
  }
  console.log('---');
  console.log('stroke-width distribution:', widths);

  // Bbox span — are paths spanning the whole page?
  const minXs = result.paths.map((p) => p.bbox.minX);
  const maxXs = result.paths.map((p) => p.bbox.maxX);
  console.log(
    'X range across all paths:',
    Math.min(...minXs),
    '→',
    Math.max(...maxXs),
  );

  // Render the SVG locally so we can see what it looks like
  const { buildEditorSvg } = await import('../lib/exporter');
  const svg = buildEditorSvg({
    page: result.page,
    paths: result.paths,
    textBoxes: [],
  });
  console.log('---');
  console.log('SVG length:', svg.length, 'chars');
  console.log('First 200 chars of SVG:', svg.slice(0, 200));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
