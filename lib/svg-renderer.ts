import type { Point, BBox } from '@/lib/types';

// All emitters Y-flip coordinates: PDF uses bottom-left origin, SVG uses top-left.
// Inputs are PDF user-space units (no scaling); outputs are SVG "d" segments
// in the same coordinate space, ready to be placed inside <svg viewBox="0 0 W H">.

const FIXED = (n: number) => n.toFixed(2);

/** Flip a single Y coordinate relative to a page height in PDF user-space units. */
export function flipY(y: number, pageHeight: number): number {
  return pageHeight - y;
}

export function moveToSegment(p: Point, pageHeight: number): string {
  return `M${FIXED(p.x)} ${FIXED(flipY(p.y, pageHeight))} `;
}

export function lineToSegment(p: Point, pageHeight: number): string {
  return `L${FIXED(p.x)} ${FIXED(flipY(p.y, pageHeight))} `;
}

/**
 * Cubic bezier segment. pdfjs-dist's curveTo operators all produce a 6-number
 * argument list (cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y). The current point
 * is implicit (not in args).
 */
export function curveToSegment(args: readonly number[], pageHeight: number): string {
  const [cp1x, cp1y, cp2x, cp2y, ex, ey] = args;
  return `C${FIXED(cp1x)} ${FIXED(flipY(cp1y, pageHeight))} ` +
         `${FIXED(cp2x)} ${FIXED(flipY(cp2y, pageHeight))} ` +
         `${FIXED(ex)} ${FIXED(flipY(ey, pageHeight))} `;
}

export function rectangleSegment(
  args: { x: number; y: number; w: number; h: number },
  pageHeight: number,
): string {
  const { x, y, w, h } = args;
  const fy = flipY(y, pageHeight);
  // PDF rects grow upward (h is +up), but SVG grows downward. After the Y-flip
  // at the origin, the rect's top edge sits at SVG y = (pageHeight - y - h),
  // i.e., h units UP from the bottom. Use v-h to move upward in SVG.
  return `M${FIXED(x)} ${FIXED(fy)} ` +
         `h${FIXED(w)} v${FIXED(-h)} h${FIXED(-w)} Z `;
}

export function closePathSegment(): string {
  return 'Z ';
}

/**
 * Compute the axis-aligned bounding box of an SVG "d" string we emitted.
 * Supports M/L/C/h/v/Z commands (the ones we produce). Sufficient for
 * hit-testing and picker positioning; not a general SVG parser.
 */
export function bboxFromD(d: string): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;
  let hasPoint = false;
  // Both upper (M/L/C/Z) and lower (h/v) commands — we emit lowercase relative
  // moves for rectangles and uppercase absolute for line/bezier output.
  const tokens = d.match(/[MLChvZ]|[-+]?\d*\.?\d+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'M' || t === 'L') {
      cx = Number(tokens[++i]);
      cy = Number(tokens[++i]);
      track(cx, cy);
    } else if (t === 'C') {
      const x1 = Number(tokens[++i]), y1 = Number(tokens[++i]);
      const x2 = Number(tokens[++i]), y2 = Number(tokens[++i]);
      const x3 = Number(tokens[++i]), y3 = Number(tokens[++i]);
      track(x1, y1); track(x2, y2); track(x3, y3);
      cx = x3; cy = y3;
    } else if (t === 'h') {
      const dx = Number(tokens[++i]);
      cx += dx;
      track(cx, cy);
    } else if (t === 'v') {
      const dy = Number(tokens[++i]);
      cy += dy;
      track(cx, cy);
    } else if (t === 'Z') {
      // close does not add a new point
    } else if (typeof Number(t) === 'number' && !Number.isNaN(Number(t))) {
      // bare number — implies implicit lineto after M
      const n = Number(t);
      if (i + 1 < tokens.length) {
        const ny = Number(tokens[++i]);
        cx = n; cy = ny;
        track(cx, cy);
      }
    }
  }
  return hasPoint
    ? { minX, minY, maxX, maxY }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  function track(x: number, y: number) {
    hasPoint = true;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
}