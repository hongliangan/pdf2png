import type { FixedColor, FontFamily, FontSize, Dpi, TextBox } from '@/lib/types';

// The 4 legend colors (from 图例颜色.jpg). Order is significant —
// it's the order they appear in the color picker bubble.
export const FIXED_COLORS: readonly FixedColor[] = [
  '#FF0000',
  '#0000FF',
  '#00FF00',
  '#00FFFF',
] as const;

// Tolerance for matching decoded RGB values against the legend.
// pdfjs-decoded floats sometimes have ±3/255 jitter; we accept up to that.
const COLOR_TOLERANCE = 3 / 255;

// Aliases for near-miss colors emitted by common traffic-modeling tools
// (e.g., CUBE's default road network uses RGB(128,255,255) = #80FFFF,
// which is close to but not exactly the legend's #00FFFF cyan).
// Each entry maps a known near-legend RGB → its canonical legend hex.
const COLOR_ALIASES: ReadonlyArray<readonly [readonly [number, number, number], FixedColor]> = [
  [[128 / 255, 255 / 255, 255 / 255], '#00FFFF'], // CUBE default road cyan
];

/**
 * Normalize a decoded stroke RGB tuple into one of the 4 legend hex colors,
 * or null if it doesn't match any (e.g., black text, gray borders, custom fills).
 *
 * Order: exact aliases first, then tolerance-based match.
 */
export function normalizeStrokeColor(
  rgb: readonly [number, number, number] | number[],
): FixedColor | null {
  const [r, g, b] = rgb;

  for (const [aliasRgb, aliasHex] of COLOR_ALIASES) {
    if (
      Math.abs(r - aliasRgb[0]) < 1e-6 &&
      Math.abs(g - aliasRgb[1]) < 1e-6 &&
      Math.abs(b - aliasRgb[2]) < 1e-6
    ) {
      return aliasHex;
    }
  }

  for (const hex of FIXED_COLORS) {
    const target = hexToRgb(hex);
    if (
      Math.abs(r - target.r) <= COLOR_TOLERANCE &&
      Math.abs(g - target.g) <= COLOR_TOLERANCE &&
      Math.abs(b - target.b) <= COLOR_TOLERANCE
    ) {
      return hex;
    }
  }
  return null;
}

function hexToRgb(hex: FixedColor): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

export interface FontOption {
  value: FontFamily;
  label: string;
}

export const FONT_FAMILIES: readonly FontOption[] = [
  { value: 'system-ui', label: 'System' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'JetBrains Mono, monospace', label: 'Mono' },
] as const;

export const FONT_SIZES: readonly FontSize[] = [12, 14, 16, 20, 24, 32, 48] as const;

export const DPI_VALUES: readonly Dpi[] = [72, 150, 300] as const;

export const DEFAULT_TEXT_BOX: Omit<TextBox, 'id' | 'x' | 'y'> = {
  width: 160,
  height: 40,
  text: '',
  fontFamily: 'system-ui',
  fontSize: 16,
  color: '#000000',
  rotation: 0,
};

// Number of extra PDF-user-units to expand each path's hit area beyond its
// stroke. 30 units ≈ 30pt ≈ 40px at default render scale — generous
// enough that real CUBE-style PDF roads (2–4 px on screen) are easy
// to click even with imprecise aim.
export const PATH_HIT_PADDING = 30;

// Fallback tolerance (in PDF user units, like PATH_HIT_PADDING) for the
// nearest-bbox lookup. When a click lands in a gap between two path
// segments that visually form a single road, the nearest segment within
// this distance wins. ~32 user units ≈ 44px on screen — comfortable
// for catching visual adjacency without mis-selecting unrelated roads
// that happen to be parallel and close.
export const PATH_NEAREST_PADDING = 32;

export const UNDO_CAPACITY = 50;