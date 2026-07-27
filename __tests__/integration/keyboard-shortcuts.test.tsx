// Keyboard shortcuts (M8 wiring): Cmd+Z undoes, Cmd+Shift+Z redoes.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
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
    textBoxes: [],
    selectedTextBoxId: null,
    past: [],
    future: [],
  });
}

describe('Keyboard shortcuts (M8)', () => {
  beforeEach(resetStore);

  it('Cmd+Z undoes the most recent color change', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().applyColor('p-0' as PathId, '#0000FF');

    expect(useEditorStore.getState().colorOverrides['p-0']).toBe('#0000FF');

    render(<EditorCanvas />);

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(useEditorStore.getState().colorOverrides).toEqual({});
  });

  it('Cmd+Shift+Z redoes an undone change', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().applyColor('p-0' as PathId, '#0000FF');
    useEditorStore.getState().undo();

    expect(useEditorStore.getState().colorOverrides).toEqual({});

    render(<EditorCanvas />);

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
    expect(useEditorStore.getState().colorOverrides['p-0']).toBe('#0000FF');
  });

  it('Ctrl+Z works too (linux/windows-friendly)', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().applyColor('p-0' as PathId, '#00FF00');

    render(<EditorCanvas />);

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(useEditorStore.getState().colorOverrides).toEqual({});
  });

  it('does not fire undo while typing in an editable element', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().applyColor('p-0' as PathId, '#0000FF');

    render(<EditorCanvas />);

    const editable = document.createElement('input');
    document.body.appendChild(editable);
    editable.focus();

    fireEvent.keyDown(editable, { key: 'z', metaKey: true });

    // Undo NOT applied — the editable element swallowed the shortcut.
    expect(useEditorStore.getState().colorOverrides['p-0']).toBe('#0000FF');

    document.body.removeChild(editable);
  });
});
