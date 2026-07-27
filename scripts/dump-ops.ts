// Dump the OP distribution of the actual PDF to figure out why the road
// network isn't being captured.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const doc = await pdfjsLib.getDocument({ data: ab }).promise;
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();

  const OPS = pdfjsLib.OPS as Record<string, number>;
  const counts: Record<string, number> = {};
  for (const fn of opList.fnArray) {
    const name =
      Object.entries(OPS).find(([, v]) => v === fn)?.[0] ?? `op_${fn}`;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log('OP distribution:');
  for (const [name, count] of sorted.slice(0, 30)) {
    console.log(`  ${count.toString().padStart(5)} ${name}`);
  }

  // Sample a few argsArray entries to see what constructPath contains
  console.log('\nfirst 3 constructPath entries:');
  let n = 0;
  for (let i = 0; i < opList.fnArray.length && n < 3; i++) {
    if (opList.fnArray[i] === OPS.constructPath) {
      const args = opList.argsArray[i];
      const subOps = args[0];
      const subArgs = args[1];
      console.log(`op ${i}: ${subOps.length} subOps, ${subArgs.length} subArgs`);
      console.log('  subOps:', subOps.slice(0, 12).map((s: number) => Object.entries(OPS).find(([, v]) => v === s)?.[0] ?? s));
      console.log('  subArgs head:', subArgs.slice(0, 20));
      n++;
    }
  }

  // Show first 5 path-strokes too
  console.log('\nfirst 5 stroke ops (with args preview):');
  let s = 0;
  for (let i = 0; i < opList.fnArray.length && s < 5; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.stroke || fn === OPS.fillStroke) {
      console.log(`  op ${i} (${Object.entries(OPS).find(([, v]) => v === fn)?.[0]}):`, opList.argsArray[i]);
      s++;
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
