// Inspect args shape for constructPath at op 59 (the one PDF.js emits after
// a clip op in 无项目负荷度4.pdf).

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const OPS = pdfjsLib.OPS as Record<string, number>;

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const doc = await pdfjsLib.getDocument({ data: ab }).promise;
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();

  // ops 53..62 — including clip at op 55
  for (let i = 53; i <= 62; i++) {
    const fn = opList.fnArray[i];
    const name = Object.entries(OPS).find(([, v]) => v === fn)?.[0] ?? `op_${fn}`;
    console.log(`op ${i}: ${name}`);
    console.log('  args[0]:', JSON.stringify(opList.argsArray[i]?.[0]));
    console.log('  args[1]:', JSON.stringify(opList.argsArray[i]?.[1]));
    if (name === 'transform') console.log('  (transform matrix)');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
