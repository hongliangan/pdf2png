'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { SvgCanvas } from './SvgCanvas';
import { TextBoxLayer } from './TextBoxLayer';
import { ColorPickerPopover } from './ColorPickerPopover';
import { useEditorStore } from '@/lib/editor-store';
import { DEFAULT_TEXT_BOX, PATH_HIT_PADDING, PATH_NEAREST_PADDING } from '@/lib/constants';
import type { TextBox, PdfPath } from '@/lib/types';

/**
 * Root editor surface. Three stacked layers:
 *
 *   1. SVG (paths, drawn via SvgCanvas — pointer-events=none so it doesn't
 *      interfere with clicks)
 *   2. HTML hit-overlay div that captures pointer clicks and runs the path
 *      hit-test. Clicking near a path opens the color picker; clicking
 *      elsewhere bubbles up and creates a textbox in step 3.
 *   3. TextBox overlay (foreignObject-style positioned divs).
 *
 * Why an HTML overlay for hit-testing: SVG stroke hit-testing is unreliable
 * across browsers — Chromium treats transparent strokes as unpainted for
 * pointer-events purposes, and the parser-extracted strokes are very thin
 * anyway (~3 user units). The HTML overlay computes screen-position bboxes
 * from path.bbox and PATH_HIT_PADDING, then matches click coords.
 */
export function EditorCanvas() {
  const page = useEditorStore((s) => s.page);
  const paths = useEditorStore((s) => s.paths);
  const colorOverrides = useEditorStore((s) => s.colorOverrides);
  const textBoxes = useEditorStore((s) => s.textBoxes);
  const selectedPathId = useEditorStore((s) => s.selectedPathId);
  const addTextBoxArmed = useEditorStore((s) => s.addTextBoxArmed);
  const addTextBox = useEditorStore((s) => s.addTextBox);
  const selectPath = useEditorStore((s) => s.selectPath);
  const openPicker = useEditorStore((s) => s.openPicker);
  const setAddTextBoxArmed = useEditorStore((s) => s.setAddTextBoxArmed);
  const textBoxesLocked = useEditorStore((s) => s.textBoxesLocked);
  const setHoveredPath = useEditorStore((s) => s.setHoveredPath);
  const hoveredPathId = useEditorStore((s) => s.hoveredPathId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Global keyboard shortcuts (undo/redo, delete) — see other layers.
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const cmdOrCtrl = e.metaKey || e.ctrlKey;

      if (cmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        if (inEditable) return;
        e.preventDefault();
        const store = useEditorStore.getState();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (inEditable) return;
        const store = useEditorStore.getState();
        if (store.textBoxesLocked) return; // Locked: textboxes can't be deleted.
        const sel = store.selectedTextBoxId;
        if (!sel) return;
        store.deleteTextBox(sel);
        store.selectTextBox(null);
      }
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);

  // Hooks must always run in the same order — declare them before any
  // early returns below.
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!page || !svgRef.current || !overlayRef.current) return;

      const overlayRect = overlayRef.current.getBoundingClientRect();
      const clickX = e.clientX - overlayRect.left;
      const clickY = e.clientY - overlayRect.top;
      const scaleX = overlayRect.width / page.width;
      const scaleY = overlayRect.height / page.height;

      // Two-tier hit-test:
      //   1. Fast path — bbox-containment with padding. Catches the
      //      common case instantly without walking the full path list.
      //   2. Slow fallback — nearest path within a screen-pixel threshold.
      //      Catches the case where a single visible road is split into
      //      multiple <path> elements in the PDF: clicks land in the gap
      //      between two segments but should still select the visually
      //      adjacent line. Without this fallback only the segment whose
      //      bbox contains the click registers.
      const best = findClickedPath(
        paths,
        clickX,
        clickY,
        scaleX,
        scaleY,
        PATH_HIT_PADDING,
        PATH_NEAREST_PADDING,
      );

      if (best) {
        e.stopPropagation();
        selectPath(best.id);
        const midX =
          ((best.bbox.minX + best.bbox.maxX) / 2) * scaleX + overlayRect.left;
        const midY =
          ((best.bbox.minY + best.bbox.maxY) / 2) * scaleY + overlayRect.top;
        openPicker({ x: midX, y: midY });
        // A line click also disarms the "add textbox" tool — the user
        // clearly intended to edit the line, not drop a label.
        if (addTextBoxArmed) setAddTextBoxArmed(false);
        return;
      }

      // No path hit. If the "add textbox" tool is armed AND textboxes are
      // unlocked, drop one here; otherwise this click is a no-op.
      if (addTextBoxArmed && !textBoxesLocked) {
        e.stopPropagation();
        const px = e.clientX - overlayRect.left;
        const py = e.clientY - overlayRect.top;
        const x = (px / overlayRect.width) * page.width;
        const y = (py / overlayRect.height) * page.height;
        const box: TextBox = {
          id: `tb-armed-${Date.now()}` as TextBox['id'],
          x: Math.max(0, x - DEFAULT_TEXT_BOX.width / 2),
          y: Math.max(0, y - DEFAULT_TEXT_BOX.height / 2),
          ...DEFAULT_TEXT_BOX,
        };
        addTextBox(box);
        useEditorStore.getState().selectTextBox(box.id);
        setAddTextBoxArmed(false);
      }
    },
    [page, paths, selectPath, openPicker, addTextBoxArmed, addTextBox, setAddTextBoxArmed, textBoxesLocked],
  );

  // The "add textbox" tool is now exclusively controlled by the
  // `addTextBoxArmed` flag in the store. Empty-area clicks do nothing
  // unless the user has armed it (handled in `handleOverlayClick`).
  // We still attach this handler to the container so bubble events from
  // anywhere (textbox clicks etc.) have a destination; it's a no-op.
  const handleBackgroundClick = useCallback(
    (_e: React.MouseEvent<HTMLDivElement>) => {},
    [],
  );

  // Hover preview — when the user's mouse is over a path, mark it in the
  // store so Path can render a soft halo. Discoverability: the user sees
  // the line lighten as they sweep over it, confirming the click target.
  const handleOverlayMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!overlayRef.current) return;
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const cx = e.clientX - overlayRect.left;
      const cy = e.clientY - overlayRect.top;
      // Smaller threshold than click — only highlight paths the cursor is
      // genuinely hovering (not just any line within 64 PDF units).
      const hit = findClickedPath(
        paths,
        cx,
        cy,
        overlayRect.width / (page?.width ?? 1),
        overlayRect.height / (page?.height ?? 1),
        PATH_HIT_PADDING,
        PATH_NEAREST_PADDING / 2,
      );
      const next = hit?.id ?? null;
      if (next !== hoveredPathId) setHoveredPath(next);
    },
    [paths, page, hoveredPathId, setHoveredPath],
  );
  const handleOverlayMouseLeave = useCallback(() => {
    if (hoveredPathId !== null) setHoveredPath(null);
  }, [hoveredPathId, setHoveredPath]);

  if (!page) return null;

  return (
    <div
      ref={containerRef}
      data-editor-canvas
      onClick={handleBackgroundClick}
      className="relative inline-block bg-gray-100"
      style={{ width: 'min(100%, 800px)' }}
    >
      <div
        ref={overlayRef}
        data-hit-overlay
        onClick={handleOverlayClick}
        onMouseMove={handleOverlayMouseMove}
        onMouseLeave={handleOverlayMouseLeave}
        style={{
          position: 'relative',
          cursor: 'crosshair',
          display: 'inline-block',
          lineHeight: 0,
        }}
      >
        <SvgCanvas svgRef={svgRef} />
      </div>
      <TextBoxLayer svgRef={svgRef} />
      <ColorPickerPopover />
    </div>
  );
}

