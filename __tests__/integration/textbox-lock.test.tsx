// Tests for the textbox lock feature — when locked, textboxes are visual-only
// (no selection, no drag, no edit, no delete). The +添加文字框 button is
// disabled. Clicking on a textbox passes through to the SVG/overlay.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TopBar } from '@/components/editor/TopBar';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { useEditorStore } from '@/lib/editor-store';
import { stubGetBoundingClientRect } from '../setup';
import type { ParseResult, PdfPath, PathId, TextBox } from '@/lib/types';

const samplePaths: PdfPath[] = [
  {
    id: 'p-0' as PathId,
    d: 'M30 100 L170 100',
    originalColor: '#FF0000',
    bbox: { minX: 30, minY: 100, maxX: 170, maxY: 100 },
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

describe('TextBox lock toggle', () => {
  beforeEach(resetStore);
  afterEach(() => vi.restoreAllMocks());

  it('renders a lock toggle button when a PDF is loaded', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);
    expect(screen.getByTestId('lock-textboxes-button')).toBeInTheDocument();
  });

  it('starts unlocked (so a freshly-loaded PDF is editable)', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    expect(useEditorStore.getState().textBoxesLocked).toBe(false);
  });

  it('clicking the lock button toggles the locked state', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<TopBar />);

    fireEvent.click(screen.getByTestId('lock-textboxes-button'));
    expect(useEditorStore.getState().textBoxesLocked).toBe(true);

    fireEvent.click(screen.getByTestId('lock-textboxes-button'));
    expect(useEditorStore.getState().textBoxesLocked).toBe(false);
  });

  it('locking deselects any selected textbox and disarms the add tool', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    const box: TextBox = {
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
    };
    useEditorStore.getState().addTextBox(box);
    useEditorStore.getState().selectTextBox('tb-1');
    useEditorStore.getState().setAddTextBoxArmed(true);

    render(<TopBar />);
    fireEvent.click(screen.getByTestId('lock-textboxes-button'));

    expect(useEditorStore.getState().textBoxesLocked).toBe(true);
    expect(useEditorStore.getState().selectedTextBoxId).toBeNull();
    expect(useEditorStore.getState().addTextBoxArmed).toBe(false);
  });

  it('does not show × or ↻ handles for a textbox when locked', () => {
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
    // Force-lock regardless of selection state.
    useEditorStore.getState().setTextBoxesLocked(true);

    render(<EditorCanvas />);
    stubLayout();

    expect(screen.queryByTestId('textbox-delete-tb-1')).toBeNull();
    expect(screen.queryByTestId('textbox-rotate-tb-1')).toBeNull();
  });
});
