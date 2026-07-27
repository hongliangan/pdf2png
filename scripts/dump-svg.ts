// Generate PNG from the parsed real PDF so we can visually inspect what the
// parser actually produced vs. what the PDF actually looks like.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { parsePdf } from '../lib/pdf-parser';
import { buildEditorSvg } from '../lib/exporter';

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const result = await parsePdf(ab);

  console.log('total paths:', result.paths.length);

  // Quadrant distribution
  const quadrants = { tl: 0, tr: 0, bl: 0, br: 0, other: 0 };
  for (const p of result.paths) {
    const cx = (p.bbox.minX + p.bbox.maxX) / 2;
    const cy = (p.bbox.minY + p.bbox.maxY) / 2;
    const horiz = cx < result.page.width / 2 ? 'l' : 'r';
    const vert = cy < result.page.height / 2 ? 't' : 'b';
    const q = (vert + horiz) as 'tl' | 'tr' | 'bl' | 'br';
    quadrants[q] = (quadrants[q] ?? 0) + 1;
  }
  console.log('quadrant distribution:', quadrants);

  // Size bucket
  const sizeBuckets = { tiny: 0, small: 0, medium: 0, large: 0 };
  for (const p of result.paths) {
    const w = p.bbox.maxX - p.bbox.minX;
    const h = p.bbox.maxY - p.bbox.minY;
    const s = Math.max(w, h);
    if (s < 5) sizeBuckets.tiny++;
    else if (s < 20) sizeBuckets.small++;
    else if (s < 100) sizeBuckets.medium++;
    else sizeBuckets.large++;
  }
  console.log('size buckets (max side px):', sizeBuckets);

  // Sample a few "big" paths
  const big = result.paths
    .filter((p) => {
      const w = p.bbox.maxX - p.bbox.minX;
      const h = p.bbox.maxY - p.bbox.minY;
      return Math.max(w, h) > 20;
    })
    .slice(0, 5);
  console.log('paths with side > 20:', big.length);
  for (const p of big) {
    console.log('  ', p.id, p.originalColor, 'bbox=', p.bbox, 'd=', p.d.slice(0, 80));
  }

  // Also dump SVG for direct comparison
  const svg = buildEditorSvg({
    page: result.page,
    paths: result.paths,
    textBoxes: [],
  });
  await sharp(Buffer.from(svg), { density: 150 })
    .png()
    .toFile('scripts/_smoke-output.png');
  console.log('PNG output: scripts/_smoke-output.png');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
