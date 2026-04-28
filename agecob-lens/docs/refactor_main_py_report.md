# Relatório do refactor `main.py`

Aplicado conforme `agecob-lens/docs/refactor_main_py.md`.

## Métricas

| Métrica | Antes | Depois | Delta |
|---|---|---|---|
| Linhas de `main.py` | 1568 | 1447 | **−121 (−7,7%)** |
| Queries de produtividade | 2 (constante + builder) | 1 builder único | — |
| Sites de filtro Python de agentes | 8 | 0 | **−8** |
| Helpers de filtro Python | 3 (`_filter_excluded_agents`, `_is_excluded_agent_row`, `_normalize_agent_text`) | 0 | **−3** |

## Change 1 — Unificação da query de produtividade

- Criada a função `_build_produtividade_query(db, *, use_distinct_esforco)` (≈ linha 296 de `main.py`).
  - `use_distinct_esforco=True` → reproduz o antigo `QUERY_PRODUTIVIDADE_HOJE` (single-DB, `COUNT(DISTINCT ID_CTO_MASTER)`, colunas `valor_acordos`/`acordos_percentual`, hint `MAXDOP 0`).
  - `use_distinct_esforco=False` → reproduz `QUERY_AGENTES_UNIFICADO_BASE` + `get_query_comparacao_agentes` (suporta `todos` via `UNION ALL`, expõe `origem`, `COUNT` sem `DISTINCT`, colunas `valor_total_acordos`/`taxa_conversao`, filtros `U.CHAVE NOT LIKE 'suporte%'/'SISTEMA%'`).
- Callers migrados:
  - `/dashboard/produtividade-hoje/{db}` → `use_distinct_esforco=True`.
  - `/dashboard/status-carga/{db}` (loop por banco) → `use_distinct_esforco=True`.
  - `/dashboard/comparacao-agentes/{db}`, `/dashboard/detalhamento-agentes/{db}`, `/dashboard/produtividade/{db}` → `use_distinct_esforco=False`.
- Constantes/funções removidas:
  - `QUERY_PRODUTIVIDADE_HOJE`
  - `QUERY_AGENTES_UNIFICADO_BASE`
  - `_build_query_agentes_unificado`
  - `get_query_comparacao_agentes`
  - `_map_origem_filter` (não era mais referenciado após a unificação)

## Change 2 — Eliminação do filtro Python redundante

### Auditoria do filtro SQL (`FILTRO_AGENTES_EXCLUIDOS_SQL`)

Todas as queries executadas por endpoints possuem o filtro de agentes no `WHERE` **antes** da agregação:

| Query / builder | Linha | Filtro SQL aplicado? |
|---|---|---|
| `QUERY_ACORDOS_HOJE` | 291 | Sim — **convertido nesta passagem** (antes usava `NOT LIKE`/`<>` inline com alias `UM`). Alias renomeado para `U` e substituído por `FILTRO_AGENTES_EXCLUIDOS_SQL`. |
| `_build_produtividade_query` (distinct) | 385 | Sim |
| `_build_produtividade_query` (comparacao) | 514 | Sim |
| `_build_agreements_tabela_query` | 972 | Sim |
| `_build_primeira_parcela_dia_query` | 1313 | Sim |
| `_build_excecoes_por_portfolio_query` | 1349 | Sim |
| `_build_excecoes_por_agente_query` | 1378 | Sim |
| `_build_acordos_por_portfolio_query` | 1415 | Sim |
| `_build_primeira_parcela_por_agente_query` | 1444 | Sim |

### Remoções

- Removidas **8 chamadas** a `_filter_excluded_agents(...)` nos endpoints:
  - `get_dashboard_acordos_hoje`
  - `get_dashboard_acordos_hoje_todos`
  - `get_dashboard_acordos_hoje_por_banco`
  - `get_dashboard_acordos_hoje_agente`
  - `get_dashboard_produtividade_hoje`
  - `get_dashboard_status_carga` (dentro do loop)
  - `_get_dashboard_agentes_unificado` (comparacao/detalhamento/produtividade)
  - `_run_dashboard_chart` (builders de gráficos/cards)
- Deletadas as funções `_filter_excluded_agents`, `_is_excluded_agent_row`, `_normalize_agent_text`.
- **Mantidas** as constantes `EXCLUDED_AGENT_EXACT_NAMES` e `EXCLUDED_AGENT_PREFIXES` (documentam a regra; são implicitamente referenciadas pelo `FILTRO_AGENTES_EXCLUIDOS_SQL`).

