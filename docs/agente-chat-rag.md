# Agente Analista de Carteiras — Documentação Técnica

Assistente de IA embutido no AgDash (`POST /agente/chat` + painel no Home) que
responde perguntas executivas sobre rentabilidade, risco, ritmo, conversão e
performance de agentes das carteiras de cobrança.

> **Arquitetura: "RAG agêntico" sobre dados estruturados.** Não há base
> vetorial nem busca semântica: o retrieval é feito por **tool calling** — o
> LLM decide quais ferramentas chamar, cada ferramenta executa SQL
> parametrizado (ou lê stores em memória) com as mesmas regras de negócio do
> dashboard, e o resultado volta como contexto para a resposta. O grounding é
> garantido por contrato: o modelo é instruído a usar **apenas** números
> retornados pelas tools.

---

## 1. Fluxo de uma requisição

```text
POST /agente/chat  { messages, database, dateFrom?, dateTo? }
        │  api/routers/agente.py
        │    gates: ENABLE_AGENT_CHAT, provider válido, API key presente
        │    validação: roles, datas YYYY-MM-DD, janela ordenada
        │    trim: últimas 20 mensagens × 4000 chars
        ▼
run_agent()        dominios/agente/agente.py
        │    1. build_portfolio_entries(db, janela)   ← dataset eager (cache 60s)
        │    2. system_prompt.md + contexto da sessão (db, período, nº carteiras)
        │    3. _build_providers()                    ← closures lazy (nada roda aqui)
        ▼
Loop de tool calling (até AGENT_MAX_TOOL_ITERS iterações)
        │    Anthropic (formato nativo) ou DeepSeek (OpenAI-compatible)
        │    cada tool_use → dispatch_tool() → JSON ensure_ascii=False
        ▼
_parse_agent_final_text()  → AgentResponse normalizado (nunca 500 por formato)
        ▼
build_response_envelope([AgentResponse], sources, filters, run_id)
```

Arquivos:

| Camada | Arquivo |
|---|---|
| Rota / gates | `api/routers/agente.py` |
| Runner / loop LLM / providers | `dominios/agente/agente.py` |
| Schemas das tools + dispatch | `dominios/agente/tools.py` |
| Prompt (contrato com o modelo) | `dominios/agente/system_prompt.md` |
| Datasets e queries | `dominios/agente/{risco,agentes,series,fases,conversao,cruzamento,detalhe}.py` |
| Frontend | `agecob-lens/src/components/agente/AgentChatPanel.tsx`, `hooks/useAgentChat.ts`, `contexts/AgentChatContext.tsx` |

## 2. Datasets base

### PortfolioEntry (`risco.py`)

Fonte única server-side do risco por carteira. Reusa
`build_portfolio_rollup_query` (1 scan de REC_MASTER, grão carteira × status)
e agrega com as mesmas regras do gráfico de rentabilidade do frontend:

- **Denominador único (universo)** = valor de 1ª parcela do período: gerados
  (status 1, 2, 3, 10, 12) + exceções (5) + rejeitados (7). Cada dimensão é
  fatia 0–100% por construção.
- **`risco_composto = MAX(excecoes_pct, quebrados_pct, rejeitados_pct)`** —
  nunca soma (dimensões não são aditivas).
- **Níveis**: ≤ 25% baixo · ≤ 50% médio · > 50% alto (`RISK_LEVEL_*` em
  `config/settings.py`).
- **`anomalia=true`** quando alguma dimensão > 100% — estruturalmente
  impossível com o denominador-universo, logo dado corrompido na origem. O
  prompt obriga o modelo a alertar, nunca capar.

### AgentEntry (`agentes.py`)

Reusa `build_produtividade_query` (variant B, a mesma de
`/comparacao-agentes`). Linhas por origem são somadas por agente
(`normalize_agent_key`) e as razões recalculadas após a soma. Vocabulário do
funil (ADR-006): `qtd_alo` = **Contato** (alguém atende); `qtd_contatos` =
**CPC** (pessoa certa, contagem — nunca %).

## 3. As 15 tools

