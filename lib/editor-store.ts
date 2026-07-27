// Single Zustand store, organized into slices. As later milestones add features
// (color overrides, text boxes, undo/redo), they extend this same store via
// additional slices rather than spawning new stores — keeps cross-slice
// selectors trivial and avoids prop drilling.

import { create } from 'zustand';
import { DEFAULT_TEXT_BOX } from '@/lib/constants';
import type {
  ParseResult,
  PdfPath,
  PathId,
  TextBox,
  TextBoxId,
  ColorOverrideMap,
  PickerPos,
} from '@/lib/types';

let textBoxSeq = 0;
function makeId(prefix: string): TextBoxId {
  textBoxSeq += 1;
  return `${prefix}-${textBoxSeq}` as TextBoxId;
}

// --- Slice types ---------------------------------------------------------

export interface PathsSlice {
  paths: PdfPath[];
  page: { width: number; height: number } | null;
  loadPdf: (result: ParseResult) => void;
  /**
   * Convenience: parse a `File` (e.g. from the desktop open-file bridge
   * or a `<input type="file">`) and load it. Equivalent to parsing
   * externally and calling `loadPdf(result)`.
   */
  loadPdfFromFile: (file: File) => Promise<void>;
}

export interface SelectionSlice {
  selectedPathId: PathId | null;
  pickerPos: PickerPos | null;
  hoveredPathId: PathId | null;
  selectPath: (id: PathId | null) => void;
  openPicker: (pos: PickerPos) => void;
  closePicker: () => void;
  setHoveredPath: (id: PathId | null) => void;
}

// Placeholder slices — fleshed out in later milestones (M5/M6/M8).
// They're declared now so the store type is stable and the integration tests
// can mount SvgCanvas without TS errors.
export interface ColorsSlice {
  colorOverrides: ColorOverrideMap;
  applyColor: (id: PathId, color: ColorOverrideMap[PathId]) => void;
  resetColors: () => void;
}

export interface TextBoxesSlice {
  textBoxes: TextBox[];
  selectedTextBoxId: TextBoxId | null;
  addTextBox: (box: TextBox) => void;
  // Add a textbox at the visual center of the SVG with a fresh ID.
  // Used by the "添加文字框" TopBar button. `svgEl` is the live SVG element
  // (uses its bounding rect for the screen→page conversion) and `page` is
  // the SVG's PDF page dimensions.
  addTextBoxAtSvgCenter: (svgEl: SVGSVGElement) => void;
  updateTextBox: (id: TextBoxId, patch: Partial<TextBox>) => void;
  deleteTextBox: (id: TextBoxId) => void;
  selectTextBox: (id: TextBoxId | null) => void;
}

export interface ToolsSlice {
  // When true, the next empty-canvas click creates a textbox. Button toggles
  // this on; clicking on empty canvas (or pressing Esc) toggles it off.
  // Clicking a line while in this mode still opens the color picker (the
  // line's purpose takes priority over the tool state).
  addTextBoxArmed: boolean;
  setAddTextBoxArmed: (on: boolean) => void;
  // When true, textboxes are visual-only — they cannot be selected, dragged,
  // rotated, edited, or deleted. Clicking them falls through to the SVG
  // underneath, so the user can still pick a line that's hidden under a
  // textbox. Defaults to unlocked so a freshly-loaded PDF is ready to edit.
  textBoxesLocked: boolean;
  setTextBoxesLocked: (on: boolean) => void;
}

export interface HistorySlice {
  past: Array<{ overrides: ColorOverrideMap; textBoxes: TextBox[] }>;
  future: Array<{ overrides: ColorOverrideMap; textBoxes: TextBox[] }>;
  undo: () => void;
  redo: () => void;
}

export type EditorState = PathsSlice & SelectionSlice & ColorsSlice & TextBoxesSlice & ToolsSlice & HistorySlice;

// --- Initial state --------------------------------------------------------

const initialState = {
  paths: [] as PdfPath[],
  page: null as EditorState['page'],
  selectedPathId: null as PathId | null,
  pickerPos: null as PickerPos | null,
  colorOverrides: {} as ColorOverrideMap,
  textBoxes: [] as TextBox[],
  selectedTextBoxId: null as TextBoxId | null,
  addTextBoxArmed: false,
  textBoxesLocked: false,
  hoveredPathId: null as PathId | null,
  past: [] as HistorySlice['past'],
  future: [] as HistorySlice['future'],
};

// --- Store ----------------------------------------------------------------

function snapshot(s: EditorState): { overrides: ColorOverrideMap; textBoxes: TextBox[] } {
  return { overrides: s.colorOverrides, textBoxes: s.textBoxes };
}

