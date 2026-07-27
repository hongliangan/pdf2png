'use client';

import { useEffect, useState } from 'react';
import { useEditorStore } from '@/lib/editor-store';
import { DPI_VALUES, FONT_SIZES } from '@/lib/constants';
import { buildEditorSvg, exportSvgToBlob } from '@/lib/exporter';
import type { Dpi, ExportFormat, FontSize } from '@/lib/types';

// Shape of the preload bridge injected by `electron/preload.ts`. We narrow
// to the surface we use; the bridge is absent in plain browser dev so the
// code falls back to the existing `<input type="file">` flow.
type ElectronApi = {
  openFile: () => Promise<{ name: string; bytes: Uint8Array } | null>;
  onOpenFile: (
    handler: (result: { name: string; bytes: Uint8Array }) => void,
  ) => () => void;
  platform: NodeJS.Platform;
};
declare global {
  interface Window {
    electron?: ElectronApi;
  }
}

/**
 * Top toolbar with Reset / Undo / Redo / TextBox-add and Export actions.
 * Hidden until a PDF is loaded.
 */
export function TopBar() {
  const paths = useEditorStore((s) => s.paths);
  const page = useEditorStore((s) => s.page);
  const colorOverrides = useEditorStore((s) => s.colorOverrides);
  const textBoxes = useEditorStore((s) => s.textBoxes);
  const resetColors = useEditorStore((s) => s.resetColors);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const pastLen = useEditorStore((s) => s.past.length);
  const futureLen = useEditorStore((s) => s.future.length);
  const addTextBoxAtSvgCenter = useEditorStore(
    (s) => s.addTextBoxAtSvgCenter,
  );
  const addTextBoxArmed = useEditorStore((s) => s.addTextBoxArmed);
  const setAddTextBoxArmed = useEditorStore((s) => s.setAddTextBoxArmed);
  const textBoxesLocked = useEditorStore((s) => s.textBoxesLocked);
  const setTextBoxesLocked = useEditorStore((s) => s.setTextBoxesLocked);
  const selectedTextBoxId = useEditorStore((s) => s.selectedTextBoxId);
  const updateTextBox = useEditorStore((s) => s.updateTextBox);

  const [dpi, setDpi] = useState<Dpi>(150);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  // The font-size selector maps the selected textbox's current fontSize.
  // Selecting a value updates the selected textbox in place and falls back
  // to a sensible default when nothing is selected.
  const selectedTextBox = textBoxes.find((tb) => tb.id === selectedTextBoxId);
  const selectedFontSize: FontSize = (selectedTextBox?.fontSize as FontSize) ?? 16;

  // Pipe a File from the preload bridge (Electron `File > Open PDF…` or
  // any in-app trigger) into the existing PDF-load path used by the file
  // picker. No-op when the bridge is absent (browser dev). Hooks must
  // run before any early-return below.
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electron : undefined;
    if (!api) return;
    const unsubscribe = api.onOpenFile(({ name, bytes }) => {
      // Copy into a fresh Uint8Array so the File's BlobPart is a real
      // ArrayBuffer (not the preload bridge's SharedArrayBuffer-tagged
      // view, which trips TS 5.7+ type checks).
      const copy = new Uint8Array(bytes);
      const file = new File([copy], name, { type: 'application/pdf' });
      useEditorStore.getState().loadPdfFromFile(file);
    });
    return unsubscribe;
  }, []);

  // Same as above but triggered by an in-app button (TopBar's "打开 PDF…").
  // Calls into the preload bridge which shows the native dialog.
  async function pickFileViaElectron(): Promise<void> {
    const api = typeof window !== 'undefined' ? window.electron : undefined;
    if (!api) return;
    const result = await api.openFile();
    if (!result) return;
    const copy = new Uint8Array(result.bytes);
    const file = new File([copy], result.name, { type: 'application/pdf' });
    useEditorStore.getState().loadPdfFromFile(file);
  }

  function changeSelectedFontSize(size: FontSize) {
    if (!selectedTextBoxId) return;
    updateTextBox(selectedTextBoxId, { fontSize: size });
  }

  if (paths.length === 0) return null;

  /**
   * Trigger a browser download of `blob` named `filename`. The most
   * reliable pattern across browsers: build a temporary <a> in the DOM,
   * simulate a click, then revoke the object URL. Avoids the brittleness
   * of relying on `useEffect` to click a React-rendered anchor (the
   * previous approach missed clicks because `useEffect([])` ran before
   * the anchor existed in the DOM).
   */
  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // Some browsers ignore programmatic clicks on detached <a>, so the
    // element must be in the document.
    a.style.position = 'fixed';
    a.style.left = '-9999px';
    document.body.appendChild(a);
    a.click();
    // Defer cleanup so Chromium can capture the click before removal.
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  }

  async function handleExport(fmt: ExportFormat) {
    if (!page || exportBusy) return;
    setExportBusy(true);
    setExportError(null);
    try {
      const svg = buildEditorSvg({
        page,
        paths,
        textBoxes,
        colorOverrides,
      });
      const blob = await exportSvgToBlob(svg, fmt, dpi);
      const ext = fmt === 'png' ? 'png' : 'jpg';
      triggerDownload(blob, `roadmap.${ext}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div
      data-testid="top-bar"
      className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2"
    >
      <button
        type="button"
        data-testid="reset-button"
        onClick={resetColors}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm transition hover:bg-gray-50"
      >
        还原初始颜色
      </button>
      {typeof window !== 'undefined' && window.electron && (
        <button
          type="button"
          data-testid="open-pdf-button"
          onClick={pickFileViaElectron}
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm transition hover:bg-gray-50"
        >
          打开 PDF…
        </button>
      )}
      <div className="mx-2 h-5 w-px bg-gray-200" />
      <button
        type="button"
        data-testid="lock-textboxes-button"
        aria-pressed={!textBoxesLocked}
        onClick={() => setTextBoxesLocked(!textBoxesLocked)}
        title={
          textBoxesLocked
            ? '文字框已锁定 — 点击解锁后才能选中/拖动/编辑'
            : '文字框已解锁 — 点击锁定'
        }
        className={
          'rounded-md border px-3 py-1 text-sm transition ' +
          (textBoxesLocked
            ? 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
            : 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600')
        }
      >
        {textBoxesLocked ? '🔒 文字框已锁定' : '🔓 文字框已解锁'}
      </button>
      <button
        type="button"
        data-testid="add-textbox-button"
        aria-pressed={addTextBoxArmed}
        disabled={textBoxesLocked}
        onClick={() => {
          if (textBoxesLocked) return;
          if (addTextBoxArmed) {
            setAddTextBoxArmed(false);
            return;
          }
          setAddTextBoxArmed(true);
          const svg = document.querySelector('svg');
          if (svg) addTextBoxAtSvgCenter(svg);
        }}
        className={
          'rounded-md border px-3 py-1 text-sm transition ' +
          (textBoxesLocked
            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
            : addTextBoxArmed
            ? 'border-blue-500 bg-blue-500 text-white'
            : 'border-gray-300 bg-white hover:bg-gray-50')
        }
      >
        {addTextBoxArmed && !textBoxesLocked ? '✓ 点击空白处放置' : '添加文字框'}
      </button>
      <label
        className="flex items-center gap-1 text-sm text-gray-700"
        title={
          selectedTextBoxId
            ? '调整选中文字框字号'
            : '先选中一个文字框再调整字号'
        }
      >
        字号:
        <select
          data-testid="font-size-select"
          value={selectedFontSize}
          disabled={!selectedTextBoxId}
          onChange={(e) => changeSelectedFontSize(Number(e.target.value) as FontSize)}
          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        data-testid="undo-button"
        onClick={undo}
        disabled={pastLen === 0}
        aria-label="Undo"
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
      >
        ↶ 撤销
      </button>
      <button
        type="button"
        data-testid="redo-button"
        onClick={redo}
        disabled={futureLen === 0}
        aria-label="Redo"
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
      >
        ↷ 重做
      </button>

      <div className="mx-2 h-5 w-px bg-gray-200" />
      <label className="flex items-center gap-1 text-sm text-gray-700">
        DPI:
        <select
          data-testid="dpi-select"
          value={dpi}
          onChange={(e) => setDpi(Number(e.target.value) as Dpi)}
          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-sm"
        >
          {DPI_VALUES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        data-testid="export-png-button"
        onClick={() => handleExport('png')}
        disabled={exportBusy}
        className="rounded-md border border-blue-500 bg-blue-500 px-3 py-1 text-sm text-white transition hover:bg-blue-600 disabled:opacity-50"
      >
        {exportBusy ? '…导出中' : '导出 PNG'}
      </button>
      <button
        type="button"
        data-testid="export-jpg-button"
        onClick={() => handleExport('jpeg')}
        disabled={exportBusy}
        className="rounded-md border border-emerald-500 bg-emerald-500 px-3 py-1 text-sm text-white transition hover:bg-emerald-600 disabled:opacity-50"
      >
        {exportBusy ? '…导出中' : '导出 JPG'}
      </button>

      {exportError && (
        <div
          data-testid="export-error"
          role="alert"
          className="ml-2 rounded-md border border-red-300 bg-red-50 px-3 py-1 text-sm text-red-700"
        >
          导出失败：{exportError}
        </div>
      )}
    </div>
  );
}
