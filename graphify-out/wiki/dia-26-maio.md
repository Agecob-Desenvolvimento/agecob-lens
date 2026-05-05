# Sessão 26 de Maio — Efetividade de Boletos e Refatoração

[← index](index.md)

**Data:** 2026-05-04  
**Sistema:** COBweb  
**Scope:** Melhorias no dashboard de Efetividade de Boletos + refatoração do `main.py` em domínios.

---

## Dicionário de Dados — `REC_MASTER`

| Coluna | Descrição |
|--------|-----------|
| `ID_REC` | PK do acordo |
| `ID_CARTEIRA` | FK para carteira |
| `ID_DEV` | FK para devedor |
| `NR_RECEBIMENTO` | Número do acordo/boleto |
| `DT_EMISSAO` | Data de emissão |
| `DT_VENCIMENTO` | Data de vencimento da parcela |
| `DT_PAGAMENTO` | Data de pagamento |
| `PARCELA` | Número da parcela |
| `PLANO` | Total de parcelas do acordo |
| `VALOR` | Valor da parcela (face do boleto) |
| `VR_PAGO` | Valor efetivamente pago |
| `ID_REC_STATUS` | 1,3,12 = pago/ativo; 2,10 = quebrado; 4,5,8 = pendente; 11 = exceção |
| `DT_QUEBRA` | Data da quebra do acordo |

Tabelas relacionadas: `REC_DIVIDAS`, `DIV_MASTER`, `CART_MASTER`, `DEV_MASTER`.

---

## Regras de Negócio (canonical — use estas, não as anteriores)

### Expressões SQL definitivas

```sql
-- pago_expr (Paid on Time — 5 dias de graça)
CASE WHEN DT_PAGAMENTO IS NOT NULL AND VR_PAGO > 0
     AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO)
THEN 1 ELSE 0 END

-- recv_expr (Amount Received — exclui pagamentos R$0)
CASE WHEN DT_PAGAMENTO IS NOT NULL AND VR_PAGO > 0
THEN VR_PAGO ELSE 0 END

-- effectiveness_pct
CAST(100.0 * SUM(recv_expr) / NULLIF(SUM(VALOR), 0) AS DECIMAL(8,2))
```

### Decisões tomadas

| # | Decisão | Regra |
|---|---------|-------|
| 1 | Período de graça | `DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO)` |
| 2 | Excluir pagamentos R$0 | `AND VR_PAGO > 0` em `pago_expr` e `recv_expr` |
| 3 | Best/Worst Day por valor | usa `effectiveness_pct`, não `conversion_pct` |
| 4 | Excluir dia corrente do Best/Worst | `AND DT_VENCIMENTO < CAST(GETDATE() AS DATE)` |
| 5 | Overpayments (efetividade > 100%) | permitido; explicado via tooltip no frontend |

### Formato de data no SQL Server

Passar datas sem hífens (`YYYYMMDD`) e converter com `CONVERT(DATE, param, 112)` para evitar que o SQL Server interprete `2026-05-01` como 5 de janeiro (formato `mdy`).

---

## Auditoria de Métricas

| Métrica | Status | Observação |
|---------|--------|------------|
| Generated Boletos | ✅ OK | Contagem de parcelas, não acordos |
| Paid on Time | Corrigido | Agora usa 5 dias de graça |
| % Conversão | ✅ OK | Count-based, coexiste com Efetividade |
| Amount Maturing | ✅ OK | `SUM(VALOR)` sem filtro de pagamento |
| Amount Received | Corrigido | Excluía pagamentos R$0 |
| Effectiveness % | ✅ OK | `recv_expr` com `ELSE 0` garante denominador |
| Best/Worst Day | Corrigido | Agora por `effectiveness_pct` (valor), sem dia atual |

**Distinção Count vs. Value:** `% Conversão` (count) e `Efetividade` (valor) são métricas distintas e válidas. Exemplo: boleto R$10 pago + boleto R$1.000 não pago → Conversão = 50%, Efetividade = 0,99%.

---

## Gráficos Alterados

- **Tendência Mensal:** duas linhas — `% Conversão` (azul tracejada) + `Efetividade %` (verde sólida).
- **Efetividade Diária:** título dinâmico com datas no formato local `DD/MM/YYYY`.

---

## Refatoração do `main.py`

Objetivo: reduzir monolito (~2825 linhas) para pacote modular sem alterar comportamento.

### Estrutura alvo

```
config/settings.py          # constantes, env vars, Settings class
core/
  database/pool_manager.py  # PoolManager (thread-safe)
  database/query_executor.py # run_query()
  cache/cache_manager.py    # CacheManager (TTL)
  telemetry/agent_logger.py # AgentLogger (ndjson)
  utils/                    # sql_helpers, pagination, validation, etc.
dominios/
  acordos/   (queries.py, servico.py)
  produtividade/ (queries.py, servico.py, validacao.py)
  efetividade/   (queries.py, servico.py, etl.py)
  graficos/  (queries.py, servico.py)
  agentes/   (queries.py, servico.py)
api/
  routers/   (dashboard.py, efetividade.py, admin.py, health.py)
  dependencias.py, middleware.py
static.py                   # monta /assets e SPA fallback
main.py                     # ~150 linhas — app, routers, startup
```

### Managers

| Classe | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| `PoolManager` | `core/database/pool_manager.py` | Pool de conexões pyodbc |
| `CacheManager` | `core/cache/cache_manager.py` | Cache TTL em memória |
| `AgentLogger` | `core/telemetry/agent_logger.py` | ndjson + cleanup thread |
| `ProdutividadeServico` | `dominios/produtividade/servico.py` | Cache de agentes (`_PRODUTIVIDADE_AGENTES_CACHE`) |
| `EfetividadeETL` | `dominios/efetividade/etl.py` | Thread ETL, refresh a cada 3600s |

### Restrições

- Nenhuma alteração funcional — endpoints, status codes, JSON response idênticos.
- Imports absolutos (sem circulares).
- `uvicorn main:app` deve subir sem erros.

---

## Configuração de Ambientes

| Ambiente | DB | Frontend | Backend |
|----------|----|----------|---------|
| production | SQL Server prod | domínio prod | servidor prod |
| run dev | SQL Server staging | domínio dev | servidor dev |
| local test | SQLite / SQL Server local | localhost:5173 | localhost:8000 |

Arquivos: `.env.example`, `.env.production`, `.env.dev`, `.env.local`, `config.py` (Settings), `src/config.ts` (VITE_API_BASE_URL), `run_local.sh`, `run_dev.sh`.

---

## Próximos Passos

1. Validar em homologação com dados reais.
2. Confirmar volume de `VR_PAGO=0` com query de diagnóstico.
3. Alinhar outros dashboards que usavam definição antiga de "pago no prazo".
4. Definir seed local (SQLite vs. Docker SQL Server).
5. Rollout para produção após validação.
