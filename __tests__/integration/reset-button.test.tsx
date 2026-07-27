import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '@/components/editor/TopBar';
import { SvgCanvas } from '@/components/editor/SvgCanvas';
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
    colorOverrides: {},
    textBoxes: [],
    selectedTextBoxId: null,
    past: [],
    future: [],
  });
}

describe('TopBar — Reset button (M5)', () => {
  beforeEach(resetStore);

  it('does not render Reset button before any PDF is loaded', () => {
    render(<TopBar />);
    expect(screen.queryByTestId('reset-button')).toBeNull();
  });

  it('clicking Reset clears all color overrides and reverts paths to originalColor', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().applyColor('p-0' as PathId, '#0000FF');
    useEditorStore.getState().applyColor('p-1' as PathId, '#00FFFF');

    expect(useEditorStore.getState().colorOverrides).toEqual({
      'p-0': '#0000FF',
      'p-1': '#00FFFF',
    });

    render(
      <div>
        <TopBar />
        <SvgCanvas />
      </div>,
    );

    fireEvent.click(screen.getByTestId('reset-button'));

    // store state cleared
    expect(useEditorStore.getState().colorOverrides).toEqual({});

    // DOM reverts: p-0 back to red, p-1 back to green
    expect(screen.getByTestId('pdf-path-p-0').getAttribute('stroke')).toBe('#FF0000');
    expect(screen.getByTestId('pdf-path-p-1').getAttribute('stroke')).toBe('#00FF00');
  });

  it('Reset itself is recorded in history (Ctrl+Z can revert it)', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().applyColor('p-0' as PathId, '#0000FF');

    render(<TopBar />);
    const before = useEditorStore.getState().past.length;
    fireEvent.click(screen.getByTestId('reset-button'));
    const after = useEditorStore.getState().past.length;

    expect(after).toBe(before + 1);
  });

  it('exposes Undo and Redo buttons (M8 wiring will populate logic)', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);
    expect(screen.getByTestId('undo-button')).toBeInTheDocument();
    expect(screen.getByTestId('redo-button')).toBeInTheDocument();
  });
});