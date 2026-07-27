// App-level integration test: rendering the editor route loads an empty
// state, surfaces upload controls, and produces a parsed editor once a PDF
// is supplied.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditorRoute } from '@/app/_components/EditorRoute';
import { useEditorStore } from '@/lib/editor-store';
import * as parser from '@/lib/pdf-parser';

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

describe('EditorRoute', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the empty state and dropzone before any PDF is loaded', () => {
    render(<EditorRoute />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-file-input')).toBeInTheDocument();
  });

  it('hides the empty state and shows editor chrome after parsePdf completes', async () => {
    // Stub parsePdf so the test doesn't need a real PDF binary.
    vi.spyOn(parser, 'parsePdf').mockResolvedValue({
      page: { width: 100, height: 100 },
      paths: [],
    });

    render(<EditorRoute />);
    const file = new File(['fake'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('empty-state')).toBeNull();
    });
    expect(useEditorStore.getState().page).toEqual({ width: 100, height: 100 });
  });

  it('shows an error message when parsing fails', async () => {
    vi.spyOn(parser, 'parsePdf').mockRejectedValue(
      new Error('bad PDF'),
    );
    render(<EditorRoute />);
    const file = new File(['fake'], 'bad.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('pdf-file-input'), {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(screen.getByTestId('parse-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('parse-error').textContent).toContain('bad PDF');
  });

  it('rejects non-PDF files via the file input accept filter', () => {
    render(<EditorRoute />);
    const input = screen.getByTestId('pdf-file-input');
    expect((input as HTMLInputElement).accept).toContain('application/pdf');
  });
});
