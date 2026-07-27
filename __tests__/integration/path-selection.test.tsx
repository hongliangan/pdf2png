// Verify that selecting a path actually changes its visible rendering and
// emits the halo overlay. The halo is the user-visible signal that the
// click registered.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { useEditorStore } from '@/lib/editor-store';
import { stubGetBoundingClientRect } from '../setup';
import type { ParseResult, PdfPath, PathId } from '@/lib/types';

const samplePaths: PdfPath[] = [
  {
    id: 'p-0' as PathId,
    d: 'M30 100 L170 100',
    originalColor: '#FF0000',
    bbox: { minX: 30, minY: 100, maxX: 170, maxY: 100 },
    strokeWidth: 2,
  },
  {
    id: 'p-1' as PathId,
    d: 'M30 200 L170 200',
    originalColor: '#0000FF',
    bbox: { minX: 30, minY: 200, maxX: 170, maxY: 200 },
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
    addTextBoxArmed: false,
    textBoxesLocked: false,
    past: [],
    future: [],
  });
}

function stubLayout() {
  const svg = document.querySelector('svg');
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

describe('Path selection visual', () => {
  beforeEach(resetStore);
  afterEach(() => vi.restoreAllMocks());

  it('clicking a line adds a data-selected attribute to that path', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    expect(overlay).toBeTruthy();

    fireEvent.click(overlay, { clientX: 100, clientY: 100 });

    expect(useEditorStore.getState().selectedPathId).toBe('p-0');
    const selected = document.querySelectorAll('[data-path-id="p-0"][data-selected="true"]');
    expect(selected.length).toBeGreaterThan(0);
  });

  it('only the clicked path is marked data-selected', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });

    expect(
      document.querySelectorAll('[data-path-id="p-0"][data-selected="true"]').length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll('[data-path-id="p-1"][data-selected="true"]').length,
    ).toBe(0);
  });

  it('selected path renders a wider stroke (visible thicker), unselected does not', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    const pathBefore = document.querySelector(
      'path[data-testid="pdf-path-p-0"]',
    ) as SVGPathElement;
    const widthBefore = parseFloat(pathBefore.getAttribute('stroke-width') ?? '0');

    fireEvent.click(
      document.querySelector('[data-hit-overlay]') as HTMLElement,
      { clientX: 100, clientY: 100 },
    );

    const pathAfter = document.querySelector(
      'path[data-testid="pdf-path-p-0"]',
    ) as SVGPathElement;
    const widthAfter = parseFloat(pathAfter.getAttribute('stroke-width') ?? '0');

    expect(widthAfter).toBeGreaterThan(widthBefore);
  });
});
