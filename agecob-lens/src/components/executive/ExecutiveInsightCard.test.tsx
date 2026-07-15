import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutiveInsightCard } from "./ExecutiveInsightCard";

describe("ExecutiveInsightCard — handoff variants", () => {
  it("critical: renders badge, metric, delta, description, CTA and uses rose tokens", () => {
    const onClick = vi.fn();
    const { container } = render(
      <ExecutiveInsightCard
        variant="critical"
        metric={{ value: 0.012, unit: "percent", label: "Conversão" }}
        delta={{ value: -0.48, baseline: "vs meta", betterWhen: "up" }}
        description="Conversão 48% abaixo da meta — revisar abordagem."
        cta={{ label: "Abrir diagnóstico", onClick }}
      />,
    );

    // a11y
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();

    // Badge
    expect(screen.getByText("Crítico")).toBeInTheDocument();

    // Metric (percent → "1,2%")
    expect(screen.getByText(/1,2\s*%/)).toBeInTheDocument();

    // Delta pill
    expect(screen.getByText(/48%\s+vs meta/)).toBeInTheDocument();

    // Description
    expect(screen.getByText(/Conversão 48% abaixo da meta/)).toBeInTheDocument();

    // CTA fires
    const btn = screen.getByRole("button", { name: /Abrir diagnóstico/ });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    // Uses rose/danger semantic tokens (NOT hex)
    const html = container.innerHTML;
    expect(html).toMatch(/danger-soft|rose/);
    expect(html).not.toMatch(/#be123c|#fff1f2/);
  });

  it("critical: renders secondaryMetric next to primary metric, same card", () => {
    render(
      <ExecutiveInsightCard
        variant="critical"
        metric={{ value: "1,3%", label: "Conversão" }}
        secondaryMetric={{ value: "8,7%", label: "Efetividade de caixa" }}
        description="Conversão baixa com alto volume de acionamentos. Verificar qualidade dos contatos."
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("1,3%")).toBeInTheDocument();
    expect(screen.getByText("8,7%")).toBeInTheDocument();
    expect(screen.getByText("Efetividade de caixa")).toBeInTheDocument();
    // só 1 card no DOM pros dois números — não 2 status roles
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("critical: omits secondaryMetric block when not provided", () => {
    render(
      <ExecutiveInsightCard
        variant="critical"
        metric={{ value: "1,3%", label: "Conversão" }}
        description="Conversão baixa com alto volume de acionamentos."
      />,
    );
    expect(screen.queryByText("Efetividade de caixa")).toBeNull();
  });

  it("positive: renders compact form with inline metric and underlined CTA using emerald tokens", () => {
    const onClick = vi.fn();
    const { container } = render(
      <ExecutiveInsightCard
        variant="positive"
        metric={{ value: 1611575.51, unit: "BRL", label: "em acordos" }}
        description="Acima do esperado."
        cta={{ label: "Ver detalhes", onClick }}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Positivo")).toBeInTheDocument();
    // BRL compact formatter renders "R$ 1,61 mi"
    expect(screen.getByText(/R\$\s*1,61\s*mi.*em acordos/)).toBeInTheDocument();
    expect(screen.getByText("Acima do esperado.")).toBeInTheDocument();

    const cta = screen.getByRole("button", { name: /Ver detalhes/ });
    expect(cta.className).toMatch(/underline/);
    fireEvent.click(cta);
    expect(onClick).toHaveBeenCalledTimes(1);

    const html = container.innerHTML;
    expect(html).toMatch(/success-soft|emerald/);
    expect(html).not.toMatch(/#047857|#ecfdf5/);
  });

  it("neutral: returns null (no render, no placeholder text)", () => {
    const { container } = render(<ExecutiveInsightCard variant="neutral" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ExecutiveInsightCard — legacy data shape (back-compat)", () => {
  it("renders legacy InsightEngineOutput slots", () => {
    render(
      <ExecutiveInsightCard
        embedded
        data={{
          insight1: { text: "Volume alto", severity: "positive", headline: "R$ 1,6 mi" },
          insight2: null,
          action: null,
          empty: false,
        }}
      />,
    );
    expect(screen.getByText("Volume alto")).toBeInTheDocument();
    expect(screen.getByText("R$ 1,6 mi")).toBeInTheDocument();
  });

  it("returns null when legacy data is empty", () => {
    const { container } = render(
      <ExecutiveInsightCard
        embedded
        data={{ insight1: null, insight2: null, action: null, empty: true }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
