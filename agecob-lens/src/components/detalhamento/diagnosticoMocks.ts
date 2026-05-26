import type { FunilData } from "./FunilConversao";
import type { BulletPanelData } from "./BulletChartsPanel";

export const MOCK_FUNIL: FunilData = {
  acionamentos: 31967,
  contatos: 13939,
  acordos: 372,
  primeiraParcela: 333560.16,
  valorAcordos: 1675038.91,
};

export const MOCK_METAS: BulletPanelData = {
  cpc: {
    value: 43.6,
    meta: 50,
    ranges: { poor: 32, ok: 56, good: 80 },
    unit: "%",
  },
  conversao: {
    value: 1.2,
    meta: 2.0,
    ranges: { poor: 1.6, ok: 2.8, good: 4 },
    unit: "%",
  },
  ticket: {
    value: 4502.79,
    meta: 5000,
    ranges: { poor: 4000, ok: 7000, good: 10000 },
    unit: "BRL",
  },
  excecoes: {
    value: 1.1,
    meta: 3.0,
    ranges: { poor: 6, ok: 8.5, good: 10 },
    unit: "%",
    inverted: true,
  },
};
