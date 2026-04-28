# agecob-lens — Frontend do Dashboard

Aplicacao React (Vite + TypeScript) que consome a API FastAPI local e exibe dados operacionais de cobranca de dividas.

---

## 1. Stack

- React 18 + TypeScript
- Vite (dev server em `0.0.0.0:5173`)
- Tailwind CSS + shadcn/ui (Radix UI)
- Recharts (graficos de barra, pizza, compostos)
- TanStack React Query
- React Router v6

---

## 2. Estrutura do projeto

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

---

## 3. Acessar o dashboard

Em producao, FastAPI serve o frontend e a API no **mesmo endereco**. Nao ha servidor separado.

| De onde | Endereco |
|---|---|
| No proprio servidor | `http://127.0.0.1:8000` |
| Qualquer maquina da rede (LAN) | `http://192.168.0.20:8000` |

> Se o servidor mudar de IP, atualize `DB_SERVER` no `.env` e redistribua o link.

---

## 4. Gerenciar o servico (NSSM)

Todos os comandos abaixo devem ser rodados como **administrador** no servidor.

### Iniciar

```cmd
C:\nssm\win64\nssm.exe start AgecobAPI
```

### Parar

```cmd
C:\nssm\win64\nssm.exe stop AgecobAPI
```

### Reiniciar (dash parou, servico travou)

```cmd
C:\nssm\win64\nssm.exe stop AgecobAPI
C:\nssm\win64\nssm.exe start AgecobAPI
```

### Ver status

```cmd
C:\nssm\win64\nssm.exe status AgecobAPI
```

Retorno esperado: `SERVICE_RUNNING`.

### Confirmar que a API voltou

```cmd
curl http://127.0.0.1:8000/health/db
```

Retorno esperado: `{"COBwebRCBAUTOS": "ok", "COBwebRCBCONSUMER": "ok"}`.

---

## 5. Configurar o servico do zero (primeira vez)

Rodar uma unica vez ao instalar em servidor novo.

**Passo 1 — Baixar o codigo**

```cmd
cd C:\agecob
git pull origin main
pip install -r requirements.txt
cd agecob-lens && npm install && npm run build && cd ..
```

**Passo 2 — Criar o servico no NSSM**

```cmd
C:\nssm\win64\nssm.exe install AgecobAPI "C:\Python3\python.exe"
C:\nssm\win64\nssm.exe set AgecobAPI AppDirectory "C:\agecob"
C:\nssm\win64\nssm.exe set AgecobAPI AppParameters "-m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4"
C:\nssm\win64\nssm.exe set AgecobAPI AppEnvironmentExtra "PYTHONUNBUFFERED=1"
C:\nssm\win64\nssm.exe set AgecobAPI Start SERVICE_AUTO_START
C:\nssm\win64\nssm.exe start AgecobAPI
```

> Ajuste `C:\Python3\python.exe` conforme o caminho real (`where python` no cmd).

**Passo 3 — Liberar porta no firewall**

```powershell
netsh advfirewall firewall add rule name="Dash API 8000" dir=in action=allow protocol=TCP localport=8000
```

**Passo 4 — Verificar**

```cmd
curl http://127.0.0.1:8000/health/db
```

---

## 6. Atualizar o dashboard (nova versao)

```cmd
cd C:\agecob
atualizar.bat
```

O script faz `git pull`, reinstala dependencias, rebuilda o frontend e reinicia o servico automaticamente.

### O que o `atualizar.bat` faz hoje (versao atual)

- Executa autoelevacao para administrador (UAC) quando necessario.
- Valida caminhos criticos antes de iniciar:
  - `C:\agecob\main.py`
  - `C:\agecob\agecob-lens\package.json`
  - `C:\nssm\win64\nssm.exe`
- Atualiza codigo com `git pull origin main`.
- Instala dependencias Python com `python -m pip install -r requirements.txt --quiet`.
- Builda frontend no diretorio correto do monorepo:
  - `C:\agecob\agecob-lens`
- Reinicia o servico `AgecobAPI` via NSSM.
- Interrompe em qualquer falha e exibe mensagem de erro objetiva.

### Atualizacao manual (fallback)

Se o `.bat` falhar no servidor, rode no **CMD como administrador**:

```cmd
cd /d C:\agecob
git pull origin main
python -m pip install -r requirements.txt --quiet
cd /d C:\agecob\agecob-lens
npm install --quiet
npm run build
C:\nssm\win64\nssm.exe restart AgecobAPI
```

---

## 7. Portas

| Porta | Uso |
|---|---|
| `8000` | API + frontend — **producao** |
| `5173` | Dev server Vite — **apenas desenvolvimento** |

---

## 8. Desenvolvimento local

```powershell
npm install
npm run dev
```

### Como acessar o dashboard com `npm run dev`

1. No terminal, rode `npm run dev` dentro da pasta `agecob-lens`.
2. Abra o navegador no endereco `http://127.0.0.1:5173`.
3. Se a porta `5173` estiver ocupada, use a URL que o Vite mostrar no terminal (ex.: `http://127.0.0.1:5174`).
4. Garanta que a API esteja ativa em `http://127.0.0.1:8000`, pois o frontend consome os endpoints dela.

Para acesso via rede local durante desenvolvimento:

```powershell
npm run dev:lan
```

Acesse `http://127.0.0.1:5173`. A API deve estar rodando em `http://127.0.0.1:8000`.

---

## 9. Referencia tecnica

**Seletor de banco**

| Label no dashboard | Valor enviado na API |
|---|---|
| Todas | `todos` |
| AUTOS | `COBwebRCBAUTOS` |
| CONSUMER | `COBwebRCBCONSUMER` |

**Taxa de Conversao**

```
Taxa Conversao = (qtd_contatos / qtd_acordos) * 100
```

Exibida com 2 casas decimais. Retorna `0` quando `qtd_acordos = 0`.

**Endpoints consumidos**

Ver `docs/data-coverage-analysis.md` para a lista completa e matriz de cobertura.
Ver `docs/produtividade-agentes-consistency-audit.md` para a auditoria de consistencia do endpoint `/dashboard/produtividade-agentes`.

### Documentos de arquitetura (future implem)

Para planejamento de evolucao do produto (sem impacto imediato no runtime), consultar:

- `docs/future implem/redesign_executivo_dashboard_92b7d68c.plan.md`
- `docs/future implem/pipeline-analise-operacional.md`

Observacao:
- Esses documentos descrevem arquitetura alvo e roadmap.
- Nao substituem os contratos tecnicos ja ativos no backend.

**Scripts uteis**

```powershell
npm run build   # gera dist/ para producao
npm run check   # verificacao rapida de tipos e lint
npm run lint    # lint completo
```