| Tool | Pergunta que responde | Fonte / janela |
|---|---|---|
| `get_portfolio_metrics(portfolio)` | "Qual o risco da carteira X?" | PortfolioEntry, janela da sessão |
| `filter_portfolios_by_risk(level)` | "Carteiras podres / saudáveis?" | idem |
| `filter_portfolios_by_value(min, limit?)` | "Onde está o dinheiro?" | idem |
| `compare_portfolios(names, metric?)` | "X vs Y?" | idem |
| `explain_business_rule(rule)` | "Por que MAX e não soma?" | texto canônico em `tools.py` |
| `get_agent_performance(nome)` | "Como está o agente Y?" | AgentEntry, janela da sessão |
| `list_agents_performance(order_by?, limit?)` | "Top performers? Maior ticket? Quem gera exceção?" | idem; 12 métricas de ordenação |
| `get_ritmo_acordos_dia()` | "Vamos bater a meta hoje?" | rota KNN `/ritmo-dia` — **sempre o dia corrente** |
| `get_time_series(metric, period, portfolio?)` | "Tendência / degradação?" | rollup diário, 7/30/90d até a data de referência |
| `get_acordo_status_breakdown()` | "Quanto pendente / rejeitado?" | rollup da sessão, rotulado por status |
| `get_fase_negociacao(fase?)` | "Final de plano? Quitados?" | acordos aprovados últimos ~6 meses |
| `get_efetividade_conversao(visao, agente?)` | "Boletos estão sendo pagos?" | ETL de efetividade (base 2026+) |
| `get_cruzamento_agente_carteira(portfolio \| agente)` | "Quem gera as exceções da carteira X?" | SQL agente × carteira × status, janela da sessão |
| `get_ranking_agentes_por_dimensao(dim, limit?)` | "Quem quebra mais?" | SQL por agente, dimensão de status |
| `get_maiores_acordos(tipo, portfolio, limit?)` | "Casos concretos da carteira X" | builders de detalhe do dashboard (CPF mascarado) |

Decisões transversais:

- **Dispatch valida, provider executa.** Enums, clamps de `limit`, XOR do
  cruzamento e resolução de nomes parciais → canônicos (via entries /
  get_agents) acontecem em `dispatch_tool`; SQL/ETL ficam nos módulos de
  domínio.
- **Lazy por construção.** O dataset de carteiras é eager (quase toda
  pergunta usa); agentes e as 8 tools com provider próprio só executam query
  se chamadas. O ritmo importa joblib/numpy sob demanda.
- **Erro nunca derruba o chat.** Tool indisponível, carteira/agente não
  encontrado, ETL não carregado, falha do KNN → error dict no tool_result; o
  modelo explica e degrada `confidence`.
- **Payload limitado.** Séries preenchem dias vazios com 0 mas cortam por
  período; cruzamento ≤ 20 contrapartes; detalhe ≤ 20 acordos; conversão
  por agente ≤ 15; ranking ≤ 50.

## 4. Semântica de janelas (importante)

| Tool | Janela |
|---|---|
| Carteiras, agentes, breakdown, cruzamento, ranking, maiores acordos | `[dateFrom, dateTo]` da sessão |
| `get_time_series` | últimos N dias **terminando em dateTo** |
| `get_fase_negociacao` | acordos **emitidos nos últimos ~183 dias** até dateTo (base viva, independe da sessão) |
| `get_ritmo_acordos_dia` | **hoje**, sempre (KNN é intradiário) |
| `get_efetividade_conversao` | base completa do ETL (2026+), trim 12m/30d/3m |

## 5. Regras de negócio herdadas (invioláveis)

Todas as queries das tools aplicam: `PARCELA = 0`, `NOLOCK`,
`FILTRO_AGENTES_EXCLUIDOS_SQL` (no SQL, nunca pós-processamento — ADR-005),
CROSS APPLY TOP 1 para portfólio (ADR-004), janela
`DT_EMISSAO >= @Hoje AND < @Amanha` via `wrap_todos_or_single`
(`todos` = UNION ALL dos dois bancos com agregação externa).

Conversão oficial: boleto de 1ª parcela pago em ≤ 5 dias do vencimento /
boleto emitido. A `conversao_pct` do AgentEntry no grão de 1 dia tende a 0%
(boleto de hoje não venceu) — o prompt direciona "boletos estão sendo pagos?"
para `get_efetividade_conversao`.

Fase de plano (premissa documentada, ajustável): progresso de pagamento por
acordo (`VR_PAGO > 0` = parcela paga) → `quitado` (tudo pago), `inicio`
(≤ 1 paga), `final` (≤ 2 restantes), `meio` (demais).

## 6. Contrato de resposta (AgentResponse)

O modelo responde **somente** um JSON:

