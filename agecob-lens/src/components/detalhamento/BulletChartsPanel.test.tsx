import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BulletChartsPanel } from "./BulletChartsPanel";
import { MOCK_METAS } from "./diagnosticoMocks";

describe("BulletChartsPanel", () => {
  it("renders 4 bullet rows", () => {
    render(<BulletChartsPanel data={MOCK_METAS} />);
    expect(screen.getByTestId("bullet-row-Taxa contato")).toBeInTheDocument();
    expect(screen.getByTestId("bullet-row-Conversão")).toBeInTheDocument();
    expect(screen.getByTestId("bullet-row-1ª Parcela")).toBeInTheDocument();
    expect(screen.getByTestId("bullet-row-Exceções")).toBeInTheDocument();
  });

  it("positions the meta marker within the track", () => {
    render(<BulletChartsPanel data={MOCK_METAS} />);
    const meta = screen.getByTestId("bullet-meta-Taxa contato");
    const left = parseFloat((meta as HTMLElement).style.left);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThanOrEqual(100);
  });

  it("treats inverted Exceções below meta as good (success bar)", () => {
    // excecoes.value 1.1 <= meta 3.0 with inverted → good
    render(<BulletChartsPanel data={MOCK_METAS} />);
    const bar = screen.getByTestId("bullet-bar-Exceções");
    expect(bar.className).toContain("bg-success");
  });
});
