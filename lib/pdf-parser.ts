// PDF → PdfPath[] extractor.
//
// Walks the page's raw operator list (fnArray/argsArray). Modern PDFs (4.x style)
// batch geometry into a single `constructPath` op followed by separate
// `stroke` / `fillStroke` paint ops; older PDFs emit inline moveTo/lineTo
// + paintStrokePath. We support both.
//
// CRITICAL — coordinate transforms: each `transform` op updates the page's
// Current Transformation Matrix (CTM). A road drawn via
//   save / transform [a,0,0,d,e,f] / constructPath(0,0,...) / stroke / restore
// appears visually at world-space (a*x+e, d*y+f), not at user-space (x, y).
// Our parser tracks the CTM as a 6-element affine and applies it to every
// geometry op (moveTo/lineTo/curve/rect) so the resulting `d` is in
// world-space — what SVG renders.
//
// CRITICAL — clipping: each `clip` op activates a clip region defined by the
// just-constructed path. Subsequent strokes are clipped to that region until
// the matching `restore` (which in PDF semantics pops the entire graphics
// state including the clip). We capture each clip region as an axis-aligned
// bbox (good enough for the rectangles CUBE-style traffic PDFs use) and
// register it on every subsequent path so the SVG emits `<clipPath>` defs.
//
// Each sub-op is accumulated into an SVG "d" string. When we hit a paint op,
// we snapshot the d as one PdfPath — but only if its stroke color matches one
// of the 4 legend colors. Anything else (black text, gray borders, image fills)
// is silently dropped, which is how the CUBE logo and footer get stripped.
//
// All coordinates are Y-flipped at emission time so the resulting SVG uses
// a plain top-left <svg viewBox="0 0 W H"> without runtime transforms.

import * as pdfjsLib from 'pdfjs-dist';
import {
  moveToSegment,
  lineToSegment,
  curveToSegment,
  rectangleSegment,
  closePathSegment,
  bboxFromD,
} from '@/lib/svg-renderer';
import { normalizeStrokeColor } from '@/lib/constants';
import type { ParseResult, PdfPath, BBox, PathId } from '@/lib/types';

type OpsIndex = Record<string, number>;
const OPS = pdfjsLib.OPS as OpsIndex;

const strokeSetterOp = OPS.setStrokeRGBColor;
const lineWidthOp = OPS.setLineWidth;
const moveOp = OPS.moveTo;
const lineOp = OPS.lineTo;
const curveOps = [OPS.curveTo, OPS.curveTo2, OPS.curveTo3].filter(
  (v): v is number => typeof v === 'number',
);
const rectOp = OPS.rectangle;
const closeOp = OPS.closePath;
const constructOp = OPS.constructPath;
const transformOp = OPS.transform;
const saveOp = OPS.save;
const restoreOp = OPS.restore;
const clipOp = OPS.clip;
const endPathOp = OPS.endPath;
// Paint ops that emit stroke (and may also fill). We snapshot the d on each.
const strokePaintOps = [
  OPS.stroke,
  OPS.closeStroke,
  OPS.fillStroke,
  OPS.EOFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
].filter((v): v is number => typeof v === 'number');

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  if (typeof window !== 'undefined') {
    // Use the public-folder worker. The file is placed at
    // public/pdf.worker.min.mjs by scripts/copy-pdf-worker.mjs (postinstall)
    // and mirrored into .next/standalone/public/ by
    // scripts/copy-standalone-assets.mjs (build:next:stage). The
    // electron-builder extraResources config (public → .next/standalone/public)
    // re-mirrors it into the packaged app, so the URL is stable across dev,
    // standalone, and packaged builds — unlike `new URL('...', import.meta.url)`
    // which Turbopack rewrites to a content-hashed path that's fragile under
    // electron-builder's extraResources copy of nested .next/static/ on Windows.
    (pdfjsLib.GlobalWorkerOptions as { workerSrc: string }).workerSrc =
      '/pdf.worker.min.mjs';
    workerConfigured = true;
  }
}

// --- CTM helpers --------------------------------------------------------
// PDF transform matrix is stored as [a, b, c, d, e, f]: column-vector matrix
//   | a c e |
//   | b d f |
//   | 0 0 1 |
// applied as (x', y') = (a*x + c*y + e, b*x + d*y + f).

type Affine = readonly [number, number, number, number, number, number];

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

