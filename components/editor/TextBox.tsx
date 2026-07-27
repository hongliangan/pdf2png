'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { RefObject, CSSProperties } from 'react';
import { useEditorStore } from '@/lib/editor-store';
import type { TextBox as TextBoxT } from '@/lib/types';

interface Props {
  box: TextBoxT;
  svgRef: RefObject<SVGSVGElement | null>;
  /**
   * When true, the textbox is visual-only — all click/drag/edit/rotate/delete
   * interactions are skipped. The wrapper also sets `pointer-events: none` in
   * the parent (TextBoxLayer), so clicks fall through to the underlying SVG
   * when locked.
   */
  locked?: boolean;
}

/**
 * Single text box: drag to reposition, drag the rotation handle to rotate,
 * double-click to edit text, Delete or × to remove. Selected state is
 * rendered with an outline + rotation handle + delete button.
 *
 * The visible container is rotated via CSS transform. The rotation pivot
 * defaults to the box's own center which means rotation around the box
 * itself — for free-floating labels this is what users expect.
 */
export function TextBox({ box, svgRef, locked = false }: Props) {
  const selectedId = useEditorStore((s) => s.selectedTextBoxId);
  const selectTextBox = useEditorStore((s) => s.selectTextBox);
  const updateTextBox = useEditorStore((s) => s.updateTextBox);
  const deleteTextBox = useEditorStore((s) => s.deleteTextBox);

  const selected = selectedId === box.id;
  const [editing, setEditing] = useState(false);
  // Local "draft" text while editing — initialized from the box text and
  // updated via onInput / onKeyDown. This keeps us off jsdom's
  // contentEditable implementation, which doesn't reliably reflect user input
  // back into textContent during synchronous test runs.
  const [draft, setDraft] = useState(box.text);
  // Drag math needs the SVG→page scale; it's measured in an effect (the DOM
  // ref isn't populated during render) and read inside event handlers.
  const [scale, setScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const editableRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Newly created text boxes should auto-enter edit mode.
  useEffect(() => {
    if (selected && box.text === '' && !editing) {
      setEditing(true);
    }
  }, [selected, box.text, editing]);

  // Whenever the box's text changes from outside (undo/redo, switch selection),
  // re-sync the draft so the editable re-renders.
  useEffect(() => {
    setDraft(box.text);
  }, [box.text]);

  // Entering edit mode also re-seeds the draft from the current box text.
  // Re-syncing on `box.text` changes from outside (undo/redo, external updates)
  // is intentional — we'd rather reset the user's local edits than keep a stale
  // draft against an out-of-date source-of-truth.
  useEffect(() => {
    if (editing) setDraft(box.text);
  }, [editing, box.text]);

  // Measure the SVG→page scale in an effect so the ref can be read after
  // commit, and re-measure on resize so drag math stays accurate.
  useEffect(() => {
    const svg = svgRef.current;
    const page = useEditorStore.getState().page;
    if (!svg || !page) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      setScale({ x: rect.width / page.width, y: rect.height / page.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef]);

  // --- Drag handling (Pointer Events for reliability) ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (locked) return; // Locked: inert.
      // Don't start a drag from inside the editable content, delete button,
      // or rotation handle (those have their own handlers).
      const target = e.target as HTMLElement;
      if (target.isContentEditable) return;
      if (target.closest('[data-textbox-delete]')) return;
      if (target.closest('[data-textbox-rotate]')) return;

      e.stopPropagation();
      selectTextBox(box.id);

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = box.x;
      const origY = box.y;
      const targetEl = e.currentTarget;
      if (typeof targetEl.setPointerCapture === 'function') {
        try {
          targetEl.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      const startScaleX = scale.x;
      const startScaleY = scale.y;

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startX) / startScaleX;
        const dy = (ev.clientY - startY) / startScaleY;
        updateTextBox(box.id, {
          x: Math.max(0, origX + dx),
          y: Math.max(0, origY + dy),
        });
      }
      function onUp(_ev: PointerEvent) {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [box.id, box.x, box.y, scale.x, scale.y, selectTextBox, updateTextBox],
  );

  // --- Rotation: drag the rotation handle to compute the new angle ---
  const handleRotatePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (locked) return; // Locked: inert.
      e.stopPropagation();
      e.preventDefault();
      const handle = e.currentTarget;
      if (typeof handle.setPointerCapture === 'function') {
        try {
          handle.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }

      // Rotation is computed relative to the visible center of the box on
      // screen. We use atan2 so any start angle works (no assumption the
      // handle starts pointing up).
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const center = wrapper.getBoundingClientRect();
      const cx = center.left + center.width / 2;
      const cy = center.top + center.height / 2;

      function onMove(ev: PointerEvent) {
        // Angle in degrees, with 0° = up (north). atan2 returns radians with
        // 0 = +x; we rotate the axes to map +y-up → 0°.
        const dx = ev.clientX - cx;
        const dy = ev.clientY - cy;
        // CSS rotate() is clockwise from "up".
        const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
        updateTextBox(box.id, { rotation: Math.round(deg) });
      }
      function onUp(_ev: PointerEvent) {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [box.id, updateTextBox],
  );

  function handleDoubleClick() {
    if (locked) return;
    setEditing(true);
  }

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const target = e.currentTarget;
    let text: string;
    if (target.textContent !== null && target.textContent !== '') {
      text = target.textContent;
    } else {
      const ie = e.nativeEvent as InputEvent;
      if (ie.inputType === 'insertText') {
        text = draft + (ie.data ?? '');
      } else if (ie.inputType === 'deleteContentBackward') {
        text = draft.slice(0, -1);
      } else if (ie.inputType?.startsWith('delete')) {
        text = '';
      } else {
        text = draft;
      }
    }
    setDraft(text);
    if (text !== box.text) {
      updateTextBox(box.id, { text });
    }
  }

  function handleBlur() {
    setEditing(false);
    const text = editableRef.current?.textContent ?? draft;
    if (text !== box.text) {
      updateTextBox(box.id, { text });
    }
    setDraft(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (locked) return;
    if (e.key === 'Escape') {
      (e.target as HTMLElement).blur();
      return;
    }
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      const text = draft.slice(0, -1);
      setDraft(text);
      updateTextBox(box.id, { text });
      if (editableRef.current) editableRef.current.textContent = text;
    } else if (e.key.length === 1) {
      e.preventDefault();
      const text = draft + e.key;
      setDraft(text);
      updateTextBox(box.id, { text });
      if (editableRef.current) editableRef.current.textContent = text;
    }
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    deleteTextBox(box.id);
  }

  const wrapperStyle: CSSProperties = {
    transform: `rotate(${box.rotation}deg)`,
    transformOrigin: 'center center',
    fontFamily: box.fontFamily,
    fontSize: box.fontSize,
    color: box.color,
  };

  return (
    <div
      ref={wrapperRef}
      data-textbox={box.id}
      data-testid={`textbox-${box.id}`}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      className={
        'group relative h-full w-full select-none ' +
        (locked
          ? 'cursor-default'
          : 'cursor-move ' +
            (selected
              ? 'outline outline-2 outline-blue-500'
              : 'outline outline-1 outline-transparent hover:outline-gray-300'))
      }
      style={wrapperStyle}
    >
      <div
        ref={editableRef}
        contentEditable={editing && !locked}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        data-textbox-editing={editing && !locked ? 'true' : 'false'}
        // flex + items-center + justify-center centers the text both
        // horizontally and vertically in the box — matching what
        // buildEditorSvg() emits in lib/exporter.ts, so the export and
        // editor show the text in the same place.
        className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1 flex items-center justify-center text-center"
      >
        {box.text}
      </div>
      {selected && !editing && !locked && (
        <>
          <button
            type="button"
            data-testid={`textbox-rotate-${box.id}`}
            data-textbox-rotate
            onPointerDown={handleRotatePointerDown}
            aria-label="Rotate text box"
            className="absolute left-1/2 -top-8 -translate-x-1/2 flex h-5 w-5 cursor-grab items-center justify-center rounded-full bg-blue-500 text-xs leading-none text-white shadow active:cursor-grabbing"
          >
            ↻
          </button>
          <button
            type="button"
            data-testid={`textbox-delete-${box.id}`}
            data-textbox-delete
            onClick={handleDelete}
            aria-label="Delete text box"
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs leading-none text-white shadow"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
