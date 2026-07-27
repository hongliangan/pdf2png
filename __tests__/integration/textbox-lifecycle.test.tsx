import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/**
 * jsdom has no layout engine — every getBoundingClientRect() returns 0×0 by
 * default, which would make the SVG bounds check reject all clicks and make
 * scaleX/scaleY collapse to 0. Stub the SVG + container to a known size so
 * click coordinates and textbox positioning are realistic.
 */
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

describe('TextBox lifecycle (M6)', () => {
  beforeEach(resetStore);

  it('renders nothing when no PDF is loaded', () => {
    const { container } = render(<EditorCanvas />);
    expect(container.querySelector('[data-textbox-layer]')).toBeNull();
  });

  it('clicking empty canvas area while NOT armed does NOT create a text box', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    const svg = screen.getByRole('img');
    // Click on the background rect (not on a path)
    fireEvent.click(svg, { clientX: 100, clientY: 100 });
    expect(useEditorStore.getState().textBoxes).toHaveLength(0);
  });

  it('clicking on a path does NOT create a text box', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    fireEvent.click(screen.getByTestId('pdf-path-p-0'));
    expect(useEditorStore.getState().textBoxes).toHaveLength(0);
  });

  it('clicking empty canvas while armed creates a text box and disarms', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    // Arm by setting the flag through the same path the TopBar button uses,
    // then force a re-render before firing the click — this avoids the
    // ordering hazard where fireEvent runs against the pre-update handler.
    act(() => {
      useEditorStore.getState().setAddTextBoxArmed(true);
    });
    expect(useEditorStore.getState().addTextBoxArmed).toBe(true);

    // Click somewhere on the empty area (far from the path).
    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });

    const state = useEditorStore.getState();
    expect(state.textBoxes).toHaveLength(1);
    expect(state.selectedTextBoxId).toBe(state.textBoxes[0].id);
    // One-shot: clicking disarms the tool.
    expect(state.addTextBoxArmed).toBe(false);
  });

  it('typing into a new text box updates its text', async () => {
    useEditorStore.getState().loadPdf(sampleParse);
    render(<EditorCanvas />);
    stubLayout();

    // Arm the tool so the canvas click creates a textbox.
    act(() => {
      useEditorStore.getState().setAddTextBoxArmed(true);
    });

    const overlay = document.querySelector('[data-hit-overlay]') as HTMLElement;
    fireEvent.click(overlay, { clientX: 100, clientY: 100 });

    const editable = document.querySelector(
      '[data-textbox-editing="true"]',
    ) as HTMLElement;
    expect(editable).toBeTruthy();

    await userEvent.type(editable, 'hello');
    expect(useEditorStore.getState().textBoxes[0].text).toBe('hello');
  });

  it('pressing Delete when a text box is selected removes it', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    // pre-seed a text box
    useEditorStore.getState().addTextBox({
      id: 'tb-1',
      x: 20,
      y: 30,
      width: 100,
      height: 40,
      text: 'sample',
      fontFamily: 'system-ui',
      fontSize: 16,
      color: '#000000',
      rotation: 0,
    });
    useEditorStore.getState().selectTextBox('tb-1');

    render(<EditorCanvas />);
    stubLayout();
    expect(screen.getByTestId('textbox-tb-1')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(useEditorStore.getState().textBoxes).toHaveLength(0);
  });

  it('clicking the × button on a selected text box removes it', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().addTextBox({
      id: 'tb-1',
      x: 20,
      y: 30,
      width: 100,
      height: 40,
      text: 'sample',
      fontFamily: 'system-ui',
      fontSize: 16,
      color: '#000000',
      rotation: 0,
    });
    useEditorStore.getState().selectTextBox('tb-1');

    render(<EditorCanvas />);
    stubLayout();
    fireEvent.click(screen.getByTestId('textbox-delete-tb-1'));

    expect(useEditorStore.getState().textBoxes).toHaveLength(0);
  });

  it('dragging a text box updates its x/y in the store', () => {
    useEditorStore.getState().loadPdf(sampleParse);
    useEditorStore.getState().addTextBox({
      id: 'tb-1',
      x: 50,
      y: 50,
      width: 100,
      height: 40,
      text: 'sample',
      fontFamily: 'system-ui',
      fontSize: 16,
      color: '#000000',
      rotation: 0,
    });

    render(<EditorCanvas />);
    stubLayout();

    const tb = screen.getByTestId('textbox-tb-1');
    fireEvent.pointerDown(tb, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(document, { clientX: 130, clientY: 110 });
    fireEvent.pointerUp(document, { clientX: 130, clientY: 110 });

    const after = useEditorStore.getState().textBoxes[0];
    expect(after.x).not.toBe(50);
    expect(after.y).not.toBe(50);
  });
});