function compose(m1: Affine, m2: Affine): Affine {
  // Return m1·m2: applied as m1 · (m2 · p).
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyToPoint(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export async function parsePdf(input: File | ArrayBuffer): Promise<ParseResult> {
  ensureWorker();
  const data = input instanceof File ? await input.arrayBuffer() : input;
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;
  const pageWidth = viewport.width;

  const opList = await page.getOperatorList();
  const { fnArray, argsArray } = opList;

  const paths: PdfPath[] = [];
  const clipRects: BBox[] = [];
  let idCounter = 0;
  let d = '';
  let currentStroke: [number, number, number] = [0, 0, 0];
  let currentStrokeWidth = 1;
  let ctm: Affine = IDENTITY;
  const ctmStack: Affine[] = [];
  // Active clip index (index into clipRects) — non-null when paths should
  // carry a clipPath reference. Stack mirrors save/restore so nested clips
  // rewind correctly.
  let activeClipIndex: number | null = null;
  const clipStack: Array<number | null> = [];

  const flush = () => {
    const color = normalizeStrokeColor(currentStroke);
    const trimmed = d.trim();
    if (color && trimmed) {
      paths.push({
        id: makePathId(idCounter++),
        d: trimmed,
        originalColor: color,
        bbox: bboxFromD(trimmed),
        strokeWidth: currentStrokeWidth,
        clipIndex: activeClipIndex,
      });
    }
    d = '';
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === strokeSetterOp) {
      // pdfjs-dist decodes as either a Float32/Uint8 array of 3 RGB values.
      currentStroke = [
        Number(args[0]) / (args[0] > 1 ? 255 : 1),
        Number(args[1]) / (args[1] > 1 ? 255 : 1),
        Number(args[2]) / (args[2] > 1 ? 255 : 1),
      ];
      continue;
    }
    if (fn === lineWidthOp) {
      currentStrokeWidth = Number(args[0]) || 1;
      continue;
    }
    if (fn === saveOp) {
      ctmStack.push(ctm);
      clipStack.push(activeClipIndex);
      continue;
    }
    if (fn === restoreOp) {
      const prev = ctmStack.pop();
      if (prev) ctm = prev;
      const prevClip = clipStack.pop();
      activeClipIndex = prevClip === undefined ? null : prevClip;
      continue;
    }
    if (fn === clipOp) {
      // The just-constructed `d` is the clip region. Capture its bbox, push
      // onto the clip stack, but DO NOT flush it as a stroked path. The
      // clip-region geometry is consumed here.
      const trimmed = d.trim();
      const bbox = bboxFromD(trimmed);
      clipRects.push(bbox);
      activeClipIndex = clipRects.length - 1;
      d = '';
      continue;
    }
    if (fn === endPathOp) {
      // endPath closes the current path WITHOUT stroking. Discard any
      // pending `d` (it's the boundary of a clip region or an unused shape).
      d = '';
      continue;
    }
    if (fn === transformOp) {
      // args = [a, b, c, d, e, f]
      const m: Affine = [
        Number(args[0]),
        Number(args[1]),
        Number(args[2]),
        Number(args[3]),
        Number(args[4]),
        Number(args[5]),
      ];
      ctm = compose(m, ctm);
      continue;
    }
    if (fn === constructOp) {
      // Modern pdfjs-dist: args = [subOpsArray, subArgsArray, bboxCache?]
      const subOps = (args[0] ?? []) as number[];
      const subArgs = (args[1] ?? []) as number[];
      let j = 0;
      for (const subOp of subOps) {
        if (subOp === moveOp) {
          const [x, y] = applyToPoint(ctm, Number(subArgs[j]), Number(subArgs[j + 1]));
          d += moveToSegment({ x, y }, pageHeight);
          j += 2;
        } else if (subOp === lineOp) {
          const [x, y] = applyToPoint(ctm, Number(subArgs[j]), Number(subArgs[j + 1]));
          d += lineToSegment({ x, y }, pageHeight);
          j += 2;
        } else if (curveOps.includes(subOp)) {
          const [x1, y1] = applyToPoint(ctm, Number(subArgs[j]), Number(subArgs[j + 1]));
          const [x2, y2] = applyToPoint(ctm, Number(subArgs[j + 2]), Number(subArgs[j + 3]));
          const [x3, y3] = applyToPoint(ctm, Number(subArgs[j + 4]), Number(subArgs[j + 5]));
          d += curveToSegment([x1, y1, x2, y2, x3, y3], pageHeight);
          j += 6;
        } else if (subOp === rectOp) {
          const [x, y] = applyToPoint(ctm, Number(subArgs[j]), Number(subArgs[j + 1]));
          const w = Number(subArgs[j + 2]);
          const h = Number(subArgs[j + 3]);
          // Apply scale-only part of CTM to width/height for the rect's
          // outline. (Rotation isn't a case the real PDFs use; for pure
          // scale+translate this is exact.)
          const sx = Math.hypot(ctm[0], ctm[1]);
          const sy = Math.hypot(ctm[2], ctm[3]);
          d += rectangleSegment(
            { x, y, w: w * sx, h: h * sy },
            pageHeight,
          );
          j += 4;
        } else if (subOp === closeOp) {
          d += closePathSegment();
        }
      }
      continue;
    }
    if (fn === moveOp) {
      const [x, y] = applyToPoint(ctm, Number(args[0]), Number(args[1]));
      d += moveToSegment({ x, y }, pageHeight);
      continue;
    }
    if (fn === lineOp) {
      const [x, y] = applyToPoint(ctm, Number(args[0]), Number(args[1]));
      d += lineToSegment({ x, y }, pageHeight);
      continue;
    }
    if (curveOps.includes(fn)) {
      const [x1, y1] = applyToPoint(ctm, Number(args[0]), Number(args[1]));
      const [x2, y2] = applyToPoint(ctm, Number(args[2]), Number(args[3]));
      const [x3, y3] = applyToPoint(ctm, Number(args[4]), Number(args[5]));
      d += curveToSegment([x1, y1, x2, y2, x3, y3], pageHeight);
      continue;
    }
    if (fn === rectOp) {
      const [x, y] = applyToPoint(ctm, Number(args[0]), Number(args[1]));
      const w = Number(args[2]);
      const h = Number(args[3]);
      const sx = Math.hypot(ctm[0], ctm[1]);
      const sy = Math.hypot(ctm[2], ctm[3]);
      d += rectangleSegment(
        { x, y, w: w * sx, h: h * sy },
        pageHeight,
      );
      continue;
    }
    if (fn === closeOp) {
      d += closePathSegment();
      continue;
    }
    if (strokePaintOps.includes(fn)) {
      flush();
      continue;
    }
    // Ignore everything else (text, images, etc.)
  }

  return {
    page: { width: pageWidth, height: pageHeight },
    paths,
    clipRects,
  };
}

function makePathId(n: number): PathId {
  return `p-${n}` as PathId;
}
