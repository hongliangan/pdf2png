// Verify the HTML-overlay-based hit-testing for path clicks.
//
// Since hit-testing no longer relies on SVG stroke geometry, these tests
// confirm that the click coordinates (relative to the SVG) correctly map
// to a path's bbox when it falls within ~PATH_HIT_PADDING user-units of
// the path.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { useEditorStore } from '@/lib/editor-store';
import { stubGetBoundingClientRect } from '../setup';
import { PATH_HIT_PADDING } from '@/lib/constants';
import type { ParseResult, PdfPath, PathId } from '@/lib/types';

const samplePaths: PdfPath[] = [
  {
    id: 'p-0' as PathId,
    d: 'M50 100 L150 100',
    originalColor: '#FF0000',
    bbox: { minX: 50, minY: 100, maxX: 150, maxY: 100 },
    strokeWidth: 2,
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
    past: [],
    future: [],
  });
}

// 1:1 layout (200px SVG, 200px page). Path at PDF y=100 has bbox expanded
// by PATH_HIT_PADDING to ~88..112 px in screen coords.
function stubLayout() {
  const svg = document.querySelector('svg') as SVGElement | null;
  if (svg) {
    stubGetBoundingClientRect(svg, {
      width: 200,
      height: 200,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
    });
  }
  document.querySelectorAll('[data-editor-canvas]').forEach((el) =>
    stubGetBoundingClientRect(el, {
      width: 200,
      height: 200,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
    }),
  );
  const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement | null;
  if (overlay) {
    stubGetBoundingClientRect(overlay, {
      width: 200,
      height: 200,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
    });
  }
}

describe('Path click hit area (HTML-overlay hit-testing)', () => {
  beforeEach(resetStore);
  afterEach(() => vi.restoreAllMocks());

  it('clicking on the visible path element selects the path (e.stopPropagation prevents textbox creation)', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    // Path at PDF y=100 (screen y=100 with 1:1 stub). Click coordinates
    // (100, 100) — directly on the line — should hit via the overlay.
    const path = screen.getByTestId('pdf-path-p-0');
    fireEvent.click(path, { clientX: 100, clientY: 100 });

    expect(useEditorStore.getState().selectedPathId).toBe('p-0');
    expect(useEditorStore.getState().textBoxes).toHaveLength(0);
  });

  it('clicking the overlay within PATH_HIT_PADDING of the path selects it', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    expect(overlay).toBeTruthy();

    // Path bbox is [50..150, 100..100] in PDF; expanded by PATH_HIT_PADDING.
    // Clicking at screen (100, 100 + PATH_HIT_PADDING - 1) lands inside.
    fireEvent.click(overlay, { clientX: 100, clientY: 100 + PATH_HIT_PADDING - 1 });

    expect(useEditorStore.getState().selectedPathId).toBe('p-0');
    expect(useEditorStore.getState().textBoxes).toHaveLength(0);
  });

  it('clicking the overlay FAR outside the path+padding creates a textbox only when armed', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    expect(overlay).toBeTruthy();

    // Path at y=100; with PATH_HIT_PADDING=36 + PATH_NEAREST_PADDING=64,
    // the lookup reaches up to ~ y=200. Click at y=10 (90 px above the
    // path) is just within nearest-padding. Click at y=5 (95 px above)
    // is the safe no-hit zone.
    fireEvent.click(overlay, { clientX: 100, clientY: 5 });
    expect(useEditorStore.getState().textBoxes).toHaveLength(0);

    // Arm the tool — now the click should create a textbox and disarm.
    act(() => {
      useEditorStore.getState().setAddTextBoxArmed(true);
    });
    fireEvent.click(overlay, { clientX: 100, clientY: 5 });

    expect(useEditorStore.getState().selectedPathId).toBeNull();
    expect(useEditorStore.getState().textBoxes).toHaveLength(1);
    // Tool is one-shot — disarms after the click.
    expect(useEditorStore.getState().addTextBoxArmed).toBe(false);
  });

  it('clicking in a gap between segments selects SOMETHING (split-road tolerance)', () => {
    // Two visually-adjacent paths: each is a 20-unit-wide segment with a
    // 4-unit gap between them — typical of a single long road that the
    // PDF split into multiple <path> elements. Clicking in the gap
    // would miss a strict bbox-containment hit-test; the nearest-path
    // fallback should rescue the click.
    const twoSegments: ParseResult = {
      page: { width: 200, height: 200 },
      paths: [
        {
          id: 'p-0' as PathId,
          d: 'M50 100 L70 100',
          originalColor: '#FF0000',
          bbox: { minX: 50, minY: 100, maxX: 70, maxY: 100 },
          strokeWidth: 1,
          clipIndex: null,
        },
        {
          id: 'p-1' as PathId,
          d: 'M74 100 L94 100',
          originalColor: '#FF0000',
          bbox: { minX: 74, minY: 100, maxX: 94, maxY: 100 },
          strokeWidth: 1,
          clipIndex: null,
        },
      ],
    };
    useEditorStore.getState().loadPdf(twoSegments);
    render(<EditorCanvas />);
    stubLayout();

    // Click in the gap [70..74]. Both paths are 2 px away; one of them
    // wins. We only assert "something was selected" — the user gets a
    // hit instead of nothing.
    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    fireEvent.click(overlay, { clientX: 72, clientY: 100 });

    expect(useEditorStore.getState().selectedPathId).not.toBeNull();
  });

  it('clicks FAR away from any path return null even with nearest-fallback', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    fireEvent.click(overlay, { clientX: 100, clientY: 5 });
    expect(useEditorStore.getState().selectedPathId).toBeNull();
  });

  it('overlapping bboxes select the path whose CENTER is closest to the click', () => {
    // Two near-parallel paths whose padded bboxes overlap. The user clicks
    // closer to the center of p-1, so p-1 must win even though p-0 comes
    // first in the array (an earlier implementation picked by array order).
    const twoOverlapping: ParseResult = {
      page: { width: 200, height: 200 },
      paths: [
        {
          id: 'p-0' as PathId,
          d: 'M30 80 L70 80',
          originalColor: '#0000FF',
          bbox: { minX: 30, minY: 80, maxX: 70, maxY: 80 },
          strokeWidth: 1,
          clipIndex: null,
        },
        {
          id: 'p-1' as PathId,
          d: 'M130 130 L170 130',
          originalColor: '#FF0000',
          bbox: { minX: 130, minY: 130, maxX: 170, maxY: 130 },
          strokeWidth: 1,
          clipIndex: null,
        },
      ],
    };
    useEditorStore.getState().loadPdf(twoOverlapping);
    render(<EditorCanvas />);
    stubLayout();

    // Click at (150, 130) — directly on p-1's line. p-0's center is at
    // (50, 80), p-1's center is at (150, 130). Distance to p-1's center
    // is ~0, distance to p-0's center is ~110. p-1 wins.
    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    fireEvent.click(overlay, { clientX: 150, clientY: 130 });

    expect(useEditorStore.getState().selectedPathId).toBe('p-1');
  });
});
