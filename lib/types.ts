// Domain types shared across the editor.
// All mutable state (overrides, text boxes) is keyed off these.

export type PathId = string & { readonly __brand: 'PathId' };
export type TextBoxId = string & { readonly __brand: 'TextBoxId' };

export type FixedColor = '#FF0000' | '#0000FF' | '#00FF00' | '#00FFFF';

export interface Point {
  x: number;
  y: number;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// A single vector path extracted from the PDF, in SVG coordinates (top-left origin).
// Position/size/direction are immutable — only the color is mutable.
export interface PdfPath {
  id: PathId;
  d: string;                       // SVG "d" attribute, Y-flipped, PDF user-space units
  originalColor: FixedColor;
  bbox: BBox;
  strokeWidth: number;
  // Index into the clipPaths array of the parent ParseResult when this path
  // is rendered inside an active clip region. Null when no clip is active.
  clipIndex: number | null;
}

// Per-path override. null means "use originalColor".
export type ColorOverrideMap = Record<PathId, FixedColor | null>;

export type FontFamily =
  | 'system-ui'
  | 'Inter, system-ui, sans-serif'
  | 'Georgia, serif'
  | 'JetBrains Mono, monospace';

export type FontSize = 12 | 14 | 16 | 20 | 24 | 32 | 48;

export interface TextBox {
  id: TextBoxId;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: FontFamily;
  fontSize: FontSize;
  color: string;
  // Clockwise rotation in degrees. 0 = no rotation. Default 0.
  rotation: number;
}

export interface UndoSnapshot {
  colorOverrides: ColorOverrideMap;
  textBoxes: TextBox[];
}

export type Dpi = 72 | 150 | 300;
export type ExportFormat = 'png' | 'jpeg';

export interface ParseResult {
  page: { width: number; height: number };
  paths: PdfPath[];
  // Rectangular clip regions extracted from `clip` ops. Indexed by
  // PdfPath.clipIndex. Apply as `<clipPath>` defs in the SVG so content
  // bounded by a clip region renders only inside the rectangle.
  clipRects: BBox[];
}

export interface PickerPos {
  x: number;
  y: number;
}