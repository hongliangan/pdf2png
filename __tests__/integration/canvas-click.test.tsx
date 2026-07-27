import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SvgCanvas } from '@/components/editor/SvgCanvas';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { useEditorStore } from '@/lib/editor-store';
import { stubGetBoundingClientRect } from '../setup';
import type { ParseResult, PdfPath, PathId } from '@/lib/types';

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
    d: 'M50 50 L70 70',
    originalColor: '#00FF00',
    bbox: { minX: 50, minY: 50, maxX: 70, maxY: 70 },
    strokeWidth: 1,
  },
];

const sampleParse: ParseResult = {
  page: { width: 100, height: 100 },
  paths: samplePaths,
};

function resetStore() {
  useEditorStore.setState({
    paths: [],
    page: null,
    selectedPathId: null,
    pickerPos: null,
  });
}

describe('SvgCanvas — event delegation (M3)', () => {
  beforeEach(resetStore);
  afterEach(() => vi.restoreAllMocks());

  it('renders one <path> per PdfPath with data-path-id attribute', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<SvgCanvas />);

    const paths = screen.getAllByTestId(/^pdf-path-/);
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute('data-path-id')).toBe('p-0');
    expect(paths[1].getAttribute('data-path-id')).toBe('p-1');
  });

  it('uses each path\'s originalColor as stroke when no override is set', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<SvgCanvas />);

    expect(screen.getByTestId('pdf-path-p-0').getAttribute('stroke')).toBe('#FF0000');
    expect(screen.getByTestId('pdf-path-p-1').getAttribute('stroke')).toBe('#00FF00');
  });

  it('clicking a path sets selectedPathId in the store via event delegation', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);

    // jsdom returns 0×0 from getBoundingClientRect — stub the SVG and the
    // overlay so the hit-test has real dimensions to work with. Path p-1 has
    // bbox [50, 50, 70, 70] in a 100×100 page. With the new PATH_HIT_PADDING=36
    // and PATH_NEAREST_PADDING=64, click at (90,90) is well inside p-1's
    // hit area and well outside p-0's (which extends to ~x=66, y=76 max).
    document.querySelectorAll('svg, [data-hit-overlay]').forEach((el) =>
      stubGetBoundingClientRect(el, {
        width: 100,
        height: 100,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
      }),
    );

    fireEvent.click(screen.getByTestId('pdf-path-p-1'), {
      clientX: 90,
      clientY: 90,
    });
    expect(useEditorStore.getState().selectedPathId).toBe('p-1');
  });

  it('clicking empty SVG area does NOT change selection', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().selectPath('p-0' as PathId);
    render(<SvgCanvas />);

    const svg = screen.getByRole('img');
    fireEvent.click(svg);

    expect(useEditorStore.getState().selectedPathId).toBe('p-0');
  });

  it('renders nothing when no PDF is loaded', () => {
    render(<SvgCanvas />);
    expect(screen.queryAllByTestId(/^pdf-path-/)).toHaveLength(0);
  });
});