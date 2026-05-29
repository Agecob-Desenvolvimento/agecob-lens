import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom polyfill for Recharts ResponsiveContainer.
// observe() fires callback synchronously so Recharts renders SVG during the same tick.
class ResizeObserverMock {
  observe(target: Element) {
    // Fire synchronously — effects run synchronously in jsdom tests
    const cb = (this as unknown as { _cb?: ResizeObserverCallback })._cb;
    if (cb) {
      cb(
        [
          {
            contentRect: { x: 0, y: 0, width: 800, height: 400, top: 0, right: 800, bottom: 400, left: 0 },
            target,
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
  }
  unobserve() {}
  disconnect() {}
}

// Recharts stores the callback internally. We intercept constructor to capture it.
(global as unknown as Record<string, unknown>).ResizeObserver = class extends ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    super();
    (this as unknown as { _cb: ResizeObserverCallback })._cb = callback;
  }
} as unknown as typeof ResizeObserver;
