// Tests for the font-size selector in TopBar. Default size is 16 (the
// DEFAULT_TEXT_BOX value); once a textbox is selected, the dropdown
// reflects its current fontSize and updates it on change.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TopBar } from '@/components/editor/TopBar';
import { useEditorStore } from '@/lib/editor-store';
import type { ParseResult, PdfPath, PathId, TextBox } from '@/lib/types';

const samplePaths: PdfPath[] = [
  {
    id: 'p-0' as PathId,
    d: 'M10 10 L100 100',
    originalColor: '#FF0000',
    bbox: { minX: 10, minY: 10, maxX: 100, maxY: 100 },
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

describe('Font size selector (TopBar)', () => {
  beforeEach(resetStore);
  afterEach(() => vi.restoreAllMocks());

  it('renders a font-size select once a PDF is loaded', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);
    expect(screen.getByTestId('font-size-select')).toBeInTheDocument();
  });

  it('defaults to 16 when no textbox is selected and is disabled', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);
    const select = screen.getByTestId('font-size-select') as HTMLSelectElement;
    expect(select.value).toBe('16');
    expect(select.disabled).toBe(true);
  });

  it('reflects the selected textbox fontSize and updates on change', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    const box: TextBox = {
      id: 'tb-1',
      x: 50,
      y: 50,
      width: 100,
      height: 40,
      text: 'hi',
      fontFamily: 'system-ui',
      fontSize: 24,
      color: '#000000',
      rotation: 0,
    };
    useEditorStore.getState().addTextBox(box);
    useEditorStore.getState().selectTextBox('tb-1');

    render(<TopBar />);
    const select = screen.getByTestId('font-size-select') as HTMLSelectElement;
    expect(select.value).toBe('24');
    expect(select.disabled).toBe(false);

    fireEvent.change(select, { target: { value: '32' } });
    expect(useEditorStore.getState().textBoxes[0].fontSize).toBe(32);
    expect((screen.getByTestId('font-size-select') as HTMLSelectElement).value).toBe('32');
  });
});
