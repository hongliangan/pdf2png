// Dump transform ops to confirm: roads are drawn near origin in user-space
// and translated by transforms.

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

  // First 20 transform ops
  let n = 0;
  for (let i = 0; i < opList.fnArray.length && n < 20; i++) {
    if (opList.fnArray[i] === OPS.transform) {
      console.log(`transform #${n}: op ${i} args:`, opList.argsArray[i]);
      n++;
    }
  }

  // Look at the FULL pattern of: save → transform → color → constructPath → stroke → restore
  console.log('\nDetailed pattern: show all ops in one section');
  let sectionStart = -1;
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.save && sectionStart === -1) {
      sectionStart = i;
    }
    if (fn === OPS.restore && sectionStart !== -1) {
      console.log(`section ops ${sectionStart}..${i}: length=${i - sectionStart + 1}`);
      for (let j = sectionStart; j <= i; j++) {
        const f = opList.fnArray[j];
        const name = Object.entries(OPS).find(([, v]) => v === f)?.[0] ?? `op_${f}`;
        const args = opList.argsArray[j];
        let preview = '';
        if (Array.isArray(args)) {
          if (args.length <= 6) preview = JSON.stringify(args);
          else preview = `[len=${args.length}, head=${JSON.stringify(args.slice(0, 4))}]`;
        } else {
          preview = JSON.stringify(args);
        }
        console.log(`  op ${j}: ${name}  ${preview}`);
      }
      sectionStart = -1;
      break; // just one section
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
