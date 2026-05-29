# Dashboard Relatorio (Monorepo)

Monorepo com **backend** FastAPI + SQL Server (`main.py`) e **frontend** React + Vite (`src/dist`). O frontend consome a API para exibir acordos do dia e indicadores operacionais.

## Stack

- **Backend:** Python 3.8+, FastAPI, pyodbc, SQL Server
- **Frontend:** Node.js 18+, React + TypeScript + Vite, Tailwind + shadcn/ui + Recharts

## Estrutura

```
agecob-lens/  main.py  requirements.txt  atualizar.bat  .env  .env.example
              package.json  vite.config.ts  src/  dist/  docs/
```

## Pré-requisitos

- ODBC Driver 17 for SQL Server instalado
- Acesso ao SQL Server com usuário/senha válidos
- Python 3.8+ e Node.js 18+

## Início rápido

**Recomendado (servidor):**
```cmd
cd C:\agecob && git pull origin main && atualizar.bat
```

**Manual:**
```cmd
cd C:\agecob
python -m pip install -r requirements.txt
npm install && npm run build
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Acesse: `http://127.0.0.1:8000` | Docs: `http://127.0.0.1:8000/docs`

## Deploy em produção (`C:\agecob`)

1. Abrir `cmd` como admin em `C:\agecob`
2. Backup opcional: `copy .env .env.bak`
3. Atualizar tudo: `atualizar.bat` *(git pull + pip + npm build + restart NSSM)*
4. Smoke test (~10 s após restart):
   ```powershell
   curl http://127.0.0.1:8000/health/db
   curl http://127.0.0.1:8000/health/db/COBwebRCBAUTOS
   curl http://127.0.0.1:8000/health/db/COBwebRCBCONSUMER
   ```
   Todas devem retornar `"status":"ok"`.
