# Backend — FastAPI (main.py)

[← index](index.md)

## Stack

- Python 3.x
- FastAPI + Uvicorn
- pyodbc → SQL Server
- Middleware: CORS, auth, rate limit, api-prefix

---

## Constantes de Negócio

```python
ALLOWED_DATABASES = ["COBwebRCBAUTOS", "COBwebRCBCONSUMER"]

EXCLUDED_AGENT_EXACT_NAMES = ("COBDESANTOS", "NEMBUSUSER")
EXCLUDED_AGENT_PREFIXES    = ("ANTLIA", "INTERNA")

STATUS_APROVADOS          = (1, 3, 12)    # ATIVO, BAIXA PAGAMENTO, BAIXA AVULSA
STATUS_EXCECAO            = (11,)         # EXCEÇÃO
STATUS_UNIVERSO_ACORDOS   = (1, 3, 11, 12)

CPC_COMPLEMENTO_IDS = (252, 130, 110, 111, 253, 144, 151, 216, 140, 108, 90)
PRIMEIRA_PARCELA    = 0
PORTFOLIO_COLUMN    = "CAMPO010"
```

---

## Rotas

### Health
| Método | Path | Função |
|--------|------|--------|
| GET | `/health/db` | health check AUTOS |
| GET | `/health/db/{database_name}` | health check por banco |
| GET | `/` | root — serve SPA ou docs |

### Acordos
| Método | Path | Função |
|--------|------|--------|
| GET | `/dashboard/acordos-hoje` | acordos de hoje (AUTOS) |
| GET | `/dashboard/acordos-hoje/todos` | acordos AUTOS + CONSUMER |
| GET | `/dashboard/acordos-hoje/{database_name}` | acordos por banco |
| GET | `/dashboard/acordos-hoje-agente/{db}` | acordos filtrados por agente |

### Produtividade
| Método | Path | Função |
|--------|------|--------|
| GET | `/dashboard/produtividade-hoje/{database_name}` | produtividade diária |
| GET | `/dashboard/status-carga/{db}` | status de carga |
| GET | `/dashboard/comparacao-agentes/{db}` | comparação unificada |
| GET | `/dashboard/detalhamento-agentes/{database_name}` | detalhamento por agente |
| GET | `/dashboard/produtividade/{database_name}` | produtividade geral |

### Gráficos / Cards
| Método | Path |
|--------|------|
| GET | `/dashboard/primeira-parcela-dia/{db}` |
| GET | `/dashboard/excecoes-por-portfolio/{db}` |
| GET | `/dashboard/excecoes-por-agente/{db}` |
| GET | `/dashboard/acordos-por-portfolio/{db}` |
| GET | `/dashboard/primeira-parcela-por-agente/{db}` |

### Catch-all
| Método | Path | Função |
|--------|------|--------|
| GET | `/{full_path:path}` | SPA fallback → index.html |

---

## Funções Principais

### Conexão e Query
```python
get_connection(database_name) → pyodbc.Connection
run_query(sql, database_name, params, run_id, context) → list[dict]
build_response_envelope(rows, sources, errors, filters, run_id, quality) → dict
```

### Builders de Query SQL — Dashboard
```python
_build_produtividade_query(db, use_distinct_esforco)
_build_primeira_parcela_dia_query(db)
_build_excecoes_por_portfolio_query(db)
_build_excecoes_por_agente_query(db)
_build_acordos_por_portfolio_query(db)
_build_primeira_parcela_por_agente_query(db)
_wrap_todos_or_single(db, base_fn, agg_select, order_by)  # agrega UNION ALL
```

### Builders de Query SQL — Efetividade (`dominios/efetividade/queries.py`)

```python
# ETL (rodado em background pelo EfetividadeETL)
_build_ef_diaria_primeira(db)
_build_ef_mensal_primeira(db)
_build_ef_diaria_colchao(db)
_build_ef_mensal_colchao(db)
_build_ef_diaria_colchao_vencimento(db)
_build_ef_mensal_colchao_vencimento(db)
_build_ef_mensal_agente_primeira(db)
_build_ef_mensal_agente_colchao(db)
_build_ef_mensal_agente_colchao_vencimento(db)

# Live (chamado por /efetividade/resumo)
_build_ef_resumo_sql(db, parcela_tipo, date_from_lit, date_to_lit, id_portfolio)
_build_ef_resumo_params(db, id_portfolio)
```

**Filtro de agentes (`_EF_AGENT_FILTER`)** — aplicado em TODAS as queries de efetividade via `INNER JOIN USU_MASTER`:

```sql
AND UPPER(U.CHAVE) NOT LIKE '%SERASA%'
AND UPPER(U.CHAVE) NOT LIKE '%COBDESANTOS%'
AND UPPER(U.CHAVE) NOT LIKE '%NEMBUS%'
AND UPPER(U.CHAVE) NOT LIKE '%ANTLIA%'
AND UPPER(U.CHAVE) NOT LIKE '%SUPORTE%'
AND UPPER(U.CHAVE) NOT LIKE '%INTERNA%'
AND UPPER(U.CHAVE) NOT LIKE '%SISTEMA%'
AND UPPER(U.NOME) NOT LIKE '%COBDESANTOS%'
AND UPPER(U.NOME) NOT LIKE '%NEMBUSUSER%'
```

> ⚠️ Sem esse filtro, `amount_received` (VALOR RECEBIDO) inclui boletos de usuários sistema e fica inflado. O JOIN com `USU_MASTER` é obrigatório em todas as queries de efetividade.

### Validação
```python
validate_database(database_name)              # raise 422 se inválido
validate_database_or_todos(database_name)     # aceita "todos"
validate_produtividade_rows(rows, run_id)     # normaliza campos obrigatórios
```

**Campos obrigatórios em produtividade:**
```
CHAVE, NOME, qtd_acionamentos, qtd_contatos, cpc_percentual,
qtd_acordos, acordos_percentual, valor_acordos, acordo_medio,
parcelamento_medio, desconto_medio_percentual, valor_primeira_parcela,
qtd_excecoes, valor_excecoes
```

### Configuração
```python
_load_env_file(path)
_parse_cors_origins(raw_value) → list[str]
```

### Agent Telemetry (opcional)
```python
_agent_ndjson(hypothesis_id, location, message, data, run_id)
_start_agent_log_cleanup_worker()
```

---

## Middlewares (ordem de execução)

1. `api_prefix_middleware` — normaliza `/api/...` → `/...`
2. `security_middleware`:
   - `_require_auth(request)` — valida `X-API-Key` + Bearer token
   - `_rate_limit_dashboard(request, path)` — 75 req / 60s por IP:API_KEY
   - Logging NDJSON por requisição
3. CORSMiddleware (FastAPI built-in)

---

## Envelope de Resposta Padrão

```json
{
  "meta": {
    "generated_at": "ISO8601",
    "total_rows": 42,
    "sources": ["COBwebRCBAUTOS"],
    "filters": {}
  },
  "data": [...],
  "errors": []
}
```