## Change 3 — `CTE_Saldo_Original` restrito ao dia

- **Modo distinct** (single-DB) — predicado literal conforme a forma sugerida na spec:
  ```sql
  WHERE RD.NR_RECEBIMENTO IN (
      SELECT NR_RECEBIMENTO
      FROM REC_MASTER (NOLOCK)
      WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
  )
  ```
- **Modo comparacao** (`todos` / `UNION ALL`, com partição por `origem`) — `EXISTS` contra `CTE_Acordos_Unicos`, que já está restrita por data e carrega `origem`:
  ```sql
  WHERE EXISTS (
      SELECT 1 FROM CTE_Acordos_Unicos A
      WHERE A.NR_RECEBIMENTO = RD.NR_RECEBIMENTO
        AND A.origem        = RD.origem
  )
  ```
- O particionamento por `origem` continua garantido em ambos os `JOIN`s (`RD.origem = DM.origem` e `S.origem = A.origem`).

## Confirmações de regras preservadas

Nenhuma das constantes/políticas abaixo foi alterada:

- `STATUS_APROVADOS = (1, 3, 12)` (linha 53)
- `STATUS_EXCECAO = (11,)` (linha 54)
- `STATUS_UNIVERSO_ACORDOS = (1, 3, 11, 12)` (linha 55)
- `CPC_COMPLEMENTO_IDS = (252, 130, 110, 111, 253, 144, 151, 216, 140, 108, 90)` (linha 60)
- `PRIMEIRA_PARCELA = 0` (linha 63)
- `PORTFOLIO_COLUMN = "CAMPO010"` (linha 68)
- Hint `OPTION (USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'), MAXDOP 0)` mantida no ramo `use_distinct_esforco=True`.
- `NOLOCK` em **todas** as tabelas, inclusive nas subqueries `UNION ALL` do ramo `todos`.
- Padrão `CROSS APPLY TOP 1` dos builders de gráficos permanece intocado.
- Granularidade intencional entre os dois ramos de produtividade preservada (`COUNT DISTINCT` x `COUNT`).
- Fórmula de desconto `AVG(VALOR_ACORDO / VR_SALDO_ORIGINAL * 100)` com guarda `VR_ORIGINAL > 0`.
- Middlewares (auth, rate limit, CORS), `build_response_envelope`, `validate_produtividade_rows`, telemetria `_agent_ndjson` e o filtro substring de `assessoria` nos handlers: inalterados.

## Verificação estática

- `python -c "import ast; ast.parse(open('main.py', encoding='utf-8').read())"` → **SYNTAX OK**.
- `ReadLints main.py` → **sem erros**.

## Diff semântico esperado

O comportamento observável deve ser byte-identico ao da versão anterior para todo endpoint, exceto:

- `meta.generated_at` e `run_id` (já documentado como esperado).
- O redirect de `QUERY_ACORDOS_HOJE` do filtro inline para `FILTRO_AGENTES_EXCLUIDOS_SQL`:
  - antes filtrava `UM.NOME` (exatos `COBDESANTOS`/`NEMBUSUSER`, prefixos `ANTLIA%`/`INTERNA%`) e `UM.CHAVE` (exato `NEMBUSUSER`, prefixo `INTERNA%`);
  - agora filtra via `U.NOME`/`U.CHAVE` com a **mesma** lista de nomes e prefixos. Lista verificada em `FILTRO_AGENTES_EXCLUIDOS_SQL` (linhas 83–88).
  - Conclusão: conjunto de agentes excluídos idêntico.
- A redução de domínio em `CTE_Saldo_Original` só remove linhas de `REC_DIVIDAS` cujo `NR_RECEBIMENTO` não aparece em `REC_MASTER` do dia — nenhuma dessas linhas entraria em nenhum `LEFT JOIN` subsequente com hoje, portanto `VR_ORIGINAL` por agente/acordo permanece idêntico.

## Itens fora do escopo (não executados)

- Split de `main.py` em múltiplos módulos.
- Remoção/ORM de queries.
- Alterações em CORS, `.env`, rate-limit, autenticação, telemetria.
- Ajuste de `NOLOCK`, `MAXDOP`, `CROSS APPLY TOP 1`.
