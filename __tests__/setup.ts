import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom returns 0×0 from getBoundingClientRect() which breaks any code that
// relies on layout dimensions (SVG bounds checks, textbox positioning).
// Per-element mocks via stubGetBoundingClientRect let each test declare the
// rectangle it wants the SVG / container to report.
export function stubGetBoundingClientRect(
  element: Element,
  rect: Partial<DOMRect>,
) {
  const base: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  };
  const merged = { ...base, ...rect };
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
    () => merged,
  );
}

// jsdom doesn't implement URL.createObjectURL/revokeObjectURL. Polyfill them
// with a tiny in-memory map so editor code that produces a download link
// (e.g. TopBar's PNG/JPG export) can run in tests.
if (typeof URL.createObjectURL !== 'function') {
  const objectUrls = new Map<string, Blob>();
  let counter = 0;
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = `blob:test/${++counter}`;
    objectUrls.set(url, obj as Blob);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    objectUrls.delete(url);
  };
}

// jsdom doesn't ship ResizeObserver. The editor uses it to recompute the
// SVG→page scale on resize; a no-op stub is fine for unit tests because
// the dimensions are stubbed via stubGetBoundingClientRect() per-test.
type ResizeObserverCtor = new (
  cb: (entries: ResizeObserverEntry[]) => void,
) => Pick<ResizeObserver, 'observe' | 'unobserve' | 'disconnect'>;

const globalScope = globalThis as unknown as {
  ResizeObserver?: ResizeObserverCtor;
};
if (typeof globalScope.ResizeObserver === 'undefined') {
  globalScope.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as ResizeObserverCtor;
}

// Ensure each test starts with a fresh DOM tree.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});