```json
{
  "text": "markdown com **negrito** em números e carteiras",
  "highlights": [{ "type": "anomaly|metric|portfolio", "label": "...", "value": "..." }],
  "suggested_actions": [{ "label": "...", "prompt": "..." }],
  "data_sources": ["tools usadas"],
  "confidence": "high|medium|low"
}
```

`_parse_agent_final_text` tolera cercas ```json e texto em volta;
`_normalize_agent_response` garante o contrato (tipos inválidos viram
default, `confidence` desconhecida vira `low`). A rota embrulha em
`build_response_envelope` com `data[0] = AgentResponse` e
`data_referencia = dateTo`.

## 7. Configuração

| Variável | Padrão | Efeito |
|---|---|---|
| `ENABLE_AGENT_CHAT` | `false` | `false` → rota responde 404 |
| `AGENT_PROVIDER` | `anthropic` | `anthropic` \| `deepseek` |
| `AGENT_MODEL` | `claude-sonnet-4-6` / `deepseek-chat` | modelo do provedor ativo |
| `ANTHROPIC_API_KEY` / `DEEPSEEK_API_KEY` | — | ausente → 503 com instrução |
| `AGENT_MAX_TOOL_ITERS` | `4` | iterações do loop (cada uma pode ter várias tools em paralelo) |
| `DASHBOARD_CACHE_TTL` | `60` | TTL dos datasets das tools |

SDKs (`anthropic`, `openai`) importados sob demanda: a API sobe sem eles e a
rota responde 503 com a instrução de instalação.

## 8. Cache

`cache_manager.get_or_compute` (TTL `DASHBOARD_CACHE_TTL`, process-local).
Chaves por tool incluem db + janela + parâmetros:

```text
agente|rollup-rows|{db}|{from}|{to}          ← compartilhada por entries e breakdown
agente|agent-entries|{db}|{from}|{to}
agente|daily-rollup|{db}|{from}|{to}|{portfolio|*}
agente|fases|{db}|{from}|{to}
agente|cruzamento|{db}|{from}|{to}|{filtro}|{valor}
agente|ranking-status|{db}|{from}|{to}|{dimensao}
agente|maiores-acordos|{db}|{from}|{to}|{tipo}|{portfolio}
```

Conversão não tem cache próprio: lê o store do ETL de efetividade (refresh
em background). Ritmo usa o cache interno da rota KNN (30 s).

## 9. Privacidade e limites

- CPF sempre mascarado **no SQL** (3 primeiros + 2 últimos dígitos) — mesma
  exposição da UI de detalhe.
- Agentes de sistema/suporte excluídos no SQL; o prompt instrui a responder
  "excluído dos relatórios" se perguntado.
- Histórico limitado (20 mensagens × 4000 chars) para conter custo.
- `max_tokens=2048` por resposta do modelo.

## 10. Telemetria e erros

- Falha do provedor → `_agent_ndjson("agent_api_error")` + HTTP 502 genérico.
- Toda query roda com `run_id` propagado (rastreável no NDJSON de telemetria,
  `ENABLE_AGENT_TELEMETRY`).
- Resposta fora do contrato **não** gera erro: degrada para `confidence: low`
  com o texto cru.

## 11. Testes

```cmd
.venv\Scripts\python -m pytest tests\test_agente.py -q
```

`tests/test_agente.py` (40 testes, sem rede e sem banco):

- funções puras: agregação de PortfolioEntry/AgentEntry, série temporal
  (preenchimento de dias, risco diário, tendência), breakdown, fases,
  trims de conversão, cruzamento, ordenação de maiores acordos;
- dispatch: validação de enums, clamps, XOR, resolução de nomes, providers
  ausentes degradando para erro;
- loop completo com SDKs stubados (Anthropic e DeepSeek) e SQL mockado.

## 12. Limitações conhecidas

- `get_efetividade_conversao` exige o ETL de efetividade carregado no
  processo (background, base 2026+); antes disso responde "ETL ainda não
  concluído".
- Sem série temporal **por agente** (custo da query de produtividade × N
  dias não compensa).
- Sem metas de negócio no banco — o esperado do KNN faz papel de meta
  implícita no ritmo.
- `AGENT_MAX_TOOL_ITERS=4`: análises muito cruzadas podem esbarrar no teto;
  monitorar telemetria antes de aumentar.
- Fase de plano é derivada (premissa §5) — validar régua com o negócio.
