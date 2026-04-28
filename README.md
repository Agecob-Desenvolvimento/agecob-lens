# Dashboard Relatorio (Monorepo)

Projeto de dashboard em estrutura monorepo:
- **Backend** em FastAPI + SQL Server (`main.py`)
- **Frontend** em React + Vite (`src`, `dist`)

O frontend consome a API para exibir dados de acordos do dia e indicadores operacionais.

## Tecnologias

- Python 3.8+
- FastAPI
- pyodbc
- SQL Server
- Node.js 18+
- React + TypeScript + Vite
- Tailwind + shadcn/ui + Recharts

## Estrutura do projeto

```text
agecob-lens/
  main.py
  requirements.txt
  atualizar.bat
  .env
  .env.example
  package.json
  vite.config.ts
  src/
  dist/
  docs/
```

## Pré-requisitos

1. Driver ODBC instalado: **ODBC Driver 17 for SQL Server**
2. Acesso ao SQL Server com usuário/senha válidos
3. Python e Node.js instalados

## Início rápido (subir sistema completo)

### Opção 1 — Atualização no servidor (recomendado)

```cmd
cd C:\agecob
git pull origin main
atualizar.bat
```

### Opção 2 — Manual (servidor/local)

```cmd
cd C:\agecob
python -m pip install -r requirements.txt
npm install
npm run build
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Após iniciar, acesse:

- App/API: `http://127.0.0.1:8000`
- Docs da API: `http://127.0.0.1:8000/docs`

### Verificação rápida (opcional)

```powershell
# Deve retornar status do banco
curl http://127.0.0.1:8000/health/db
```

## Atualização no servidor (procedimento completo)

