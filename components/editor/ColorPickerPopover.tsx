'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '@/lib/editor-store';
import { FIXED_COLORS } from '@/lib/constants';

/**
 * Floating 4-swatch popover that appears next to the clicked path. Click a
 * swatch to apply the override; click anywhere outside to dismiss without
 * changing colors.
 */
export function ColorPickerPopover() {
  const pickerPos = useEditorStore((s) => s.pickerPos);
  const selectedPathId = useEditorStore((s) => s.selectedPathId);
  const applyColor = useEditorStore((s) => s.applyColor);
  const closePicker = useEditorStore((s) => s.closePicker);

  const ref = useRef<HTMLDivElement | null>(null);

  // Outside-click / outside-mousedown dismissal. Use mousedown so we close
  // before any subsequent click on another path fires.
  useEffect(() => {
    if (!pickerPos) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!ref.current || !target) return;
      if (ref.current.contains(target)) return;
      // Don't dismiss when the click is on another SVG path — SvgCanvas will
      // handle re-opening the picker for the new path.
      const pathEl = (target as Element).closest?.('[data-path-id]');
      if (pathEl) return;
      closePicker();
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [pickerPos, closePicker]);

  if (!pickerPos || !selectedPathId || typeof document === 'undefined') {
    return null;
  }

  const handleSwatchClick = (color: (typeof FIXED_COLORS)[number]) => {
    applyColor(selectedPathId, color);
  };

  return createPortal(
    <div
      ref={ref}
      data-testid="color-picker-popover"
      role="dialog"
      aria-label="Pick a color"
      style={{
        position: 'absolute',
        left: `${pickerPos.x}px`,
        top: `${pickerPos.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
      className="z-50 flex gap-1 rounded-md border bg-white p-1 shadow-md"
    >
      {FIXED_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Apply color ${color}`}
          data-testid={`color-swatch-${color}`}
          data-color={color}
          onClick={() => handleSwatchClick(color)}
          className="h-6 w-6 cursor-pointer rounded-sm border border-gray-300 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-400"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>,
    document.body,
  );
}