// Tests for the new "Add Text Box" button (M10), and for textbox rotation.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '@/components/editor/TopBar';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { useEditorStore } from '@/lib/editor-store';
import { stubGetBoundingClientRect } from '../setup';
import type { ParseResult, PdfPath, PathId } from '@/lib/types';

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
}

describe('Add-TextBox button (TopBar)', () => {
  beforeEach(resetStore);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders an "添加文字框" button when a PDF is loaded', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);
    expect(screen.getByTestId('add-textbox-button')).toBeInTheDocument();
  });

  it('does NOT render the button when no PDF is loaded', () => {
    render(<TopBar />);
    expect(screen.queryByTestId('add-textbox-button')).toBeNull();
  });

  it('clicking the button creates a new text box centered on the SVG', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();
    render(<TopBar />);

    fireEvent.click(screen.getByTestId('add-textbox-button'));

    const boxes = useEditorStore.getState().textBoxes;
    expect(boxes).toHaveLength(1);
    // SVG page is 200×200 (PDF user units) → screen 200×200. Center is (100, 100).
    // Text box default is 160 wide × 40 tall → centered x = 100 - 80 = 20
    const box = boxes[0];
    expect(box.x).toBe(20);
    expect(box.y).toBe(80);
    expect(useEditorStore.getState().selectedTextBoxId).toBe(box.id);
  });
});

describe('TextBox rotation', () => {
  beforeEach(resetStore);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a rotation handle on the selected text box', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().addTextBox({
      id: 'tb-1',
      x: 50,
      y: 50,
      width: 100,
      height: 40,
      text: 'hi',
      fontFamily: 'system-ui',
      fontSize: 16,
      color: '#000000',
      rotation: 0,
    });
    useEditorStore.getState().selectTextBox('tb-1');

    render(<EditorCanvas />);
    stubLayout();

    expect(screen.getByTestId('textbox-rotate-tb-1')).toBeInTheDocument();
  });

  it('dragging the rotation handle updates rotation in the store', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().addTextBox({
      id: 'tb-1',
      x: 50,
      y: 50,
      width: 100,
      height: 40,
      text: 'hi',
      fontFamily: 'system-ui',
      fontSize: 16,
      color: '#000000',
      rotation: 0,
    });
    useEditorStore.getState().selectTextBox('tb-1');

    render(<EditorCanvas />);
    stubLayout();

    const handle = screen.getByTestId('textbox-rotate-tb-1');
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 30, button: 0 });
    fireEvent.pointerMove(document, { clientX: 130, clientY: 30 });
    fireEvent.pointerUp(document, { clientX: 130, clientY: 30 });

    const box = useEditorStore.getState().textBoxes[0];
    // Box centered at (100, 70) screen-px. Handle started at (100, 30) — straight
    // up. Moved to (130, 30) — about 30 units right of center. Angle from
    // straight-up is atan2(30, -40) ≈ 143°.
    expect(box.rotation).not.toBe(0);
  });
});
