import { describe, expect, it, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { HandoffEficienciaGroupedBar } from "./HandoffEficienciaGroupedBar";

beforeAll(() => {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const data = [
  { bu: "AUTOS", cpc: 43.5, conversao: 1.2 },
  { bu: "CONSUMER", cpc: 51.2, conversao: 0.8 },
];

describe("HandoffEficienciaGroupedBar", () => {
  it("renders title and summary line with formatted averages", () => {
    render(
      <HandoffEficienciaGroupedBar
        data={data}
        summary={{ cpcAvg: 43.5, conversaoAvg: 1.2 }}
      />,
    );
    expect(
      screen.getByText("Taxa de CPC % e Conversão % por Unidade de Negócio"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Média taxa de CPC: 43,5% · Média Conv\.: 1,2%/),
    ).toBeInTheDocument();
  });

  it("accepts a custom title", () => {
    render(
      <HandoffEficienciaGroupedBar
        data={data}
        summary={{ cpcAvg: 0, conversaoAvg: 0 }}
        title="Custom Title"
      />,
    );
    expect(screen.getByText("Custom Title")).toBeInTheDocument();
  });

  it("renders empty state when data is empty and hides summary", () => {
    render(
      <HandoffEficienciaGroupedBar
        data={[]}
        summary={{ cpcAvg: 0, conversaoAvg: 0 }}
      />,
    );
    expect(screen.getByText("Sem dados para o período.")).toBeInTheDocument();
    expect(screen.queryByText(/Média CPC/)).toBeNull();
  });

  it("respects explicit empty flag", () => {
    render(
      <HandoffEficienciaGroupedBar
        data={data}
        summary={{ cpcAvg: 1, conversaoAvg: 1 }}
        empty
      />,
    );
    expect(screen.getByText("Sem dados para o período.")).toBeInTheDocument();
  });
});
