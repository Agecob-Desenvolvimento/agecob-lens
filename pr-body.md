## Resumo

Novo módulo completo de **Efetividade de Boletos** cobrindo backend (ETL + API) e frontend (página de dashboard).

## Backend (main.py)

- ETL em background (thread daemon) executado no startup e a cada hora (configurável via `EFETIVIDADE_ETL_TTL`)
- 9 endpoints sob `/efetividade/`:
  - `diaria-primeira`, `mensal-primeira`, `mensal-agente-primeira`
  - `diaria-colchao`, `mensal-colchao`, `mensal-agente-colchao`
  - `diaria-colchao-vencimento`, `mensal-colchao-vencimento`, `mensal-agente-colchao-vencimento`
- Queries com `UNION ALL` entre `COBwebRCBAUTOS` e `COBwebRCBCONSUMER`
- Conversão = pago em até 5 dias do vencimento; arredondamento `FLOOR(x + 0.5)`
- Exclusão de agentes internos (Antlia, suporte, Interna, User)
- `HAVING COUNT(*) >= 10` server-side nos endpoints de ranking por agente
- Rota SPA fallback para servir o frontend em paths não-API

## Frontend (agecob-lens/src/pages/EfetividadeBoletos.tsx)

- Página `/efetividade-boletos` com:
  - Seletor global de mês/ano
  - Toggle Primeira Parcela / Colchão
  - Sub-toggle Colchão: Por Vencimento (padrão) / Por Emissão — com tooltip explicando cada modo
  - 5 KPI cards: boletos gerados, pagos no prazo, % conversão, melhor dia, pior dia
  - Gráfico diário combo (barra + linha, eixo Y duplo) com anotação de melhor/pior dia
  - Gráfico de tendência mensal — meses com 0% ocultados para evitar ruído visual
  - Ranking de agentes:
    - Filtro frontend >= 10 boletos antes de renderizar
    - Top-3 com cores distintas
    - Título dinâmico refletindo o modo ativo
    - Empty state: "Não há boletos vencidos neste mês." quando vencimento sem dados
    - Legenda: "Agentes cujo nome não aparecem não atingiram o volume mínimo..."
  - Quando Colchão + Por Vencimento: ranking buscado de mensal-agente-colchao-vencimento
  - Todos os 9 fetches pré-carregados para troca instantânea de toggle
- Sidebar: novo item Efetividade de Boletos com ícone CheckCircle2
- App.tsx: rota lazy-loaded /efetividade-boletos e registro no heat manager

## Test plan

- [ ] ETL inicializa no startup e popula o store em memória
- [ ] Todos os 9 endpoints retornam 200 após ETL; 503 antes de concluir
- [ ] Toggle Primeira / Colchão troca os dados sem novo loading
- [ ] Sub-toggle Por Vencimento / Por Emissão atualiza gráficos e ranking
- [ ] Meses com 0% não aparecem no gráfico de tendência
- [ ] Agentes com < 10 boletos não aparecem no ranking
- [ ] Empty state correto quando não há vencimentos no mês selecionado
- [ ] Tooltip do sub-toggle exibe descrição de cada modo

Generated with Claude Code
