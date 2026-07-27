'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useEditorStore } from '@/lib/editor-store';
import { TextBox } from './TextBox';

/**
 * Absolute-positioned overlay that renders every text box on top of the
 * SVG. Coordinates are translated from PDF user-space to viewport pixels
 * using a ResizeObserver-driven scale measurement (computed in an effect, not
 * during render — the SVG DOM ref's `.current` is set during commit and
 * reading it inline would trip react-hooks/refs).
 */
export function TextBoxLayer({
  svgRef,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const textBoxes = useEditorStore((s) => s.textBoxes);
  const locked = useEditorStore((s) => s.textBoxesLocked);
  const [scale, setScale] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const page = useEditorStore.getState().page;
    if (!svg || !page) {
      setScale(null);
      return;
    }
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      setScale({ x: rect.width / page.width, y: rect.height / page.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef, textBoxes.length]);

  if (!scale) return null;

  return (
    <div
      data-textbox-layer
      className={
        'pointer-events-none absolute inset-0' +
        (locked ? ' data-textbox-locked' : '')
      }
    >
      {textBoxes.map((tb) => (
        <div
          key={tb.id}
          className="absolute"
          style={{
            left: `${tb.x * scale.x}px`,
            top: `${tb.y * scale.y}px`,
            width: `${tb.width * scale.x}px`,
            height: `${tb.height * scale.y}px`,
            // Inherit pointer-events from the layer (pointer-events-none)
            // when locked, so clicks pass through. Otherwise auto, so TextBox
            // can receive drag/edit/etc.
            pointerEvents: locked ? 'none' : 'auto',
          }}
        >
          <TextBox box={tb} svgRef={svgRef} locked={locked} />
        </div>
      ))}
    </div>
  );
}
