import { describe, it, expect } from 'vitest';
import {
  FIXED_COLORS,
  normalizeStrokeColor,
  FONT_FAMILIES,
  FONT_SIZES,
  DPI_VALUES,
  DEFAULT_TEXT_BOX,
  UNDO_CAPACITY,
} from '@/lib/constants';

describe('FIXED_COLORS', () => {
  it('contains exactly the 4 legend colors in red/blue/green/cyan order', () => {
    expect(FIXED_COLORS).toEqual(['#FF0000', '#0000FF', '#00FF00', '#00FFFF']);
  });
});

describe('normalizeStrokeColor', () => {
  it('maps (1, 0, 0) to red', () => {
    expect(normalizeStrokeColor([1, 0, 0])).toBe('#FF0000');
  });

  it('maps (0, 0, 1) to blue', () => {
    expect(normalizeStrokeColor([0, 0, 1])).toBe('#0000FF');
  });

  it('maps (0, 1, 0) to green', () => {
    expect(normalizeStrokeColor([0, 1, 0])).toBe('#00FF00');
  });

  it('maps (0, 1, 1) to cyan', () => {
    expect(normalizeStrokeColor([0, 1, 1])).toBe('#00FFFF');
  });

  it('returns null for black (so footer text gets stripped)', () => {
    expect(normalizeStrokeColor([0, 0, 0])).toBeNull();
  });

  it('returns null for gray (legend border / mid-gray)', () => {
    expect(normalizeStrokeColor([0.5, 0.5, 0.5])).toBeNull();
  });

  it('tolerates small numerical jitter on red', () => {
    // ±3/255 tolerance
    expect(normalizeStrokeColor([0.992, 0, 0])).toBe('#FF0000');
    expect(normalizeStrokeColor([1, 0.008, 0.008])).toBe('#FF0000');
  });

  it('rejects colors outside the tolerance', () => {
    expect(normalizeStrokeColor([0.95, 0, 0])).toBeNull();
  });

  it('maps CUBE light-cyan (128, 255, 255) to canonical cyan #00FFFF', () => {
    expect(normalizeStrokeColor([128 / 255, 1, 1])).toBe('#00FFFF');
  });
});

describe('font and size constants', () => {
  it('exposes 4 font families', () => {
    expect(FONT_FAMILIES.length).toBeGreaterThanOrEqual(4);
    FONT_FAMILIES.forEach(f => expect(typeof f.value).toBe('string'));
  });

  it('exposes the curated font sizes', () => {
    expect(FONT_SIZES).toEqual([12, 14, 16, 20, 24, 32, 48]);
  });

  it('exposes the 3 supported DPIs', () => {
    expect(DPI_VALUES).toEqual([72, 150, 300]);
  });

  it('exposes a default text box config', () => {
    expect(DEFAULT_TEXT_BOX).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      text: '',
      fontSize: 16,
      color: '#000000',
    });
  });

  it('caps undo history at 50', () => {
    expect(UNDO_CAPACITY).toBe(50);
  });
});