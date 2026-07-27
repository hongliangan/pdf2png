// Look at how clip / endPath are interleaved with stroke to understand what
// they clip.

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

  // Show first 3 sections where clip is used
  let found = 0;
  for (let i = 0; i < opList.fnArray.length && found < 3; i++) {
    if (opList.fnArray[i] === OPS.clip) {
      console.log(`clip at op ${i}; surrounding ops:`);
      const start = Math.max(0, i - 4);
      const end = Math.min(opList.fnArray.length, i + 8);
      for (let j = start; j < end; j++) {
        const fn = opList.fnArray[j];
        const name = Object.entries(OPS).find(([, v]) => v === fn)?.[0] ?? `op_${fn}`;
        const args = opList.argsArray[j];
        const marker = j === i ? '>' : ' ';
        let preview = '';
        if (Array.isArray(args) && args.length <= 6) preview = JSON.stringify(args);
        else if (Array.isArray(args)) preview = `[len=${args.length}]`;
        else preview = String(args);
        console.log(`${marker} ${j}: ${name} ${preview.slice(0, 80)}`);
      }
      found++;
      console.log();
    }
  }

  console.log('Counts:');
  const counts: Record<string, number> = {};
  for (const fn of opList.fnArray) {
    const name = Object.entries(OPS).find(([, v]) => v === fn)?.[0] ?? `op_${fn}`;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  console.log(`  clip: ${counts['clip']}`);
  console.log(`  endPath: ${counts['endPath']}`);
  console.log(`  stroke: ${counts['stroke']}`);
  console.log(`  fill: ${counts['fill'] ?? counts['fillStroke']}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
