// Extract embedded images from the PDF to verify whether the road network is
// raster (an image) vs vector (paths we should be parsing).

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const doc = await pdfjsLib.getDocument({ data: ab }).promise;
  const page = await doc.getPage(1);

  const imageNames = await page.getOperatorList();
  const OPS = pdfjsLib.OPS as Record<string, number>;
  const paintImageOp = OPS.paintImageXObject;

  // Walk operator list and grab image refs.
  const imgRefs: Set<string> = new Set();
  for (let i = 0; i < imageNames.fnArray.length; i++) {
    const fn = imageNames.fnArray[i];
    if (fn === paintImageOp) {
      const ref = imageNames.argsArray[i]?.[0];
      if (typeof ref === 'string') imgRefs.add(ref);
    }
  }
  console.log('image refs in page:', [...imgRefs]);

  for (const ref of imgRefs) {
    try {
      const img = await new Promise<any>((res, rej) => {
        // pdfjs's CommonJS image-cache API is awkward in ESM; use the simpler path.
        page.objs.get(ref, (x: any) => res(x));
      });
      if (img && img.data) {
        await writeFile(
          `scripts/_img-${ref}.bin`,
          Buffer.from(img.data),
        );
        console.log('saved scripts/_img-' + ref + '.bin  bytes=' + img.data.byteLength);
      }
    } catch (e) {
      console.error('image extract failed for', ref, e);
    }
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
