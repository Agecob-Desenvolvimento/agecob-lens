# Resumo do agente de chat — estado atual (2026-08-19)

Contexto pra outro agente planejar em cima. Fonte: `dominios/agente/agente.py`,
`dominios/agente/system_prompt.md`, `dominios/agente/tools.py`.

## Arquitetura

```
POST /agente/chat (messages, db, date_from, date_to)
  → run_agent()
      → build_portfolio_entries(db, date_from, date_to)   # dataset de carteiras (fixo por request)
      → system_prompt = system_prompt.md + contexto da sessão
      → loop tool-calling (Anthropic nativo OU DeepSeek/OpenAI-compat, via settings.AGENT_PROVIDER)
      → parse resposta final → JSON validado (contrato AgentResponse)
```

- Provedor trocável por env (`AGENT_PROVIDER`). Dois loops separados:
  `_loop_anthropic` (tools nativo) e `_loop_deepseek` (function calling OpenAI-like).
- SDKs importados sob demanda — API sobe mesmo sem pacote instalado (503 com instrução).
- Nunca propaga exceção de tool: cada provider em `_build_providers` engole erro e
  devolve `{"error": ...}` pro LLM decidir o que fazer.

## Dataset e tools

- `entries` = `build_portfolio_entries()` roda 1x por request, injetado no loop —
  é o dataset "base" (carteiras/risco) que várias tools reusam sem query nova.
- `get_agents()` = lazy, só roda se alguma tool pedir dado por agente.
- 8 tools registradas (`_build_providers`), cada uma closure lazy sobre
  `db/date_from/date_to/run_id` fixos da request: ritmo do dia (KNN), série temporal,
  breakdown de status, fase de negociação, conversão, cruzamento agente×carteira,
  ranking por dimensão, maiores acordos.
- `AGENT_TOOLS` (schema) + `dispatch_tool()` em `dominios/agente/tools.py` — não lido
  ainda, mas é o contrato de nomes/args que o LLM vê.

## Contexto de data (mexido nesta sessão)

- `system_prompt.md` tem placeholder `{{DATA_REFERENCIA}}` = `date_to` do filtro
  (fim do período selecionado pelo usuário) — é a "data dos dados", não hoje real.
- Fix aplicado: bloco "Contexto desta sessão" agora injeta `date.today()` (data real
  do sistema) explicitamente, separado do período filtrado. Prompt instrui o LLM a
  usar "hoje" = data real sempre, e data de referência só quando a pergunta for sobre
  o período filtrado. Antes disso as duas coisas se confundiam quando o usuário
  filtrava um período no passado e perguntava "hoje".

## Resposta final

- Contrato `AgentResponse` (JSON): texto + `data_referencia` (= `date_to`, não a data
  real — atenção se for expor "hoje" na resposta também).
- `_parse_agent_final_text` extrai JSON do texto final, com fallback se vier cercado
  de code fence ou com lixo ao redor.

## Coisas que ficaram de fora / possíveis próximos passos

- `dominios/agente/tools.py` (schema das tools) não foi lido nesta sessão — quem for
  mexer no que o agente pode fazer, começa por aí.
- `AgentResponse.data_referencia` ainda reporta `date_to` do filtro, não a data real —
  se o próximo trabalho for sobre "o agente confunde datas", pode valer alinhar esse
  campo também, não só o system prompt.
- Nenhum teste automatizado cobrindo o loop de tool-calling foi visto/rodado nesta
  sessão — validar manualmente perguntas com "hoje" + período passado selecionado.
