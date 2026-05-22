import { describe, expect, it } from "vitest";
import {
  calcCPC,
  calcTicket,
  pctToFraction,
  fractionToPct,
  parseDateBackend,
  formatBRL,
} from "./executiveMetrics";

describe("calcCPC", () => {
  it("returns contatos / acionamentos as fraction", () => {
    expect(calcCPC(35, 100)).toBeCloseTo(0.35);
  });
  it("guards zero/negative denominator", () => {
    expect(calcCPC(10, 0)).toBe(0);
    expect(calcCPC(10, -5)).toBe(0);
  });
});

describe("calcTicket", () => {
  it("returns valor / qtd", () => {
    expect(calcTicket(1500, 3)).toBe(500);
  });
  it("returns 0 when qtd <= 0", () => {
    expect(calcTicket(1500, 0)).toBe(0);
  });
});

describe("pctToFraction / fractionToPct", () => {
  it("converts backend 0-100 to 0-1", () => {
    expect(pctToFraction(12.5)).toBeCloseTo(0.125);
    expect(pctToFraction(null)).toBe(0);
    expect(pctToFraction(undefined)).toBe(0);
  });
  it("inverse conversion", () => {
    expect(fractionToPct(0.124)).toBeCloseTo(12.4);
    expect(fractionToPct(null)).toBe(0);
  });
});

describe("parseDateBackend", () => {
  it("parses YYYY-MM-DD as local midnight", () => {
    const d = parseDateBackend("2026-05-22");
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(4);
    expect(d?.getDate()).toBe(22);
  });
  it("parses ISO datetime", () => {
    const d = parseDateBackend("2026-05-22T13:45:00");
    expect(d?.getHours()).toBe(13);
  });
  it("returns null for empty/invalid", () => {
    expect(parseDateBackend(null)).toBeNull();
    expect(parseDateBackend("")).toBeNull();
    expect(parseDateBackend("not-a-date")).toBeNull();
  });
});

describe("formatBRL re-export", () => {
  it("is the same function as formatBRLCompact", () => {
    expect(formatBRL(1_611_575.51)).toMatch(/mi/i);
  });
});
