# Filter Audit — Onda A

> **HISTÓRICO (revisado 2026-09-16).** Esta auditoria é de 2026-05 e descreve páginas que
> não existem mais. `AnaliseProdutividade.tsx`, `ComparacaoAgentes.tsx`, `FilterBar.tsx` e
> `useComparacaoViewModel.ts` foram deletados em `586609c` (2026-06-02); `Dashboard.tsx`
> nunca existiu com esse nome (a Home é `Index.tsx`). O único item de backlog do
> documento morreu junto com a página. Mantido como registro da Onda A — **não use esta
> tabela como inventário de rotas**; o inventário atual está em
> `agecob-lens/docs/CLAUDE.md` e em `agecob-lens/src/App.tsx:127-132`.

Mapeamento do filtro **Carteira** por rota executiva. Critério: filtro chega ao fetch/transform de dados? Se não → decorativo.

| Rota | Filtro Carteira presente? | Conectado aos dados? | Veredito | Ação |
|------|---------------------------|----------------------|----------|------|
| `Dashboard.tsx` (Home) | Não | n/a | n/a | — |
| `AnaliseProdutividade.tsx` | Não | n/a | n/a | — |
| `DetalhamentoAgentes.tsx` | Não | n/a | n/a | — |
| `ComparacaoAgentes.tsx` | Sim (`FilterBar` + state local `carteira`) | **Não** — state nunca é passado a `AgentComparisonDashboard` (linha 74 só repassa `db`/`dateFrom`/`dateTo`/`refreshTick`) | **Decorativo** | Backlog Onda C |

## Backlog — `ComparacaoAgentes.tsx` — RESOLVIDO POR REMOÇÃO (2026-06-02)

> A página, seu `FilterBar` e o `useComparacaoViewModel.ts` foram deletados em `586609c`,
> o que encerra este backlog sem nenhuma das duas ações abaixo. O endpoint
> `/dashboard/comparacao-agentes/{db}` continua existindo (`api/routers/dashboard.py:566-567`)
> e serve outros consumidores.

- Filtro Carteira está desconectado: `useState("Geral")` + `setCarteira` rastreiam interação via `trackEvent` mas o valor nunca propaga ao hook de dados.
- **Justificativa para diferir remoção:** remover o `FilterBar` agora altera layout/estrutura da página, escopo de Onda C (Redesign por Página). Onda A é apenas auditoria + formatação. Remoção cirúrgica ficaria órfã sem o redesign do header executivo dessa rota.
- **Ação Onda C:** remover `FilterBar` da página ou conectar `carteira` ao filtro real (provavelmente via novo parâmetro no endpoint `/dashboard/comparacao-agentes/{db}` — exige mudança de contrato, fora do escopo do redesign atual).

## Outros filtros (referência)

- **Período / Categoria (BU)** — globais via `GlobalFiltersContext`, propagam corretamente em todas as rotas (verificado: cada página deriva `db` a partir de `category` e passa `dateFrom`/`dateTo` ao componente principal).
