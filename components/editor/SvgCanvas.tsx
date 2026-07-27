'use client';

import { useCallback } from 'react';
import { useEditorStore, selectColorFor } from '@/lib/editor-store';
import type { PathId } from '@/lib/types';

/**
 * Renders the parsed PDF page as a fixed-coordinate SVG.
 *
 * Hit-testing for path clicks is handled by the HTML overlay div owned by
 * `EditorCanvas` (the `<div data-hit-overlay>` next to this SVG). It walks
 * every path's bbox on each click — for ~354 paths this is microseconds.
 * We don't put an onClick on the paths or the <g> because SVG stroke
 * hit-testing is finicky in Chromium and Firefox (especially with the thin
 * strokes our PDFs emit).
 *
 * Each path still carries `data-path-id` / `data-testid` so the editor
 * (color-picker, bbox lookups) can find them via standard DOM queries.
 *
 * Accepts an optional `svgRef` so parent components (e.g. EditorCanvas)
 * can access the underlying <svg> DOM node for sizing/positioning.
 */
export function SvgCanvas({
  svgRef,
}: {
  svgRef?: React.RefObject<SVGSVGElement | null>;
} = {}) {
  const paths = useEditorStore((s) => s.paths);
  const page = useEditorStore((s) => s.page);

  // Hooks must run in the same order every render — declare them before
  // any early-return.
  const setSvgRef = useCallback(
    (node: SVGSVGElement | null) => {
      if (svgRef) svgRef.current = node;
    },
    [svgRef],
  );

  if (!page || paths.length === 0) return null;

  return (
    <svg
      ref={setSvgRef}
      role="img"
      aria-label="PDF road network"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${page.width} ${page.height}`}
      // Explicit pixel size so the SVG never collapses to 0 in any wrapping
      // element (the HTML overlay above). Tailwind's `max-w-full` lets the
      // SVG scale down responsively without exceeding the container width.
      width={page.width}
      height={page.height}
      preserveAspectRatio="xMidYMid meet"
      className="block bg-white max-w-full h-auto"
    >
      <rect width="100%" height="100%" fill="white" pointerEvents="none" />
      <g pointerEvents="none">
        {paths.map((p) => (
          <Path key={p.id} id={p.id} d={p.d} strokeWidth={p.strokeWidth} />
        ))}
      </g>
    </svg>
  );
}

function Path({
  id,
  d,
  strokeWidth,
}: {
  id: PathId;
  d: string;
  strokeWidth: number;
}) {
  const stroke = useEditorStore(selectColorFor(id));
  const isSelected = useEditorStore((s) => s.selectedPathId === id);
  const isHovered = useEditorStore((s) => s.hoveredPathId === id);
  // Selected gets a strong halo; hovered (without being selected) gets a
  // subtle halo so users can see what's clickable as they sweep the mouse.
  const w = isSelected ? strokeWidth * 1.6 : strokeWidth;
  const haloOpacity = isSelected ? 0.45 : isHovered ? 0.25 : 0;
  const haloExtra = isSelected ? 5 : isHovered ? 3 : 0;
  return (
    <>
      {(isSelected || isHovered) && (
        <path
          // Halo: same geometry, wider and semi-transparent. Drawn FIRST so
          // it sits beneath the main stroke. Reads as a soft glow around
          // the selected line. Same trick is used for hover preview.
          d={d}
          stroke={stroke}
          strokeWidth={w + haloExtra}
          strokeOpacity={haloOpacity}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d={d}
        stroke={stroke}
        strokeWidth={w}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-path-id={id}
        data-testid={`pdf-path-${id}`}
        data-selected={isSelected ? 'true' : 'false'}
        data-hovered={isHovered ? 'true' : 'false'}
        // Selected paths render with a slightly thicker stroke to make the
        // state obvious even without the halo (e.g. on monochrome prints).
        style={
          isSelected
            ? { filter: 'drop-shadow(0 0 1.5px currentColor)' }
            : isHovered
            ? { filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.18))' }
            : undefined
        }
      />
    </>
  );
}