Fluxo padrão para publicar uma nova versão em produção (`C:\agecob`).
Um deploy normal (que **não mexe em schema**) resume-se aos passos 1–4.
Os passos 5–6 só se aplicam quando a release inclui mudanças em índices/SQL
(o release atual inclui — ver seção [Aplicar índices SQL recomendados (DBA)](#aplicar-índices-sql-recomendados-dba)).

1. **Entrar como admin** no servidor e abrir `cmd` em `C:\agecob`.
2. **Backup rápido** (opcional mas recomendado no primeiro deploy do dia):
   ```cmd
   copy .env .env.bak
   ```
3. **Atualizar código + dependências + build + restart** em um passo:
   ```cmd
   atualizar.bat
   ```
   O script executa:
   - `git pull`
   - `pip install -r requirements.txt`
   - `npm install` + `npm run build` (gera `agecob-lens/dist`)
   - Força `--workers 4` no serviço NSSM `AgecobAPI` e reinicia.
4. **Smoke test** — a API deve voltar em ~10 s:
   ```powershell
   curl http://127.0.0.1:8000/health/db
   curl http://127.0.0.1:8000/health/db/COBwebRCBAUTOS
   curl http://127.0.0.1:8000/health/db/COBwebRCBCONSUMER
   ```
   Todas as respostas devem conter `"status":"ok"`. Se alguma falhar, ver
   [Rollback](#rollback-de-deploy).
5. **(Se a release pede)** Aplicar índices SQL — ver próxima seção.
6. **(Se necessário)** Limpar cache do dashboard após mudanças grandes:
   ```powershell
   # Basta reiniciar a API (o cache é em memória).
   C:\nssm\win64\nssm.exe restart AgecobAPI
   ```

### Rollback de deploy

Se o `atualizar.bat` subir versão quebrada:

```cmd
cd C:\agecob
git log --oneline -5
git reset --hard <HASH_ANTERIOR>
atualizar.bat
```

Em último caso, restaurar `.env` do backup e reiniciar o serviço:

```cmd
copy .env.bak .env
C:\nssm\win64\nssm.exe restart AgecobAPI
```

## Aplicar índices SQL recomendados (DBA)

Para releases que mudam performance de leitura, as recomendações ficam em:

- `agecob-lens/docs/sql-indexes-recommendations.sql` — fonte de verdade, comentada.
- `agecob-lens/docs/produtividade-agentes-consistency-audit.md` — auditoria de consistência do endpoint unificado `/dashboard/produtividade-agentes`.
- `main.py` expõe os mesmos índices via endpoints `/admin/indexes/*` para conferência.

### Caminho recomendado — SSMS, controlado pelo DBA

Como os índices são em tabelas grandes (`REC_MASTER`, `DEV`, `USU_MASTER`, `DIV`),
o certo é rodar o script manualmente, em janela de manutenção, com controle fino
de `ONLINE`, `DATA_COMPRESSION` e monitoramento de espaço/tempo.

1. **Janela de manutenção**: preferir horário de baixa escrita. `CREATE INDEX` com
   `ONLINE = OFF` bloqueia escrita na tabela durante a operação; com `ONLINE = ON`
   (Enterprise) roda concorrente mas consome mais tempdb.
2. **Conectar no SSMS** como `sa` ou role `db_ddladmin` em cada banco:
   - `COBwebRCBAUTOS`
   - `COBwebRCBCONSUMER`
3. **Revisar e executar** `agecob-lens/docs/sql-indexes-recommendations.sql` em cada
   banco. Ajustar antes de rodar:
   - Trocar `ONLINE = OFF` → `ONLINE = ON` se for Enterprise e não puder bloquear.
   - Remover `DATA_COMPRESSION = PAGE` se a edição não suportar (Standard pré-2016 SP1).
   - Ajustar `FILLFACTOR` conforme perfil de escrita (padrão 90 serve).
4. **Monitorar durante o CREATE**:
   ```sql
   SELECT session_id, percent_complete, estimated_completion_time / 60000 AS minutes_left
   FROM sys.dm_exec_requests
   WHERE command LIKE 'CREATE%INDEX%';
   ```
5. **Atualizar estatísticas** (o script já tem, mas se pulou):
   ```sql
   UPDATE STATISTICS dbo.REC_MASTER WITH FULLSCAN;
   UPDATE STATISTICS dbo.USU_MASTER WITH FULLSCAN;
   UPDATE STATISTICS dbo.DEV        WITH FULLSCAN;
   UPDATE STATISTICS dbo.DIV        WITH FULLSCAN;
   ```
6. **Validar ganho** — rodar antes e depois em uma sessão com:
   ```sql
   SET STATISTICS IO ON;
   SET STATISTICS TIME ON;
   -- cole aqui uma query representativa (ex.: a do endpoint /dashboard/produtividade-hoje)
   ```
   Esperado: **Clustered Index Scan** em `REC_MASTER` substituído por **Index Seek**
   em `IX_REC_MASTER_DT_EMISSAO`; `logical reads` cai 1–2 ordens de grandeza.

### Caminho alternativo — via endpoints admin (conferência/uso emergencial)

O `main.py` expõe dois endpoints que leem/aplicam **os mesmos índices** do
arquivo `.sql`. Servem para você conferir o estado sem abrir o SSMS, ou para
aplicar rapidamente num banco de homologação. **Em produção prefira SSMS.**

Pré-requisitos no `.env` do servidor:

```env
REQUIRE_API_AUTH=true
API_KEY=<chave_forte>
API_TOKEN=<token_forte>
ENABLE_INDEX_ADMIN=true
```

Após editar o `.env`, reiniciar a API:

```cmd
C:\nssm\win64\nssm.exe restart AgecobAPI
```

1. **Conferir o que falta** (read-only, seguro a qualquer hora):
   ```powershell
   $H = @{ "X-API-Key" = "<chave>"; "Authorization" = "Bearer <token>" }
   Invoke-RestMethod -Headers $H `
     http://127.0.0.1:8000/admin/indexes/status/COBwebRCBAUTOS
   ```
   Resposta traz `total_recommended`, `existing`, `missing` e a lista detalhada
   com `exists: true/false` por índice.

2. **Dry-run** — gera o SQL que seria rodado, sem executar:
   ```powershell
   Invoke-RestMethod -Method POST -Headers $H `
     "http://127.0.0.1:8000/admin/indexes/apply/COBwebRCBAUTOS?dry_run=true"
   ```
   Cada item da resposta traz `action: "would_create"` e o `sql` completo —
   copie e inspecione antes de aplicar de verdade.

3. **Aplicar de fato** (somente após dry-run conferido, em janela):
   ```powershell
   Invoke-RestMethod -Method POST -Headers $H `
     "http://127.0.0.1:8000/admin/indexes/apply/COBwebRCBAUTOS?dry_run=false&online=true&update_statistics=true"
   ```
   Parâmetros:
   - `dry_run` (default `true`) — `false` para executar.
   - `online` (default `false`) — `true` exige SQL Server Enterprise; permite
     escrita concorrente durante o `CREATE INDEX`.
   - `update_statistics` (default `false`) — dispara `UPDATE STATISTICS … FULLSCAN`
     nas tabelas afetadas depois do create.

4. **Repetir para o segundo banco**:
   ```powershell
   Invoke-RestMethod -Method POST -Headers $H `
     "http://127.0.0.1:8000/admin/indexes/apply/COBwebRCBCONSUMER?dry_run=false&online=true&update_statistics=true"
   ```

5. **Desligar o admin depois** (opcional, recomendado — superfície de ataque menor):
   ```env
   ENABLE_INDEX_ADMIN=false
   ```
   E reiniciar o serviço.

A operação é **idempotente**: índices que já existem retornam `action: "skipped_existing"`
e não são recriados.

### Rollback de índice

Se algum índice precisar sair (ex.: consumo de espaço inesperado):

```sql
USE COBwebRCBAUTOS;   -- ou COBwebRCBCONSUMER
DROP INDEX IX_REC_MASTER_DT_EMISSAO ON dbo.REC_MASTER;
-- repetir para os demais listados em sql-indexes-recommendations.sql
```

Não há impacto funcional — o dashboard volta a fazer scan, apenas mais lento.

## Configuração do backend

O backend lê variáveis de ambiente (sem segredos hardcoded):

- `DB_DRIVER`
- `DB_SERVER`
- `DB_USER`
- `DB_PASSWORD`
- `API_KEY`
- `API_TOKEN`

Variáveis opcionais de tuning (valores padrão entre parênteses):

- `DB_POOL_SIZE` (6) — conexões pyodbc reutilizadas por database, por worker.
- `DB_POOL_TIMEOUT` (10) — segundos de espera por conexão do pool.
- `DB_POOL_MAX_AGE_SECONDS` (1800) — idade máxima de uma conexão antes de reciclar.
- `DASHBOARD_CACHE_TTL` (60) — TTL em segundos do cache em memória dos endpoints de gráfico. `0` desliga.
- `REQUIRE_API_AUTH` (`false`) — quando `true`, exige `X-API-Key` + `Authorization: Bearer` em todos os endpoints de `/dashboard/*`, `/health/*` e `/admin/*`.
- `ENABLE_AGENT_TELEMETRY` (`false`) — habilita rotas de telemetria de agente.
- `ENABLE_INDEX_ADMIN` (`false`) — habilita `/admin/indexes/status/*` e `/admin/indexes/apply/*`. Mantenha `false` fora de janelas de manutenção.

Use o arquivo `.env.example` como base para criar seu `.env` local.

### Instalar dependências Python

```cmd
cd C:\agecob
python -m pip install -r requirements.txt
```

### Executar API

```cmd
cd C:\agecob
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

A API sobe em `http://0.0.0.0:8000` (acessível pela rede local via IP da máquina).

## Configuração do frontend

Arquivo `C:\agecob\.env` (build e API compartilham o mesmo arquivo):

```env
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

> Em produção, acesse por `http://<IP_SERVIDOR>:8000`.

### Instalar dependências do frontend

```cmd
cd C:\agecob
npm install
```

### Executar frontend

```cmd
cd C:\agecob
npm run dev
```

## Rodar em rede local (LAN)

Para outro computador acessar no mesmo endereço:

### Produção (endereço único)

1. Configure o serviço `AgecobAPI` no NSSM com:
   - AppDirectory: `C:\agecob`
   - AppParameters: `-m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4`
     (ajuste `--workers` para ~N de cores físicos; 4 é um default seguro para servidores modestos)
2. Libere a porta `8000` no firewall.
3. Abra no cliente da rede: `http://<IP_SERVIDOR>:8000`

> O `atualizar.bat` já força `--workers 4` via `nssm set AgecobAPI AppParameters` antes de reiniciar o serviço.

No modo produção, o FastAPI serve o frontend (`dist`) e a API no mesmo host, com suporte a `/api/*`.

### Exemplo de regra no firewall (PowerShell admin)

```powershell
netsh advfirewall firewall add rule name="Dash API 8000" dir=in action=allow protocol=TCP localport=8000
```

## Endpoints principais da API

### Infra
- `GET /` — frontend em produção (ou health simples sem build)
- `GET /docs` — Swagger UI
- `GET /api/*` — alias para os mesmos endpoints (útil para frontend unificado)
- `GET /health/db` — health check no banco padrão (COBwebRCBAUTOS)
- `GET /health/db/{database_name}` — health check no banco informado

### Acordos
- `GET /dashboard/acordos-hoje` — acordos do dia (COBwebRCBAUTOS, fixo). Aceita `?limit=500&offset=0` (máx 5000). Meta traz `pagination: { limit, offset, total, returned }`.
- `GET /dashboard/acordos-hoje/{database_name}` — acordos do dia por banco (mesma paginação).
- `GET /dashboard/acordos-hoje/todos` — acordos do dia com campo `banco_origem` (paginação aplicada por banco; meta inclui `total_por_banco`).

### Produtividade / Agentes
- `GET /dashboard/produtividade-hoje/{database_name}` — produtividade por banco (único)
- `GET /dashboard/comparacao-agentes/{db}` — comparação de agentes (aceita `todos`)
- `GET /dashboard/detalhamento-agentes/{database_name}` — detalhamento de agentes
- `GET /dashboard/produtividade/{database_name}` — alias de comparacao-agentes
- `GET /dashboard/produtividade-agentes` — produtividade unificada (consolidado + por banco na mesma resposta). Aceita `?force_refresh=true`.

### Dashboard v2 — novos endpoints
- `GET /dashboard/primeira-parcela-dia/{db}` — soma e contagem de 1ª parcela (PARCELA=0) emitida hoje
- `GET /dashboard/excecoes-por-portfolio/{db}` — exceções (status 11) agrupadas por portfólio
- `GET /dashboard/excecoes-por-agente/{db}` — exceções (status 11) agrupadas por agente
- `GET /dashboard/acordos-por-portfolio/{db}` — acordos aprovados agrupados por portfólio
- `GET /dashboard/primeira-parcela-por-agente/{db}` — valor e qtd de 1ª parcela por agente

Todos os endpoints acima aceitam `{db}`:
- `COBwebRCBAUTOS`
- `COBwebRCBCONSUMER`
- `todos` (UNION ALL dos dois bancos)

### Admin — índices SQL (requer `ENABLE_INDEX_ADMIN=true`)
- `GET /admin/indexes/status/{db}` — lista o estado (`exists`) de cada índice recomendado.
- `POST /admin/indexes/apply/{db}?dry_run=true&online=false&update_statistics=false` — aplica índices faltantes. Idempotente. Detalhes no passo-a-passo da seção [Aplicar índices SQL recomendados (DBA)](#aplicar-índices-sql-recomendados-dba).

`{db}` nos endpoints admin aceita **apenas** `COBwebRCBAUTOS` ou `COBwebRCBCONSUMER` (sem `todos`).

## Regras de negócio e convenções SQL

| Regra | Valor |
|---|---|
| Primeira parcela (entrada) | `PARCELA = 0` |
| Acordos válidos (`ID_REC_STATUS`) | `IN (1, 3, 12)` — ATIVO + BAIXA POR PAGAMENTO + BAIXA POR PAGAMENTO AVULSO |
| Exceções (`ID_REC_STATUS`) | `= 11` — EXCEÇÃO |
| Pré-filtro CTE acordos | `IN (1, 3, 11, 12)` |
| Coluna de nome do portfólio | `DIV_AUX.CAMPO010` |
| Padrão de data | `DECLARE @Hoje / @Amanha` + `DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha` |
| NOLOCK | Obrigatório em todas as referências de tabela |
| Agentes excluídos | `COBDESANTOS`, `ANTLIA%`, `INTERNA%`, `suporte%`, `SISTEMA%` |

## Scripts úteis (frontend)

```powershell
npm run dev
npm run dev:lan
npm run build
npm run lint
npm run test
npm run check
```

## Script útil (servidor)

```cmd
cd C:\agecob
atualizar.bat
```

## Observações

- O arquivo `.env` não deve ser commitado com dados sensíveis.
- `.env.example` deve conter apenas placeholders.
