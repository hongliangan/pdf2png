import { describe, it, expect } from 'vitest';
import {
  flipY,
  moveToSegment,
  lineToSegment,
  curveToSegment,
  rectangleSegment,
  closePathSegment,
  bboxFromD,
} from '@/lib/svg-renderer';

const H = 842; // PDF A4 height in user-space units

describe('flipY', () => {
  it('flips the bottom of the page to the top', () => {
    expect(flipY(0, H)).toBe(842);
  });

  it('flips the top of the page to the bottom', () => {
    expect(flipY(842, H)).toBe(0);
  });

  it('leaves the middle unchanged', () => {
    expect(flipY(421, H)).toBe(421);
  });

  it('handles non-integer heights', () => {
    expect(flipY(100, 200)).toBe(100);
  });
});

describe('segment emitters', () => {
  it('emits a moveTo with Y flipped', () => {
    expect(moveToSegment({ x: 10, y: 20 }, H)).toBe('M10.00 822.00 ');
  });

  it('emits a lineTo with Y flipped', () => {
    expect(lineToSegment({ x: 30, y: 40 }, H)).toBe('L30.00 802.00 ');
  });

  it('emits a cubic bezier with all 6 coords (control + end) Y-flipped', () => {
    // P0 is implicit (current point), so args are cp1, cp2, end → 6 numbers
    expect(
      curveToSegment([1, 2, 3, 4, 5, 6], H),
    ).toBe('C1.00 840.00 3.00 838.00 5.00 836.00 ');
  });

  it('emits a rectangle with origin flipped and grows upward (v-h) in SVG coords', () => {
    expect(
      rectangleSegment({ x: 10, y: 20, w: 30, h: 40 }, H),
    ).toBe('M10.00 822.00 h30.00 v-40.00 h-30.00 Z ');
  });

  it('emits a close-path marker', () => {
    expect(closePathSegment()).toBe('Z ');
  });
});

describe('bboxFromD', () => {
  it('computes the bbox of a simple line path', () => {
    const d = moveToSegment({ x: 10, y: 20 }, H) + lineToSegment({ x: 30, y: 40 }, H);
    expect(bboxFromD(d)).toEqual({ minX: 10, minY: 802, maxX: 30, maxY: 822 });
  });

  it('handles horizontal/vertical relative commands', () => {
    const d = rectangleSegment({ x: 0, y: 0, w: 50, h: 60 }, H);
    expect(bboxFromD(d)).toEqual({ minX: 0, minY: 782, maxX: 50, maxY: 842 });
  });

  it('returns zero bbox for empty path', () => {
    expect(bboxFromD('')).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});