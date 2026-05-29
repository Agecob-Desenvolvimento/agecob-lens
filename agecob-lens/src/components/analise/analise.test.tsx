import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BoletosKpiStrip } from "./BoletosKpiStrip";
import { EfetividadeDiariaChart } from "./EfetividadeDiariaChart";
import { TendenciaMensalChart } from "./TendenciaMensalChart";
import { RankingAgentesBoletos } from "./RankingAgentesBoletos";
import { PortfolioSection } from "./PortfolioSection";
import { BoletosQuebradosChart } from "./BoletosQuebradosChart";
import {
  MOCK_BOLETOS_KPIS,
  MOCK_EFETIVIDADE_DIARIA,
  MOCK_RANKING_AGENTES_BOLETOS,
  MOCK_TENDENCIA_MENSAL,
  MOCK_PORTFOLIO,
  MOCK_EXCECOES_PORTFOLIO,
  MOCK_REJEITADOS_PORTFOLIO,
  MOCK_BOLETOS_QUEBRADOS,
} from "./analiseMocks";

describe("BoletosKpiStrip", () => {
  it("renders all 8 KPI labels", () => {
    render(<BoletosKpiStrip kpis={MOCK_BOLETOS_KPIS} />);
    for (const k of MOCK_BOLETOS_KPIS) {
      expect(screen.getByText(k.label)).toBeInTheDocument();
    }
  });
});

describe("EfetividadeDiariaChart", () => {
  it("renders one bar per day and shows tooltip on hover", () => {
    render(<EfetividadeDiariaChart data={MOCK_EFETIVIDADE_DIARIA} />);
    const bars = screen.getAllByTestId("efetividade-bar");
    expect(bars).toHaveLength(MOCK_EFETIVIDADE_DIARIA.length);
    fireEvent.mouseEnter(bars[0]);
    expect(screen.getByTestId("efetividade-tooltip")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<EfetividadeDiariaChart data={[]} />);
    expect(screen.getByText(/Sem dados/i)).toBeInTheDocument();
  });
});

describe("TendenciaMensalChart", () => {
  it("renders one bar per month plus a média line", () => {
    render(<TendenciaMensalChart data={MOCK_TENDENCIA_MENSAL} />);
    expect(screen.getAllByTestId("tendencia-bar")).toHaveLength(MOCK_TENDENCIA_MENSAL.length);
    expect(screen.getByTestId("tendencia-media")).toBeInTheDocument();
  });
});

describe("RankingAgentesBoletos", () => {
  it("renders one row per agent", () => {
    render(<RankingAgentesBoletos data={MOCK_RANKING_AGENTES_BOLETOS} />);
    expect(screen.getAllByTestId("ranking-row")).toHaveLength(MOCK_RANKING_AGENTES_BOLETOS.length);
  });
});

describe("PortfolioSection", () => {
  it("renders three portfolio cards with data", () => {
    render(
      <PortfolioSection
        portfolioValor={MOCK_PORTFOLIO}
        excecoesPorPortfolio={MOCK_EXCECOES_PORTFOLIO}
        rejeitadosPorPortfolio={MOCK_REJEITADOS_PORTFOLIO}
      />,
    );
    expect(screen.getByText("Valor de Acordos por Portfólio")).toBeInTheDocument();
    expect(screen.getByText("Exceções por Portfólio (Qtd)")).toBeInTheDocument();
    expect(screen.getByText("Rejeitados por Portfólio (Qtd)")).toBeInTheDocument();
  });

  it("renders empty state when no data", () => {
    render(
      <PortfolioSection
        portfolioValor={[]}
        excecoesPorPortfolio={[]}
        rejeitadosPorPortfolio={[]}
      />,
    );
    expect(screen.getAllByText(/Sem registros/i)).toHaveLength(3);
  });
});

describe("BoletosQuebradosChart", () => {
  it("renders portfolio summary bars", () => {
    render(<BoletosQuebradosChart portfolioRows={MOCK_BOLETOS_QUEBRADOS} />);
    expect(screen.getByText("Boletos Quebrados")).toBeInTheDocument();
  });

  it("exposes each portfolio bar as a clickable drill-down", () => {
    render(<BoletosQuebradosChart portfolioRows={MOCK_BOLETOS_QUEBRADOS} />);
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("shows empty state when no data", () => {
    render(<BoletosQuebradosChart portfolioRows={[]} />);
    expect(screen.getByText(/Sem boletos quebrados/i)).toBeInTheDocument();
  });
});
