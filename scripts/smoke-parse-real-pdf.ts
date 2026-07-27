// One-off smoke test: parses the real sample PDF (无项目负荷度4.pdf) and
// reports path counts + color distribution. Run with:
//   npx tsx scripts/smoke-parse-real-pdf.ts
//
// Not part of the regular test suite — exists to verify the parser against
// the production input before investing in E2E.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parsePdf } from '../lib/pdf-parser';

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  // pdfjs-dist in Node needs a fresh ArrayBuffer (not a Node Buffer view)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const result = await parsePdf(ab);

  console.log('page:', result.page);
  console.log('total paths:', result.paths.length);

  const counts: Record<string, number> = {};
  for (const p of result.paths) {
    counts[p.originalColor] = (counts[p.originalColor] ?? 0) + 1;
  }
  console.log('color distribution:', counts);

  if (result.paths.length < 100) {
    console.error('FAIL: expected ≥100 paths; got', result.paths.length);
    process.exit(1);
  }
  for (const p of result.paths) {
    if (!['#FF0000', '#0000FF', '#00FF00', '#00FFFF'].includes(p.originalColor)) {
      console.error('FAIL: path with non-legend color leaked:', p.originalColor);
      process.exit(1);
    }
  }
  console.log('OK: ≥100 paths, all in the 4 legend colors.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});