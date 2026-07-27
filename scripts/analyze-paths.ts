// Find paths whose bbox would be visually offset from where the user sees
// them — i.e., the path's stored bbox (after CTM) doesn't match the
// expected geometry.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parsePdf } from '../lib/pdf-parser';

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const result = await parsePdf(ab);
  const W = result.page.width;
  const H = result.page.height;

  // Paths whose bbox EXTENDS FAR outside the page (>50 px off any edge).
  // These are the most likely to be visually out of place or have
  // hit-area regions clipped at the viewport.
  const offscreen = result.paths.filter((p) => {
    const b = p.bbox;
    return (
      b.minX < -50 ||
      b.minY < -50 ||
      b.maxX > W + 50 ||
      b.maxY > H + 50
    );
  });
  console.log('paths with bbox extending >50 beyond page:', offscreen.length);

  // Paths whose bbox IS inside the page entirely — these should all be
  // reliably clickable if the hit-area is generous enough.
  const inside = result.paths.filter((p) => {
    const b = p.bbox;
    return b.minX >= 0 && b.minY >= 0 && b.maxX <= W && b.maxY <= H;
  });
  console.log('paths fully inside page:', inside.length);

  // Pick 10 random paths and look at their bboxes / d lengths.
  console.log('\n5 random paths:');
  const sample = result.paths.filter((_, i) => i % 70 === 0).slice(0, 5);
  for (const p of sample) {
    console.log(
      '  ',
      p.id,
      p.originalColor,
      'bbox=',
      p.bbox,
      'd-len:',
      p.d.length,
    );
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
