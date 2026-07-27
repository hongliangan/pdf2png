import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdfjs-dist BEFORE importing the module under test.
vi.mock('pdfjs-dist', () => {
  // Match pdfjs-dist 4.x opcodes so the parser logic exercises both modern
  // (constructPath + stroke) and legacy (moveTo/lineTo + paintStrokePath)
  // code paths against the same numeric values.
  const OPS = {
    setStrokeRGBColor: 58,
    setLineWidth: 12,
    moveTo: 13,
    lineTo: 14,
    curveTo: 15,
    curveTo2: 16,
    curveTo3: 17,
    closePath: 18,
    rectangle: 19,
    stroke: 20,
    // Legacy aliases — some tests still reference paintStrokePath for
    // backward compatibility with the older pdf.js opcode names.
    paintStrokePath: 20,
    paintFillStrokePath: 24,
    paintPath: 22,
    closeStroke: 21,
    fill: 22,
    eoFill: 23,
    fillStroke: 24,
    eoFillStroke: 25,
    closeFillStroke: 26,
    closeEOFillStroke: 27,
    constructPath: 91,
  };
  return {
    OPS,
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(),
  };
});

import { parsePdf } from '@/lib/pdf-parser';
import * as pdfjsLib from 'pdfjs-dist';

const OPS = (pdfjsLib as unknown as { OPS: Record<string, number> }).OPS;

interface MockPageOpts {
  width?: number;
  height?: number;
  ops: Array<{ fn: number; args: unknown[] }>;
}

function buildMockPage({ width = 595.22, height = 842, ops }: MockPageOpts) {
  const fnArray = ops.map(o => o.fn);
  const argsArray = ops.map(o => o.args);
  return {
    getViewport: () => ({ width, height }),
    getOperatorList: async () => ({ fnArray, argsArray }),
  };
}

function buildMockDoc(pages: MockPageOpts[]) {
  const doc = {
    numPages: pages.length,
    getPage: async (n: number) => buildMockPage(pages[n - 1]),
  };
  return doc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function setupMock(pages: MockPageOpts[]) {
  const doc = buildMockDoc(pages);
  (pdfjsLib.getDocument as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    promise: Promise.resolve(doc),
  });
  return doc;
}

describe('parsePdf', () => {
  it('returns page dimensions and an empty paths list when there are no operators', async () => {
    setupMock([{ ops: [] }]);

    const result = await parsePdf(new ArrayBuffer(8));
    expect(result.page).toEqual({ width: 595.22, height: 842 });
    expect(result.paths).toEqual([]);
  });

  it('extracts one stroked red path with correct Y-flipped d', async () => {
    setupMock([
      {
        ops: [
          { fn: OPS.setStrokeRGBColor, args: [1, 0, 0] },
          { fn: OPS.setLineWidth, args: [2] },
          { fn: OPS.moveTo, args: [10, 20] },
          { fn: OPS.lineTo, args: [30, 40] },
          { fn: OPS.paintStrokePath, args: [] },
        ],
      },
    ]);

    const result = await parsePdf(new ArrayBuffer(8));
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toMatchObject({
      originalColor: '#FF0000',
      strokeWidth: 2,
    });
    expect(result.paths[0].d).toBe('M10.00 822.00 L30.00 802.00');
  });

  it('drops paths whose stroke color is not one of the 4 legend colors', async () => {
    setupMock([
      {
        ops: [
          // black footer text → should be dropped
          { fn: OPS.setStrokeRGBColor, args: [0, 0, 0] },
          { fn: OPS.moveTo, args: [0, 0] },
          { fn: OPS.lineTo, args: [100, 0] },
          { fn: OPS.paintStrokePath, args: [] },
          // a cyan road → should be kept
          { fn: OPS.setStrokeRGBColor, args: [0, 1, 1] },
          { fn: OPS.moveTo, args: [0, 100] },
          { fn: OPS.lineTo, args: [100, 100] },
          { fn: OPS.paintStrokePath, args: [] },
        ],
      },
    ]);

    const result = await parsePdf(new ArrayBuffer(8));
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].originalColor).toBe('#00FFFF');
  });

  it('preserves multiple subpaths emitted by paintFillStrokePath', async () => {
    setupMock([
      {
        ops: [
          { fn: OPS.setStrokeRGBColor, args: [0, 0, 1] }, // blue
          { fn: OPS.moveTo, args: [0, 0] },
          { fn: OPS.lineTo, args: [50, 0] },
          { fn: OPS.paintFillStrokePath, args: [] },
          { fn: OPS.moveTo, args: [0, 10] },
          { fn: OPS.lineTo, args: [50, 10] },
          { fn: OPS.paintFillStrokePath, args: [] },
        ],
      },
    ]);

    const result = await parsePdf(new ArrayBuffer(8));
    expect(result.paths).toHaveLength(2);
    result.paths.forEach(p => expect(p.originalColor).toBe('#0000FF'));
  });

  it('handles cubic bezier curves with Y flip on all 6 numbers', async () => {
    setupMock([
      {
        ops: [
          { fn: OPS.setStrokeRGBColor, args: [0, 1, 0] }, // green
          { fn: OPS.moveTo, args: [0, 0] },
          { fn: OPS.curveTo, args: [10, 20, 30, 40, 50, 60] },
          { fn: OPS.paintStrokePath, args: [] },
        ],
      },
    ]);

    const result = await parsePdf(new ArrayBuffer(8));
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].d).toContain('C10.00 822.00 30.00 802.00 50.00 782.00');
  });

  it('tolerates small numerical jitter in stroke color', async () => {
    setupMock([
      {
        ops: [
          { fn: OPS.setStrokeRGBColor, args: [0.992, 0, 0] },
          { fn: OPS.moveTo, args: [0, 0] },
          { fn: OPS.lineTo, args: [10, 10] },
          { fn: OPS.paintStrokePath, args: [] },
        ],
      },
    ]);

    const result = await parsePdf(new ArrayBuffer(8));
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].originalColor).toBe('#FF0000');
  });

  it('handles constructPath (modern pdf.js op) with sub-ops + sub-args + bbox', async () => {
    // Mirrors the real PDF structure: constructPath args = [subOps, subArgs, bbox]
    setupMock([
      {
        ops: [
          { fn: OPS.setStrokeRGBColor, args: [128, 255, 255] }, // CUBE light cyan
          { fn: OPS.constructPath, args: [[13, 14], [0, 0, 50, 50], [0, 0, 50, 50]] },
          { fn: OPS.stroke, args: [] },
        ],
      },
    ]);

    const result = await parsePdf(new ArrayBuffer(8));
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].originalColor).toBe('#00FFFF');
    expect(result.paths[0].d).toBe('M0.00 842.00 L50.00 792.00');
  });
});