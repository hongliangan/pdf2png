// Dump paths in the bottom-left quadrant (the "messy" region the user reports).

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
  console.log('=== paths entirely in BL quadrant (x<W/2, y<H/2) ===');
  let count = 0;
  for (const p of result.paths) {
    const cx = (p.bbox.minX + p.bbox.maxX) / 2;
    const cy = (p.bbox.minY + p.bbox.maxY) / 2;
    if (cx < W / 2 && cy < H / 2 && count < 30) {
      console.log(`  ${p.id} ${p.originalColor} bbox=${JSON.stringify(p.bbox)} d=${p.d.slice(0, 100)}`);
      count++;
    }
  }

  console.log(`\n...total in BL: ${count} (showing first 30)`);
  console.log('\n=== paths with bbox left-edge at negative x (going off-page left) ===');
  let n = 0;
  for (const p of result.paths) {
    if (p.bbox.minX < 0 && n < 10) {
      console.log(`  ${p.id} ${p.originalColor} bbox=${JSON.stringify(p.bbox)} d=${p.d.slice(0, 100)}`);
      n++;
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