5. Se a release inclui mudança de schema/índices: ver [Índices SQL](#índices-sql-dba).
6. Para limpar cache em memória: `C:\nssm\win64\nssm.exe restart AgecobAPI`

### Rollback

```cmd
git log --oneline -5
git reset --hard <HASH_ANTERIOR>
atualizar.bat
# Se necessário: copy .env.bak .env && C:\nssm\win64\nssm.exe restart AgecobAPI
```

## Índices SQL (DBA)

Fonte de verdade: `docs/sql-indexes-recommendations.sql`. Auditoria: `docs/produtividade-agentes-consistency-audit.md`.

### Via SSMS (recomendado em produção)

Tabelas afetadas: `REC_MASTER`, `DEV`, `USU_MASTER`, `DIV`. Preferir janela de baixa escrita.

1. Conectar como `sa` / `db_ddladmin` em `COBwebRCBAUTOS` e `COBwebRCBCONSUMER`
2. Revisar e executar `docs/sql-indexes-recommendations.sql` — ajustar `ONLINE`, `DATA_COMPRESSION` e `FILLFACTOR` conforme edição do SQL Server
3. Monitorar:
   ```sql
   SELECT session_id, percent_complete, estimated_completion_time/60000 AS min_left
   FROM sys.dm_exec_requests WHERE command LIKE 'CREATE%INDEX%';
   ```
4. Atualizar estatísticas (já incluso no script):
   ```sql
   UPDATE STATISTICS dbo.REC_MASTER WITH FULLSCAN;
   UPDATE STATISTICS dbo.USU_MASTER WITH FULLSCAN;
   UPDATE STATISTICS dbo.DEV WITH FULLSCAN;
   UPDATE STATISTICS dbo.DIV WITH FULLSCAN;
   ```

### Via endpoints admin (homologação / conferência)

Exige no `.env`:
```env
REQUIRE_API_AUTH=true  API_KEY=<chave>  API_TOKEN=<token>  ENABLE_INDEX_ADMIN=true
```
Reiniciar: `C:\nssm\win64\nssm.exe restart AgecobAPI`

```powershell
$H = @{ "X-API-Key" = "<chave>"; "Authorization" = "Bearer <token>" }

# Conferir estado (read-only)
Invoke-RestMethod -Headers $H http://127.0.0.1:8000/admin/indexes/status/COBwebRCBAUTOS

# Dry-run (gera SQL sem executar)
Invoke-RestMethod -Method POST -Headers $H "http://127.0.0.1:8000/admin/indexes/apply/COBwebRCBAUTOS?dry_run=true"

# Aplicar
Invoke-RestMethod -Method POST -Headers $H "http://127.0.0.1:8000/admin/indexes/apply/COBwebRCBAUTOS?dry_run=false&online=true&update_statistics=true"
Invoke-RestMethod -Method POST -Headers $H "http://127.0.0.1:8000/admin/indexes/apply/COBwebRCBCONSUMER?dry_run=false&online=true&update_statistics=true"
```

Operação idempotente — índices existentes retornam `action: "skipped_existing"`. Após aplicar, setar `ENABLE_INDEX_ADMIN=false` e reiniciar.

### Rollback de índice

```sql
USE COBwebRCBAUTOS; -- ou COBwebRCBCONSUMER
DROP INDEX IX_REC_MASTER_DT_EMISSAO ON dbo.REC_MASTER;
-- repetir para os demais listados em sql-indexes-recommendations.sql
```

## Configuração

### Backend (`.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `DB_DRIVER / SERVER / USER / PASSWORD` | — | Conexão SQL Server |
| `API_KEY / API_TOKEN` | — | Auth da API |
| `DB_POOL_SIZE` | 6 | Conexões por database por worker |
| `DB_POOL_TIMEOUT` | 10 | Segundos de espera por conexão |
| `DB_POOL_MAX_AGE_SECONDS` | 1800 | Idade máxima de conexão |
| `DASHBOARD_CACHE_TTL` | 60 | TTL do cache em memória (0 = off) |
| `REQUIRE_API_AUTH` | false | Exige auth em `/dashboard/*`, `/health/*`, `/admin/*` |
| `ENABLE_AGENT_TELEMETRY` | false | Habilita rotas de telemetria |
| `ENABLE_INDEX_ADMIN` | false | Habilita `/admin/indexes/*` |

Use `.env.example` como base.

### Frontend (`.env`)

```env
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

Em produção: `http://<IP_SERVIDOR>:8000`

## Rede local (LAN)

1. NSSM `AgecobAPI`: `AppDirectory=C:\agecob`, `AppParameters=-m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4`
2. Liberar porta `8000` no firewall:
   ```powershell
   netsh advfirewall firewall add rule name="Dash API 8000" dir=in action=allow protocol=TCP localport=8000
   ```
3. Acessar: `http://<IP_SERVIDOR>:8000`

O `atualizar.bat` já força `--workers 4` via `nssm set` antes de reiniciar.

## Endpoints

### Infra
| Endpoint | Descrição |
|---|---|
| `GET /` | Frontend (prod) ou health |
| `GET /docs` | Swagger UI |
| `GET /api/*` | Alias para todos os endpoints |
| `GET /health/db[/{database_name}]` | Health check no banco |

### Acordos
| Endpoint | Descrição |
|---|---|
| `GET /dashboard/acordos-hoje` | Acordos do dia — COBwebRCBAUTOS. `?limit=500&offset=0` (máx 5000) |
| `GET /dashboard/acordos-hoje/{database_name}` | Por banco |
| `GET /dashboard/acordos-hoje/todos` | Todos com `banco_origem` |

### Produtividade / Agentes
| Endpoint | Descrição |
|---|---|
| `GET /dashboard/produtividade-hoje/{db}` | Produtividade por banco |
| `GET /dashboard/comparacao-agentes/{db}` | Comparação (aceita `todos`) |
| `GET /dashboard/detalhamento-agentes/{db}` | Detalhamento |
| `GET /dashboard/produtividade/{db}` | Alias de comparacao-agentes |
| `GET /dashboard/produtividade-agentes` | Unificado consolidado + por banco. `?force_refresh=true` |

### Dashboard v2
| Endpoint | Descrição |
|---|---|
| `GET /dashboard/primeira-parcela-dia/{db}` | Soma/qtd de 1ª parcela (PARCELA=0) do dia |
| `GET /dashboard/excecoes-por-portfolio/{db}` | Exceções (status 5 - PENDENTE, "Exceção" no negócio) por portfólio |
| `GET /dashboard/rejeitados-por-portfolio/{db}` | Rejeitados (status 7 - REJEITADO) por portfólio |
| `GET /dashboard/quebrados-por-portfolio/{db}` | Boletos quebrados (status 2) por portfólio |
| `GET /dashboard/excecoes-por-agente/{db}` | Exceções por agente |
| `GET /dashboard/acordos-por-portfolio/{db}` | Acordos aprovados por portfólio |
| `GET /dashboard/primeira-parcela-por-agente/{db}` | 1ª parcela por agente |

`{db}`: `COBwebRCBAUTOS` | `COBwebRCBCONSUMER` | `todos`

### Admin (requer `ENABLE_INDEX_ADMIN=true`)
| Endpoint | Descrição |
|---|---|
| `GET /admin/indexes/status/{db}` | Estado de cada índice recomendado |
| `POST /admin/indexes/apply/{db}` | Aplica índices faltantes. `?dry_run=true&online=false&update_statistics=false` |

`{db}` admin: apenas `COBwebRCBAUTOS` ou `COBwebRCBCONSUMER`.

## Regras de negócio

| Regra | Valor |
|---|---|
| Primeira parcela | `PARCELA = 0` |
| Acordos válidos (`ID_REC_STATUS`) | `IN (1, 3, 12)` — ATIVO + BAIXAS POR PAGAMENTO |
| Exceções (`ID_REC_STATUS`) | `IN (5)` — enum chama de PENDENTE; negócio chama de "Exceção" |
| Rejeitados (`ID_REC_STATUS`) | `IN (7)` (REJEITADO — supervisor/banco negou) |
| Boletos quebrados (`ID_REC_STATUS`) | `IN (2)` |
| Pré-filtro CTE | `IN (1, 3, 5, 12)` |
| Portfólio | `DIV_AUX.CAMPO010` |
| Filtro de data | `DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha` |
| NOLOCK | Obrigatório em todas as tabelas |
| Agentes excluídos | `COBDESANTOS`, `ANTLIA%`, `INTERNA%`, `suporte%`, `SISTEMA%` |

## Scripts

```powershell
# Frontend
npm run dev | dev:lan | build | lint | test | check

# Servidor
atualizar.bat
```

---

> `.env` nunca deve ser commitado com dados sensíveis. Use `.env.example` com placeholders.
