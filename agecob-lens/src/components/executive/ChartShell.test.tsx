import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartShell } from "./ChartShell";

describe("ChartShell", () => {
  it("renders children when no state flags are set", () => {
    render(
      <ChartShell title="T">
        <div data-testid="chart-body">chart</div>
      </ChartShell>,
    );
    expect(screen.getByTestId("chart-body")).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("renders skeleton when loading and hides children", () => {
    const { container } = render(
      <ChartShell title="T" loading height={120}>
        <div data-testid="chart-body">chart</div>
      </ChartShell>,
    );
    expect(screen.queryByTestId("chart-body")).toBeNull();
    const skeleton = container.querySelector('[class*="animate-pulse"]') as HTMLElement | null;
    expect(skeleton).not.toBeNull();
    expect(skeleton?.style.height).toBe("120px");
  });

  it("renders default empty message when empty and no override", () => {
    render(
      <ChartShell title="T" empty>
        <div data-testid="chart-body">chart</div>
      </ChartShell>,
    );
    expect(screen.queryByTestId("chart-body")).toBeNull();
    expect(screen.getByText("Sem dados para o período.")).toBeInTheDocument();
  });

  it("renders custom empty message when provided", () => {
    render(
      <ChartShell title="T" empty emptyMessage="Nada aqui.">
        <div />
      </ChartShell>,
    );
    expect(screen.getByText("Nada aqui.")).toBeInTheDocument();
  });

  it("renders error panel and surfaces the message", () => {
    render(
      <ChartShell title="T" error="boom" loading empty>
        <div data-testid="chart-body">chart</div>
      </ChartShell>,
    );
    expect(screen.queryByTestId("chart-body")).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("boom");
  });

  it("renders toolbar in header when supplied", () => {
    render(
      <ChartShell title="T" toolbar={<button type="button">act</button>}>
        <div />
      </ChartShell>,
    );
    expect(screen.getByRole("button", { name: "act" })).toBeInTheDocument();
  });

  it("omits header entirely when no title/toolbar/description", () => {
    const { container } = render(
      <ChartShell>
        <div data-testid="chart-body">chart</div>
      </ChartShell>,
    );
    expect(container.querySelector("h3")).toBeNull();
    expect(screen.getByTestId("chart-body")).toBeInTheDocument();
  });
});
