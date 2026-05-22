# Filter Audit — Onda A

Mapeamento do filtro **Carteira** por rota executiva. Critério: filtro chega ao fetch/transform de dados? Se não → decorativo.

| Rota | Filtro Carteira presente? | Conectado aos dados? | Veredito | Ação |
|------|---------------------------|----------------------|----------|------|
| `Dashboard.tsx` (Home) | Não | n/a | n/a | — |
| `AnaliseProdutividade.tsx` | Não | n/a | n/a | — |
| `DetalhamentoAgentes.tsx` | Não | n/a | n/a | — |
| `ComparacaoAgentes.tsx` | Sim (`FilterBar` + state local `carteira`) | **Não** — state nunca é passado a `AgentComparisonDashboard` (linha 74 só repassa `db`/`dateFrom`/`dateTo`/`refreshTick`) | **Decorativo** | Backlog Onda C |

## Backlog — `ComparacaoAgentes.tsx`

- Filtro Carteira está desconectado: `useState("Geral")` + `setCarteira` rastreiam interação via `trackEvent` mas o valor nunca propaga ao hook de dados.
- **Justificativa para diferir remoção:** remover o `FilterBar` agora altera layout/estrutura da página, escopo de Onda C (Redesign por Página). Onda A é apenas auditoria + formatação. Remoção cirúrgica ficaria órfã sem o redesign do header executivo dessa rota.
- **Ação Onda C:** remover `FilterBar` da página ou conectar `carteira` ao filtro real (provavelmente via novo parâmetro no endpoint `/dashboard/comparacao-agentes/{db}` — exige mudança de contrato, fora do escopo do redesign atual).

## Outros filtros (referência)

- **Período / Categoria (BU)** — globais via `GlobalFiltersContext`, propagam corretamente em todas as rotas (verificado: cada página deriva `db` a partir de `category` e passa `dateFrom`/`dateTo` ao componente principal).
