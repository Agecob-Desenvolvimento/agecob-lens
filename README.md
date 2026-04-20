# agecob-lens — Frontend do Dashboard

Aplicacao React (Vite + TypeScript) que consome a API FastAPI local e exibe dados operacionais de cobranca de dividas.

## Stack

- React 18 + TypeScript
- Vite (dev server em `0.0.0.0:5173`)
- Tailwind CSS + shadcn/ui (Radix UI)
- Recharts (graficos de barra, pizza, compostos)
- TanStack React Query
- React Router v6

## Estrutura relevante

```
src/
  pages/
    Index.tsx                  — dashboard principal (KPIs + graficos v2)
    ComparacaoAgentes.tsx      — ranking e tabela de agentes
    AnaliseProdutividade.tsx   — analise agregada com graficos
    DetalhamentoAgentes.tsx    — detalhamento por agente
  components/
    AgentComparisonDashboard.tsx  — tabela de agentes com Taxa Conversao
    charts/
      AnaliseChartsPanel.tsx       — graficos de escritorio/agente (AnaliseProdutividade)
      DetalhamentoChartsPanel.tsx  — graficos de detalhamento
      DashboardV2ChartsPanel.tsx   — 6 novos graficos do dashboard v2
  services/
    api.ts                     — fetch functions e tipos TypeScript
  hooks/
    useProdutividadeData.ts    — fetch + merge dos dois bancos
```

## Endpoints consumidos

Ver `docs/data-coverage-analysis.md` para a lista completa e matriz de cobertura.

## Seletor de banco

O toggle **Todas / AUTOS / CONSUMER** mapeia para `DatabaseOption`:

| Label | Valor enviado na API |
|---|---|
| Todas | `todos` |
| AUTOS | `COBwebRCBAUTOS` |
| CONSUMER | `COBwebRCBCONSUMER` |

Todos os componentes e graficos reagem a mudanca desse seletor.

## Taxa de Conversao (tabela de agentes)

Formula aplicada no frontend:

```
Taxa Conversao = (qtd_contatos / qtd_acordos) * 100
```

Exibida com 2 casas decimais. Retorna `0` quando `qtd_acordos = 0`.

## Iniciar em desenvolvimento

```powershell
npm install
npm run dev
```

Para acesso via rede local (LAN):

```powershell
npm run dev:lan
```

Acesse `http://127.0.0.1:5173`. A API deve estar rodando em `http://127.0.0.1:8000`.

## Build de producao

```powershell
npm run build
```

O artefato gerado em `dist/` e servido diretamente pelo FastAPI.

## Script de verificação rápida

```powershell
npm run check
```
