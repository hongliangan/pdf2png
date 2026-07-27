// Quick experiment: parse the PDF but DON'T filter black paths, and see if
// the result looks like an actual road map.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const OPS = pdfjsLib.OPS as Record<string, number>;

async function main() {
  const pdfPath = resolve(process.cwd(), '无项目负荷度4.pdf');
  const buf = await readFile(pdfPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const doc = await pdfjsLib.getDocument({ data: ab }).promise;
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();
  const { fnArray, argsArray } = opList;
  const pageHeight = page.getViewport({ scale: 1 }).height;

  // Track the current color via setStrokeRGBColor + a stack for save/restore.
  let stroke: [number, number, number] = [0, 0, 0];
  let width = 1;
  const strokeStack: Array<{ s: typeof stroke; w: number }> = [];

  let d = '';
  const paths: Array<{ d: string; color: string; w: number; bbox: unknown }> = [];

  const flush = () => {
    const trimmed = d.trim();
    if (trimmed) {
      // Map to a display color. Black keeps as black (most-road-maps case).
      const hex = '#' + stroke.map((c) =>
        Math.round(Math.min(255, Math.max(0, c * 255)))
          .toString(16).padStart(2, '0')
      ).join('');
      // quick bbox
      const tokens = trimmed.match(/[MLh]|[-+]?\d*\.?\d+/g) ?? [];
      let cx = 0, cy = 0, mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === 'M' || t === 'L') {
          cx = Number(tokens[++i]); cy = Number(tokens[++i]);
          if (cx < mnX) mnX = cx; if (cx > mxX) mxX = cx;
          if (cy < mnY) mnY = cy; if (cy > mxY) mxY = cy;
        } else if (t === 'h') {
          cx += Number(tokens[++i]);
          if (cx < mnX) mnX = cx; if (cx > mxX) mxX = cx;
        } else if (t === 'v') {
          cy += Number(tokens[++i]);
          if (cy < mnY) mnY = cy; if (cy > mxY) mxY = cy;
        }
      }
      paths.push({ d: trimmed, color: hex, w: width, bbox: { mnX, mxX, mnY, mxY } });
    }
    d = '';
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === OPS.save) {
      strokeStack.push({ s: [...stroke] as typeof stroke, w: width });
    } else if (fn === OPS.restore) {
      const prev = strokeStack.pop();
      if (prev) { stroke = prev.s; width = prev.w; }
    } else if (fn === OPS.setStrokeRGBColor) {
      stroke = [
        Number(args[0]) / (args[0] > 1 ? 255 : 1),
        Number(args[1]) / (args[1] > 1 ? 255 : 1),
        Number(args[2]) / (args[2] > 1 ? 255 : 1),
      ];
    } else if (fn === OPS.setLineWidth) {
      width = Number(args[0]) || 1;
    } else if (fn === OPS.constructPath) {
      const subOps = (args[0] ?? []) as number[];
      const subArgs = (args[1] ?? []) as number[];
      let j = 0;
      for (const sOp of subOps) {
        if (sOp === OPS.moveTo) {
          d += `M${subArgs[j].toFixed(2)} ${(pageHeight - subArgs[j + 1]).toFixed(2)} `;
          j += 2;
        } else if (sOp === OPS.lineTo) {
          d += `L${subArgs[j].toFixed(2)} ${(pageHeight - subArgs[j + 1]).toFixed(2)} `;
          j += 2;
        } else if (sOp === OPS.curveTo || sOp === OPS.curveTo2 || sOp === OPS.curveTo3) {
          d += `C${subArgs[j].toFixed(2)} ${(pageHeight - subArgs[j + 1]).toFixed(2)} ` +
               `${subArgs[j + 2].toFixed(2)} ${(pageHeight - subArgs[j + 3]).toFixed(2)} ` +
               `${subArgs[j + 4].toFixed(2)} ${(pageHeight - subArgs[j + 5]).toFixed(2)} `;
          j += 6;
        } else if (sOp === OPS.rectangle) {
          const x = subArgs[j], y = subArgs[j + 1], w = subArgs[j + 2], h = subArgs[j + 3];
          const fy = pageHeight - y;
          d += `M${x.toFixed(2)} ${fy.toFixed(2)} h${w.toFixed(2)} v${(-h).toFixed(2)} h${(-w).toFixed(2)} Z `;
          j += 4;
        } else if (sOp === OPS.closePath) {
          d += 'Z ';
        }
      }
    } else if (fn === OPS.stroke || fn === OPS.closeStroke) {
      flush();
    }
  }

  console.log('total paths (incl black):', paths.length);
  const counts: Record<string, number> = {};
  for (const p of paths) counts[p.color] = (counts[p.color] ?? 0) + 1;
  console.log('all colors:', counts);

  // Build SVG
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="595.22" height="842" viewBox="0 0 595.22 842">` +
    `<rect width="100%" height="100%" fill="white"/>` +
    paths.map((p) =>
      `<path d="${p.d}" stroke="${p.color}" stroke-width="${p.w}" fill="none"/>`
    ).join('') +
    `</svg>`;

  await sharp(Buffer.from(svg), { density: 150 })
    .png()
    .toFile('scripts/_with-black.png');
  console.log('PNG: scripts/_with-black.png');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
