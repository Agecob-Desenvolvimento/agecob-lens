import { describe, expect, it } from "vitest";
import { formatBRLCompact, formatDelta } from "./metrics";

describe("formatBRLCompact", () => {
  it("returns full BRL below 100k threshold", () => {
    expect(formatBRLCompact(99_999.99)).toMatch(/R\$\s?99\.999,99/);
    expect(formatBRLCompact(1234.5)).toMatch(/R\$\s?1\.234,50/);
  });

  it("returns compact BRL at or above 100k threshold", () => {
    expect(formatBRLCompact(100_000)).toMatch(/mil/i);
    expect(formatBRLCompact(1_611_575.51)).toMatch(/mi/i);
  });

  it("renders zero in full format (anti-truncamento)", () => {
    expect(formatBRLCompact(0)).toMatch(/R\$\s?0,00/);
  });

  it("returns em-dash for null, undefined and NaN", () => {
    expect(formatBRLCompact(null)).toBe("—");
    expect(formatBRLCompact(undefined)).toBe("—");
    expect(formatBRLCompact(Number.NaN)).toBe("—");
  });

  it("respects explicit mode override", () => {
    expect(formatBRLCompact(1_611_575.51, "full")).toMatch(/R\$\s?1\.611\.575,51/);
    expect(formatBRLCompact(500, "compact")).toMatch(/R\$/);
  });
});

describe("formatDelta", () => {
  it("renders up arrow with rounded magnitude", () => {
    expect(formatDelta(0.124, "up")).toBe("12%");
  });

  it("renders down arrow with absolute magnitude", () => {
    expect(formatDelta(0.041, "down")).toBe("4%");
    expect(formatDelta(-0.041, "down")).toBe("4%");
  });

  it("renders flat arrow for stable delta", () => {
    expect(formatDelta(0.003, "flat")).toBe("0%");
  });
});
