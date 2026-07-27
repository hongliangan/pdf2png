import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('smoke', () => {
  it('cn merges class names and drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });

  it('cn handles conditional tailwind classes via twMerge', () => {
    // later utility class should win
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});