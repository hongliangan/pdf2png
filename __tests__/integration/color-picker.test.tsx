import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPickerPopover } from '@/components/editor/ColorPickerPopover';
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
    past: [],
    future: [],
  });
}

describe('ColorPickerPopover (M4)', () => {
  beforeEach(resetStore);

  it('does not render when no path is selected', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<ColorPickerPopover />);
    expect(screen.queryByTestId('color-picker-popover')).toBeNull();
  });

  it('renders 4 swatches with the legend hex colors', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().selectPath('p-0' as PathId);
    useEditorStore.getState().openPicker({ x: 50, y: 50 });

    render(<ColorPickerPopover />);
    const popover = screen.getByTestId('color-picker-popover');
    expect(popover).toBeInTheDocument();

    const swatches = screen.getAllByTestId(/^color-swatch-/);
    expect(swatches).toHaveLength(4);

    const colors = swatches.map((el) => el.getAttribute('data-color'));
    expect(colors).toEqual(['#FF0000', '#0000FF', '#00FF00', '#00FFFF']);
  });

  it('clicking a swatch applies the override and closes the picker', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().selectPath('p-0' as PathId);
    useEditorStore.getState().openPicker({ x: 50, y: 50 });

    render(<ColorPickerPopover />);
    fireEvent.click(screen.getByTestId('color-swatch-#0000FF'));

    const state = useEditorStore.getState();
    expect(state.colorOverrides['p-0' as PathId]).toBe('#0000FF');
    expect(state.pickerPos).toBeNull();
  });

  it('clicking outside the popover dismisses it without changing colors', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().selectPath('p-0' as PathId);
    useEditorStore.getState().openPicker({ x: 50, y: 50 });

    render(
      <div>
        <ColorPickerPopover />
        <button data-testid="outside">elsewhere</button>
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(useEditorStore.getState().pickerPos).toBeNull();
    expect(useEditorStore.getState().colorOverrides['p-0' as PathId]).toBeUndefined();
  });

  it('records history so undo (later) can revert color changes', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().selectPath('p-0' as PathId);
    useEditorStore.getState().openPicker({ x: 50, y: 50 });

    render(<ColorPickerPopover />);
    expect(useEditorStore.getState().past).toHaveLength(0);

    fireEvent.click(screen.getByTestId('color-swatch-#00FF00'));
    expect(useEditorStore.getState().past).toHaveLength(1);
  });

  it('positions the popover at the configured pickerPos (left/top)', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().selectPath('p-0' as PathId);
    useEditorStore.getState().openPicker({ x: 123, y: 456 });

    render(<ColorPickerPopover />);
    const popover = screen.getByTestId('color-picker-popover');
    expect(popover.style.left).toBe('123px');
    expect(popover.style.top).toBe('456px');
  });
});