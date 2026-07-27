// Identify which paths are responsible for the messy edges — paths whose
// bbox extends outside the page bounds (after CTM).

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

  // Categorize paths by bbox overlap with page
  const inside = [];
  const partial = [];
  const outside = [];
  for (const p of result.paths) {
    const { minX, minY, maxX, maxY } = p.bbox;
    const overlaps =
      maxX > 0 && minX < W && maxY > 0 && minY < H;
    const fullyInside =
      minX >= 0 && minY >= 0 && maxX <= W && maxY <= H;
    if (fullyInside) inside.push(p);
    else if (overlaps) partial.push(p);
    else outside.push(p);
  }
  console.log('fully inside page:', inside.length);
  console.log('partially outside page:', partial.length);
  console.log('fully outside page:', outside.length);

  // Sample partial ones — these are the "messy edge" paths
  console.log('\nPARTIAL paths (bbox extends past edge):');
  for (const p of partial.slice(0, 12)) {
    console.log(`  ${p.id} ${p.originalColor} bbox=`,
      p.bbox, 'd=', p.d.slice(0, 60));
  }

  // Geometry of fully-inside rectangular paths (the legend keys in original)
  console.log('\nFULLY-INSIDE rectangular paths (smaller than 50x50):');
  let count = 0;
  for (const p of inside) {
    const w = p.bbox.maxX - p.bbox.minX;
    const h = p.bbox.maxY - p.bbox.minY;
    if (w < 50 && h < 50 && count < 10) {
      console.log(`  ${p.id} ${p.originalColor} bbox=`,
        p.bbox, 'd=', p.d.slice(0, 60));
      count++;
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
