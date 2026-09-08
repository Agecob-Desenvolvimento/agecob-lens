# PROGRESS — rejeitados contados por dívida (não por NR_RECEBIMENTO)

## Problema

Modo TV "Rejeitado" (e Home KPI / DetalhamentoAgentes / ComparacaoAgentes, que
leem o mesmo `/dashboard/produtividade-hoje`) infla `qtd_rejeitados`. Causa
confirmada em prod 2026-09-08 (diag no chat): a mesma dívida rejeitada,
ressubmetida e rejeitada de novo, gera **2 `NR_RECEBIMENTO` distintos** — o dedup
de regravação (`_rec_master_dedup`, chave `NR_RECEBIMENTO, ID_CARTEIRA, PARCELA`)
não pega, porque não é regravação da mesma linha. Caso real: CPF 58914366634,
2 acordos rejeitados, 1 `ID_DIVIDA`.

Query A do diag (mesmo `NR_RECEBIMENTO` em 2 carteiras) veio vazia → não é
fan-out de carteira.

## Decisão (chefe do usuário)

- Fix na fonte: `dominios/produtividade/queries.py`, branch `use_distinct_esforco=True`.
- `qtd_rejeitados` = **contar dívidas rejeitadas distintas** (`REC_DIVIDAS.ID_DIVIDA`
  por `ID_CARTEIRA`), não `NR_RECEBIMENTO`. Acordo com N dívidas → N.
- Valor do acordo entra **uma vez** (não uma por dívida).
- Com teste.

## Plano

1. `dominios/produtividade/queries.py` (branch True):
   - Novas CTEs `CTE_Rej_Acordo` → `CTE_Rej_Divida` → `CTE_Rejeitados_Agente`.
     `CTE_Rej_Divida`: por `(ID_CARTEIRA, ID_DIVIDA)` mantém só o acordo rejeitado
     mais recente (`DT_EMISSAO` desc, `NR_RECEBIMENTO` desc).
   - Remover as 3 linhas de rejeitados de `CTE_Financeiro_Agente` (`qtd_rejeitados`,
     `valor_rejeitados`, `valor_primeira_parcela_rejeitados`).
   - `CTE_Acordos` **inalterada** — mantém `OR ID_REC_STATUS IN (7)` no universo
     interno pra regravação p/ status 7 sair de gerados/exceção corretamente.
   - Final SELECT: `F.` → `RJ.` nas 3 colunas de rejeitados; `LEFT JOIN CTE_Rejeitados_Agente RJ`.
   - `build_produtividade_hoje_params`: 5 → 6 placeholders (nova CTE tem `{cart_filter}`).
   - verify: `pytest tests/test_produtividade_query_shape.py tests/test_produtividade_portfolio_parcial.py`
2. `tests/test_produtividade_query_shape.py`: `CTE_Rejeitados_Agente`... na lista, count EXISTS 5 → 6.
   Na verdade a nova CTE de agregação de dívida não leva `RD2` EXISTS; só `CTE_Rej_Acordo`
   (o scan de REC_MASTER) leva. Ajustar a asserção pro número real observado.
   - verify: pytest desse arquivo
3. `tests/test_dedup_regravacao.py`: novo teste — fixture 2 `NR_RECEBIMENTO`, status 7,
   mesmo `ID_DIVIDA` → `qtd_rejeitados == 1`, valor contado uma vez; control (forma antiga = 2).
   - verify: pytest desse arquivo
4. Suíte cheia: `python -m pytest -q`
5. **Números NÃO reportáveis** até rodar `docs/data-verification-protocol.md` /
   `scripts/verify_query.py` contra SQL Server (before/after num dia real). Anotar no PR.

## Fora de escopo (mesma classe de bug, decisão separada)

- `dominios/graficos/queries.py` `build_rejeitados_por_portfolio_query` /
  `build_portfolio_rollup_query` / `_build_detalhe_*` — rejeitados por portfólio,
  `COUNT(DISTINCT NR_RECEBIMENTO)`. Gráficos de portfólio, não o número do TV.
- `dominios/acordos/queries.py` `build_tabela_performance_periodo_query` (`qtd_reprovados`).
- `dominios/agente/{cruzamento,risco,series}.py` — agente de chat, SQL próprio.

## Log

- [x] passo 1 — `dominios/produtividade/queries.py`: CTE_Rej_Acordo/CTE_Rej_Divida/
  CTE_Rejeitados_Agente; 3 linhas removidas de CTE_Financeiro_Agente; final SELECT
  `F.`→`RJ.` + LEFT JOIN; `build_produtividade_hoje_params` 5→6.
- [x] passo 2 — `tests/test_produtividade_query_shape.py`: `CTE_Rej_Acordo` na lista
  (EXISTS RD2 agora 6). Verificado: `s.count('?')==6`, `params==6`.
- [x] passo 3 — `tests/test_dedup_regravacao.py`: Cluster C, 3 testes
  (por dívida = 1 / control = 2 / N dívidas = N).
- [x] passo 4 — suíte cheia: `264 passed`.
- [x] commit `56a5b7c` na branch `fix/rejeitados-conta-por-divida`, pushed.
  Só 3 arquivos: `dominios/produtividade/queries.py`,
  `tests/test_produtividade_query_shape.py`, `tests/test_rejeitados_por_divida.py`
  (novo, self-contained — o Cluster C saiu de `test_dedup_regravacao.py` pra não
  arrastar o WIP §7 dessa branch pro commit).
- [x] graphify update .
- [ ] passo 5 — `scripts/verify_query.py` contra SQL Server (before/after num dia real).
  **Números não reportáveis até isso.** Fora deste processo (precisa do banco de produção).
- [ ] abrir PR
- [ ] deletar este arquivo no commit final antes do merge

- STATUS: COMMITADO/PUSHED — falta verificação contra SQL Server (passo 5) + PR
