// Exporter unit tests.
//
// buildEditorSvg is a pure SVG string assembler — runs in browser + tests.
// The actual rasterization happens server-side via the /api/export route
// handler (sharp can't be bundled into client components), so that's
// covered by manual / e2e checks rather than vitest.

import { describe, it, expect, vi } from 'vitest';
import {
  buildEditorSvg,
  exportSvgToBlob,
  SVG_UNITS_PER_INCH,
  type ExportInput,
} from '@/lib/exporter';
import type { PdfPath, TextBox, PathId, TextBoxId } from '@/lib/types';

const samplePaths: PdfPath[] = [
  {
    id: 'p-0' as PathId,
    d: 'M10 20 L30 40',
    originalColor: '#FF0000',
    bbox: { minX: 10, minY: 20, maxX: 30, maxY: 40 },
    strokeWidth: 1,
  },
  {
    id: 'p-1' as PathId,
    d: 'M50 60 L70 80',
    originalColor: '#0000FF',
    bbox: { minX: 50, minY: 60, maxX: 70, maxY: 80 },
    strokeWidth: 1,
  },
];

const sampleBoxes: TextBox[] = [
  {
    id: 'tb-1' as TextBoxId,
    x: 10,
    y: 10,
    width: 80,
    height: 30,
    text: 'hello',
    fontFamily: 'system-ui',
    fontSize: 16,
    color: '#000000',
  },
];

const baseInput: ExportInput = {
  page: { width: 200, height: 200 },
  paths: samplePaths,
  textBoxes: sampleBoxes,
};

describe('exporter', () => {
  describe('buildEditorSvg', () => {
    it('renders an <svg> with the page width/height as viewBox', () => {
      const out = buildEditorSvg(baseInput);
      expect(out).toContain('viewBox="0 0 200 200"');
      expect(out).toMatch(/^<svg[\s>]/);
    });

    it('emits one <path> per PdfPath with stroke set to the override color', () => {
      const out = buildEditorSvg({
        ...baseInput,
        colorOverrides: { 'p-0': '#00FF00' } as Record<PathId, string>,
      });
      expect(out).toContain('stroke="#00FF00"');
      expect(out).toContain('d="M10 20 L30 40"');
      expect(out).toContain('stroke="#0000FF"'); // p-1 untouched
    });

    it('falls back to originalColor when there is no override', () => {
      const out = buildEditorSvg(baseInput);
      expect(out).toContain('stroke="#FF0000"');
      expect(out).toContain('stroke="#0000FF"');
    });

    it('embeds text boxes as native <text> with the configured font/color', () => {
      const out = buildEditorSvg(baseInput);
      // librsvg (sharp's SVG backend) doesn't render <foreignObject> —
      // we use native SVG <text> elements so the export actually shows
      // the labels.
      expect(out).not.toContain('foreignObject');
      expect(out).toContain('<text');
      expect(out).toContain('hello');
      expect(out).toContain('font-family="system-ui"');
      expect(out).toContain('fill="#000000"');
    });

    it('embeds multiple text boxes', () => {
      const out = buildEditorSvg({
        ...baseInput,
        textBoxes: [
          ...sampleBoxes,
          {
            ...sampleBoxes[0],
            id: 'tb-2' as TextBoxId,
            text: 'world',
          },
        ],
      });
      expect(out).toContain('hello');
      expect(out).toContain('world');
    });

    it('escapes XML-special characters in text content (native <text> XML escaping)', () => {
      // Each <text> element's content has its raw <, >, & characters
      // converted to entities. We verify the absence of the raw `&`
      // (which would break SVG/XML) and the presence of the entity form
      // somewhere in the document.
      const out = buildEditorSvg({
        ...baseInput,
        textBoxes: [
          {
            ...sampleBoxes[0],
            text: 'a & b',
          },
        ],
      });
      expect(out).not.toContain('a & b');
      expect(out).toContain('&amp;');
    });

    it('wraps rotated textboxes in a <g transform="rotate(...)">', () => {
      const out = buildEditorSvg({
        ...baseInput,
        textBoxes: [
          {
            ...sampleBoxes[0],
            rotation: 45,
          },
        ],
      });
      expect(out).toMatch(/<g transform="rotate\(45(\.0+)?\s/);
    });
  });

  describe('exportSvgToBlob', () => {
    it('POSTs the SVG to /api/export with format/dpi and returns the blob', async () => {
      const fakeBuf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
      const fakeBlob = new Blob([fakeBuf], { type: 'image/png' });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(fakeBlob),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await exportSvgToBlob('<svg/>', 'png', 150);
      expect(result).toBe(fakeBlob);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/export');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.svg).toBe('<svg/>');
      expect(body.format).toBe('png');
      expect(body.dpi).toBe(150);
    });

    it('throws when the server returns an error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('sharp blew up'),
        }),
      );
      await expect(exportSvgToBlob('<svg/>', 'png', 150)).rejects.toThrow(
        /sharp blew up/,
      );
    });
  });

  it('exposes SVG_UNITS_PER_INCH as a public constant', () => {
    expect(SVG_UNITS_PER_INCH).toBe(72);
  });
});
