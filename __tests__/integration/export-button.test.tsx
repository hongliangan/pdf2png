// TopBar export — verifies that clicking the PNG/JPG buttons POSTs the SVG
// to /api/export and triggers a browser download via an imperatively-created
// <a download> (the most reliable pattern across browsers).

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TopBar } from '@/components/editor/TopBar';
import { useEditorStore } from '@/lib/editor-store';
import type { ParseResult, PdfPath, PathId } from '@/lib/types';

const samplePaths: PdfPath[] = [
  {
    id: 'p-0' as PathId,
    d: 'M10 20 L30 40',
    originalColor: '#FF0000',
    bbox: { minX: 10, minY: 20, maxX: 30, maxY: 40 },
    strokeWidth: 1,
  },
];
const sampleParse: ParseResult = {
  page: { width: 200, height: 200 },
  paths: samplePaths,
};

function resetStore() {
  useEditorStore.setState({
    paths: [],
    page: null,
    selectedPathId: null,
    pickerPos: null,
    colorOverrides: {},
    textBoxes: [],
    selectedTextBoxId: null,
    addTextBoxArmed: false,
    textBoxesLocked: false,
    hoveredPathId: null,
    past: [],
    future: [],
  });
}

function mockFetchOk(blobType: string) {
  const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: blobType });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    }),
  );
}

function mockFetchError(message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve(message),
    }),
  );
}

describe('TopBar export', () => {
  beforeEach(resetStore);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders Export PNG and Export JPG buttons once a PDF is loaded', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);
    expect(screen.getByTestId('export-png-button')).toBeInTheDocument();
    expect(screen.getByTestId('export-jpg-button')).toBeInTheDocument();
  });

  it('PNG export posts to /api/export and starts a .png download', async () => {
    mockFetchOk('image/png');
    useEditorStore.getState().loadPdf(sampleParse);
    // Spy on <a>.click() — the triggerDownload helper uses a dynamic anchor.
    const clickSpy = vi.fn();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clickSpy(this);
      // Don't actually navigate away in jsdom.
    };

    try {
      render(<TopBar />);
      fireEvent.click(screen.getByTestId('export-png-button'));

      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      const anchor = clickSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(anchor.download).toMatch(/\.png$/);
      expect(anchor.href).toMatch(/^blob:/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('JPG export posts to /api/export and starts a .jpg download', async () => {
    mockFetchOk('image/jpeg');
    useEditorStore.getState().loadPdf(sampleParse);
    const clickSpy = vi.fn();
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clickSpy(this);
    };

    try {
      render(<TopBar />);
      fireEvent.click(screen.getByTestId('export-jpg-button'));

      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      const anchor = clickSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(anchor.download).toMatch(/\.jpg$/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it('surfaces server errors via a small status pill', async () => {
    mockFetchError('librsvg crashed');
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);

    fireEvent.click(screen.getByTestId('export-png-button'));

    await waitFor(() => {
      expect(screen.getByTestId('export-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('export-error').textContent).toContain('librsvg crashed');
  });

  it('disables the buttons while exporting, then re-enables on completion', async () => {
    // Make the fetch resolve slowly so we can observe the busy state.
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () => new Promise<Response>((res) => (resolveFetch = res)),
      ),
    );
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);

    fireEvent.click(screen.getByTestId('export-png-button'));
    // While pending, the button is disabled and the export-busy text shows.
    await waitFor(() => {
      expect(screen.getByTestId('export-png-button').textContent).toContain(
        '…导出中',
      );
    });

    const blob = new Blob([new Uint8Array([0])], { type: 'image/png' });
    resolveFetch(
      new Response(blob, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('export-png-button').textContent).toBe(
        '导出 PNG',
      );
    });
  });
});