export const useEditorStore = create<EditorState>((set) => ({
  ...initialState,

  loadPdf: (result) =>
    set({
      paths: result.paths,
      page: result.page,
      // Reset selection when a new PDF arrives.
      selectedPathId: null,
      pickerPos: null,
      colorOverrides: {},
      textBoxes: [],
      past: [],
      future: [],
    }),
  loadPdfFromFile: async (file) => {
    const { parsePdf } = await import('@/lib/pdf-parser');
    const result = await parsePdf(file);
    useEditorStore.setState({
      paths: result.paths,
      page: result.page,
      selectedPathId: null,
      pickerPos: null,
      colorOverrides: {},
      textBoxes: [],
      past: [],
      future: [],
    });
  },

  selectPath: (id) => set({ selectedPathId: id }),
  openPicker: (pos) => set({ pickerPos: pos }),
  closePicker: () => set({ pickerPos: null }),
  setHoveredPath: (id) => set({ hoveredPathId: id }),

  // Colors / text / history stubs — implemented in later milestones.
  applyColor: (id, color) =>
    set((s) => {
      const overrides = { ...s.colorOverrides, [id]: color };
      return {
        colorOverrides: overrides,
        pickerPos: null, // close picker after applying
        past: [...s.past, snapshot(s)].slice(-50),
        future: [],
      };
    }),
  resetColors: () => set((s) => ({
    colorOverrides: {},
    past: [...s.past, snapshot(s)].slice(-50),
    future: [],
  })),

  addTextBox: (box) => set((s) => ({
    textBoxes: [...s.textBoxes, box],
    past: [...s.past, snapshot(s)].slice(-50),
    future: [],
  })),
  addTextBoxAtSvgCenter: (svgEl) =>
    set((s) => {
      const page = s.page;
      if (!page) return s;
      const rect = svgEl.getBoundingClientRect();
      // SVG width/height attribute matches page — they're 1:1 here so the
      // screen-pixel center maps directly to (page.width/2, page.height/2).
      const cx = page.width / 2 - DEFAULT_TEXT_BOX.width / 2;
      const cy = page.height / 2 - DEFAULT_TEXT_BOX.height / 2;
      const id = makeId(`tb-${s.textBoxes.length}-${Date.now()}`);
      const box: TextBox = {
        id,
        x: cx,
        y: cy,
        ...DEFAULT_TEXT_BOX,
      };
      const next: EditorState = {
        ...s,
        textBoxes: [...s.textBoxes, box],
        selectedTextBoxId: id,
        past: [...s.past, snapshot(s)].slice(-50),
        future: [],
      };
      // Avoid unused-var warning for rect — kept for future use when the
      // SVG render size differs from page size.
      void rect;
      return next;
    }),
  updateTextBox: (id, patch) =>
    set((s) => ({
      textBoxes: s.textBoxes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),
  deleteTextBox: (id) => set((s) => ({
    textBoxes: s.textBoxes.filter((b) => b.id !== id),
    past: [...s.past, snapshot(s)].slice(-50),
    future: [],
  })),
  selectTextBox: (id) => set({ selectedTextBoxId: id }),

  setAddTextBoxArmed: (on) => set({ addTextBoxArmed: on }),

  setTextBoxesLocked: (on) =>
    set((s) => ({
      textBoxesLocked: on,
      // Disarming & deselecting on lock keeps the visual state coherent:
      // no half-selected textbox visible while locked, no in-flight tool.
      addTextBoxArmed: on ? false : s.addTextBoxArmed,
      selectedTextBoxId: on ? null : s.selectedTextBoxId,
    })),

  undo: () => set((s) => {
    if (s.past.length === 0) return s;
    const last = s.past[s.past.length - 1];
    return {
      past: s.past.slice(0, -1),
      future: [...s.future, snapshot(s)],
      colorOverrides: last.overrides,
      textBoxes: last.textBoxes,
    };
  }),
  redo: () => set((s) => {
    if (s.future.length === 0) return s;
    const next = s.future[s.future.length - 1];
    return {
      future: s.future.slice(0, -1),
      past: [...s.past, snapshot(s)],
      colorOverrides: next.overrides,
      textBoxes: next.textBoxes,
    };
  }),
}));

// --- Selectors ------------------------------------------------------------
// Use these as `useEditorStore(selectColorFor(pathId))` — they keep re-renders
// scoped to the data each component actually reads.

import type { FixedColor } from '@/lib/types';
export const selectColorFor = (id: PathId) => (s: EditorState): FixedColor => {
  const override = s.colorOverrides[id];
  if (override) return override;
  const path = s.paths.find((p) => p.id === id);
  // Black fallback shouldn't occur — every path comes from parsePdf with a
  // valid legend color. Guarded so the selector is total.
  return path?.originalColor ?? ('#000000' as FixedColor);
};