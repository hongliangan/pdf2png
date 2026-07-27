'use client';

import { useCallback, useRef, useState } from 'react';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { TopBar } from '@/components/editor/TopBar';
import { useEditorStore } from '@/lib/editor-store';
import { parsePdf } from '@/lib/pdf-parser';

/**
 * Top-level route: empty-state + file upload, then once a PDF is parsed the
 * editor chrome (TopBar + EditorCanvas) becomes visible. We keep this in a
 * separate file so page.tsx stays a Server Component (no 'use client' needed
 * higher up the tree).
 */
export function EditorRoute() {
  const page = useEditorStore((s) => s.page);
  const loadPdf = useEditorStore((s) => s.loadPdf);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef<HTMLLabelElement | null>(null);

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        const result = await parsePdf(file);
        loadPdf(result);
      } catch (e) {
        setError(
          e instanceof Error
            ? `${e.name}: ${e.message}`
            : String(e),
        );
      } finally {
        setBusy(false);
      }
    },
    [loadPdf],
  );

  if (page) {
    return (
      <main className="flex flex-1 flex-col">
        <TopBar />
        <div className="flex flex-1 items-start justify-center overflow-auto bg-gray-50 p-4">
          <EditorCanvas />
        </div>
      </main>
    );
  }

  return (
    <main
      data-testid="empty-state"
      className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16"
    >
      <h1 className="text-3xl font-semibold tracking-tight">PDF 路网编辑器</h1>
      <p className="text-muted-foreground max-w-md text-center">
        上传一张 PDF 路网图，在网页上点击任意线段改色、添加文字框，导出 PNG / JPG。
      </p>
      <label
        ref={dropRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={
          'flex w-full max-w-xl cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-center transition ' +
          (dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400')
        }
      >
        <input
          type="file"
          accept="application/pdf"
          data-testid="pdf-file-input"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <p className="text-base font-medium text-gray-800">
          {busy ? '正在解析…' : '拖入 PDF，或点击选择文件'}
        </p>
        <p className="text-xs text-gray-500">
          仅支持 application/pdf，大小不做限制
        </p>
      </label>
      {error && (
        <div
          data-testid="parse-error"
          role="alert"
          className="max-w-xl rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}
    </main>
  );
}
