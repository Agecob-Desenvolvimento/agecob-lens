import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAnimatedFormattedValue } from "./useAnimatedFormattedValue";

describe("useAnimatedFormattedValue", () => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the initial value immediately, no animation on mount", () => {
    const { result } = renderHook(() => useAnimatedFormattedValue("R$ 1,61 mi"));
    expect(result.current).toBe("R$ 1,61 mi");
  });

  it("counts up from the previous value toward the new one, then lands exactly on it", async () => {
    const { result, rerender } = renderHook(({ v }) => useAnimatedFormattedValue(v, 300), {
      initialProps: { v: "100" },
    });
    expect(result.current).toBe("100");

    rerender({ v: "200" });
    // first tick that actually moved off the starting value
    await waitFor(() => expect(result.current).not.toBe("100"));
    const mid = Number(result.current.replace(/\./g, ""));
    expect(mid).toBeGreaterThanOrEqual(100);
    expect(mid).toBeLessThanOrEqual(200);

    await waitFor(() => expect(result.current).toBe("200"), { timeout: 1000 });
  });

  it("passes text without a recognizable number straight through", () => {
    const { result, rerender } = renderHook(({ v }) => useAnimatedFormattedValue(v), {
      initialProps: { v: "—" },
    });
    expect(result.current).toBe("—");
    rerender({ v: "—" });
    expect(result.current).toBe("—");
  });

  it("skips the tween and jumps straight to the new value under prefers-reduced-motion", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { result, rerender } = renderHook(({ v }) => useAnimatedFormattedValue(v, 150), {
      initialProps: { v: "100" },
    });
    rerender({ v: "200" });
    await waitFor(() => expect(result.current).toBe("200"));
  });

  it("preserves prefix, suffix and decimal places from the target format", async () => {
    const { result, rerender } = renderHook(({ v }) => useAnimatedFormattedValue(v, 100), {
      initialProps: { v: "R$ 1,00 mi" },
    });
    rerender({ v: "R$ 2,50 mi" });
    await waitFor(() => expect(result.current).toMatch(/^R\$ \d+,\d{2} mi$/));
    await waitFor(() => expect(result.current).toBe("R$ 2,50 mi"), { timeout: 1000 });
  });
});
