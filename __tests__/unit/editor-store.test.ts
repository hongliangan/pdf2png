import { describe, it, expect, beforeEach } from 'vitest';
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
  page: { width: 595.22, height: 842 },
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

describe('editor-store — paths & selection slices (M3)', () => {
  beforeEach(resetStore);

  describe('initial state', () => {
    it('starts with empty paths, no page, no selection', () => {
      const state = useEditorStore.getState();
      expect(state.paths).toEqual([]);
      expect(state.page).toBeNull();
      expect(state.selectedPathId).toBeNull();
      expect(state.pickerPos).toBeNull();
    });
  });

  describe('loadPdf', () => {
    it('replaces paths and sets page dimensions', () => {
      useEditorStore.getState().loadPdf(sampleParse);
      const state = useEditorStore.getState();
      expect(state.paths).toHaveLength(2);
      expect(state.page).toEqual({ width: 595.22, height: 842 });
    });

    it('clears any prior selection when loading a new PDF', () => {
      useEditorStore.getState().selectPath('p-0' as PathId);
      useEditorStore.getState().loadPdf(sampleParse);
      expect(useEditorStore.getState().selectedPathId).toBeNull();
    });
  });

  describe('selectPath', () => {
    it('sets selectedPathId', () => {
      useEditorStore.getState().loadPdf(sampleParse);
      useEditorStore.getState().selectPath('p-1' as PathId);
      expect(useEditorStore.getState().selectedPathId).toBe('p-1');
    });

    it('accepts null to clear selection', () => {
      useEditorStore.getState().loadPdf(sampleParse);
      useEditorStore.getState().selectPath('p-0' as PathId);
      useEditorStore.getState().selectPath(null);
      expect(useEditorStore.getState().selectedPathId).toBeNull();
    });
  });

  describe('openPicker / closePicker', () => {
    it('stores picker position when openPicker is called', () => {
      useEditorStore.getState().openPicker({ x: 100, y: 200 });
      expect(useEditorStore.getState().pickerPos).toEqual({ x: 100, y: 200 });
    });

    it('clears picker position on closePicker', () => {
      useEditorStore.getState().openPicker({ x: 1, y: 2 });
      useEditorStore.getState().closePicker();
      expect(useEditorStore.getState().pickerPos).toBeNull();
    });
  });
});