function pointInBBox(
  px: number,
  py: number,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  scaleX: number,
  scaleY: number,
  padding: number,
): boolean {
  return (
    px >= (bbox.minX - padding) * scaleX &&
    px <= (bbox.maxX + padding) * scaleX &&
    py >= (bbox.minY - padding) * scaleY &&
    py <= (bbox.maxY + padding) * scaleY
  );
}

/**
 * Hit-test against a list of PDF paths. Three stages:
 *   1. Containment — among paths whose *padded* bbox (containPadding)
 *      contains the click, return the one whose CENTER is closest to the
 *      click point. This is the difference from a naive "first array match":
 *      PDFs have hundreds of overlapping line bboxes, and the user almost
 *      always wants the line whose center is geometrically closest to
 *      where their cursor is, not whichever came first in the op-list.
 *   2. Gap rescue — if no bbox contains the click, fall back to the path
 *      whose padded bbox is closest in edge distance, but only if within
 *      `nearestPadding` (≈ 32 PDF units). Catches the common case where
 *      one visible road is split into several path segments: the inter-
 *      segment gap would otherwise have no hit.
 *
 * Returns the matched path or null.
 */
function findClickedPath(
  paths: PdfPath[],
  clickX: number,
  clickY: number,
  scaleX: number,
  scaleY: number,
  containPadding: number,
  nearestPadding: number,
): PdfPath | null {
  // Stage 1: containment, with center-distance tiebreak. Many paths
  // overlap after padding (e.g., parallel roads, intersection
  // segments) — we want the one whose visual center is closest.
  let bestInside: PdfPath | null = null;
  let bestInsideCenterDist = Infinity;
  for (const path of paths) {
    if (!pointInBBox(clickX, clickY, path.bbox, scaleX, scaleY, containPadding)) {
      continue;
    }
    const ccx = ((path.bbox.minX + path.bbox.maxX) / 2) * scaleX;
    const ccy = ((path.bbox.minY + path.bbox.maxY) / 2) * scaleY;
    const d = Math.hypot(clickX - ccx, clickY - ccy);
    if (d < bestInsideCenterDist) {
      bestInsideCenterDist = d;
      bestInside = path;
    }
  }
  if (bestInside !== null) {
    return bestInside;
  }

  // Stage 2: nearest-edge fallback. Edge distance is the smallest
  // distance from the click point to the padded bbox rectangle.
  let best: PdfPath | null = null;
  let bestDist = Infinity;
  for (const path of paths) {
    const left = (path.bbox.minX - containPadding) * scaleX;
    const right = (path.bbox.maxX + containPadding) * scaleX;
    const top = (path.bbox.minY - containPadding) * scaleY;
    const bottom = (path.bbox.maxY + containPadding) * scaleY;
    const dx = Math.max(left - clickX, 0, clickX - right);
    const dy = Math.max(top - clickY, 0, clickY - bottom);
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = path;
    }
  }
  const maxDist = nearestPadding * scaleX;
  if (best !== null && bestDist <= maxDist) {
    return best;
  }
  return null;
}
