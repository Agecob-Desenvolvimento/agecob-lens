# HANDOFF PT4 — Correção dos 11 achados do code review (Opus 5)

**Autor:** Claude Sonnet (mesma sessão que fechou pt3, encomendou o review) · **Data:** 2026-08-20 · **Base:** [`agente-tools-handoff.md`](agente-tools-handoff.md) (pt1) + [`agente-tools-handoff-pt2.md`](pt2) + [`agente-tools-handoff-pt3.md`](pt3) + review de code review (Opus 5) sobre `git diff HEAD` (working tree, nada commitado) fechado após pt3. **Regra do escopo:** este documento assume que quem lê já leu pt1–pt3 inteiros. Não repete D1–D10 nem o que pt2/pt3 já resolveram — só os 11 achados do review, agrupados por causa raiz, e como provar que cada um foi corrigido.

**Role do implementador:** Engenheiro de Software Sênior Backend, papel de **corretor de bug de correção de dado** — não greenfield, não redesenho. Regra dura: nenhum finding é "corrigido" só porque a suíte de 197 testes continua verde. Essa suíte **não exercita** a classe de bug do Cluster A (mesma chave, duas linhas, dedup escolhendo a errada) — ela não vai detectar regressão nem confirmar fix. Cada fix do Cluster A exige um teste novo que reproduz o cenário exato (fixture com 2 linhas mesma chave, uma dentro e outra fora da condição que quebra) — sem esse teste, o finding continua aberto, mesmo que o código "pareça" corrigido.

**Verificação prévia nesta sessão:** dos 11, **#1 e #4 foram lidos e confirmados linha a linha** contra o código real (mecanismo bate exato com o relatado — ver §1). Os outros 9 vêm do relatório do reviewer, não foram reabertos por esta sessão. Confirme cada um antes de tocar — mesma regra de sempre (pt1 §11, pt2 §4, pt3 §1): não fixar em cima de um relato sem checar o código primeiro.

**Achado extra desta sessão, não estava na lista do reviewer:** o mesmo padrão do #4 (status filtrado depois de `rn=1`) aparece uma **terceira vez** no mesmo arquivo — `CTE_Boletos` em [`produtividade/queries.py:389-406`](../../../dominios/produtividade/queries.py), poucas linhas abaixo de `CTE_Acordos_Unicos`. Mesmo mecanismo, mesmo arquivo, não reportado. Tratar como parte do Cluster A.

---

## Cluster A — Perda silenciosa de dado por dedup mal escopado (maior severidade, corrigir junto)

Causa raiz comum: `ROW_NUMBER() OVER (PARTITION BY chave ORDER BY DT_EMISSAO DESC)` roda **sem filtro de data ou status dentro do particionamento**, e o filtro de negócio (janela de data, status) é aplicado **depois** de `rn = 1` já ter escolhido a linha vencedora. Se a linha vencedora (mais recente) não passa no filtro externo, o grupo inteiro desaparece — mesmo que uma linha mais antiga do mesmo grupo passasse.

| # | Local | Mecanismo | Confirmado? |
|---|---|---|---|
| 1 | [`graficos/queries.py:5-19`](../../../dominios/graficos/queries.py) `_rec_master_dedup` | Sem filtro de data/status dentro. Docstring chama de "o" helper de dedup, mas outros arquivos reimplementam a lógica inline em vez de chamar esta função — 3+ variações inconsistentes no mesmo diff. | ✅ Sim, lido nesta sessão |
| 4a | [`produtividade/queries.py:339-349`](../../../dominios/produtividade/queries.py) `CTE_Acordos_Unicos` | `WHERE R.ID_REC_STATUS IN STATUS_UNIVERSO_SQL AND R.rn = 1` — status filtrado depois do rank. Acordo reescrito no mesmo dia com status 7 (REJEITADO, fora do universo) vence o rank, é cortado pelo filtro; a linha anterior com status válido nunca chega a ser avaliada (já ficou em rn=2). | ✅ Sim, lido nesta sessão |
| 4b | [`produtividade/queries.py:389-406`](../../../dominios/produtividade/queries.py) `CTE_Boletos` | Mesmíssimo padrão do 4a, mesmo arquivo, ~40 linhas abaixo. Não estava na lista do reviewer. | ✅ Sim, achado nesta sessão |
| 6 | [`graficos/queries.py:689`](../../../dominios/graficos/queries.py) `build_real_por_portfolio_query` | Filtra por `DT_PAGAMENTO` mas dedupa por `DT_EMISSAO DESC` — pagamento numa versão mais antiga do registro é descartado. Meta vs Real subestima caixa recebido. | ⚠️ Reportado, não reaberto nesta sessão |
| 7 | [`produtividade/queries.py:194`](../../../dominios/produtividade/queries.py) `CTE_Contratos_Agente` | Base do card "Qtd Acordos" da Home — **não** dedupada, enquanto `CTE_Acordos` (usada pro resto, inclusive ticket médio) é. Card e ticket médio divergem por causa raiz diferente do dedup em si, mas do mesmo desalinhamento de tratamento entre CTEs irmãs. | ⚠️ Reportado, não reaberto nesta sessão |
| 8-corr | [`acordos/queries.py:290`](../../../dominios/acordos/queries.py) `qtd_reprovados` | Não dedupado, enquanto os campos irmãos AC/EX no mesmo SELECT são. Mesma linha de output mistura as duas regras. | ⚠️ Reportado, não reaberto nesta sessão |
| — | (não é finding numerado, é consequência do #1) | `_rec_master_dedup` sem filtro dentro bloqueia predicate pushdown (`DT_EMISSAO` está no `ORDER BY` da window function, não no `PARTITION BY` nem filtrado antes) → `ROW_NUMBER()` roda sobre a tabela inteira em toda query Home/portfólio que usa este helper, mais uma subquery correlacionada de `valor_total` sobre esse mesmo ranking não filtrado, por linha de saída. Sem `SHOWPLAN` disponível pra confirmar o plano real (ambiente sem essa permissão — ver memória `env_sqlserver_perm_limits`), mas corrigir #1 resolve isso de qualquer forma. | Não verificável sem acesso a plano de execução — medir com `STATISTICS IO`/tempo de execução antes e depois do fix, não com `SHOWPLAN`. |

**Direção de fix sugerida (não é decisão fechada — proponha e confirme antes de aplicar em massa):** consolidar em um único `_rec_master_dedup` que aceita o filtro de negócio (data e/ou status) como parâmetro aplicado **dentro** do escopo antes do `ROW_NUMBER()`, e substituir as reimplementações inline (`produtividade/queries.py` tem pelo menos duas, `acordos/queries.py` e `graficos/queries.py:689` têm a própria) por chamadas a essa função única. Isso é uma refatoração real, não um one-liner por arquivo — avalie se compensa fazer tudo de uma vez ou por endpoint, mas não deixe uma 4ª variante inconsistente nascer no meio do fix.

**Prova de correção exigida:** para cada item do Cluster A, escrever um teste (ou fixture SQL, se o ambiente permitir contra banco de teste) com duas linhas de mesma chave (`NR_RECEBIMENTO`/`ID_CARTEIRA`/`PARCELA`), uma com o valor que deveria aparecer no resultado e outra que "vence" o rank mas cai fora do filtro de negócio — e confirmar que a linha certa aparece no resultado final, não zero linhas.

---

## Cluster B — Runtime do agente (`guards.py`/`agente.py`)

| # | Local | Mecanismo | Prioridade |
|---|---|---|---|
| 3 | [`agente.py:367`](../../../dominios/agente/agente.py) força-final | **Regressão do próprio fix desta sessão** (pt3 §1). No branch de força-final, `messages.create` é chamado sem `tools=` enquanto `convo` ainda tem blocos `tool_use`/`tool_result` de rodadas anteriores — e o `_FORCE_FINAL_NUDGE` é anexado como `{"role":"user",...}` logo depois de um `{"role":"user","content": tool_results}` já anexado no fim da rodada anterior → **duas mensagens `user` consecutivas**, que a API da Anthropic rejeita (alternância estrita de role). O teste de regressão do pt3 usa client fake que não impõe essa restrição, por isso passou. Isso quebra exatamente no cenário que o fix existe para cobrir — quando o guard força final depois de pelo menos uma rodada de tool. | **Alta — corrigir primeiro no Cluster B.** É regressão nova nesta sessão, não bug antigo. |
| 5 | [`guards.py:282`](../../../dominios/agente/guards.py) | Falha de `run_fn()` nunca é gravada em `_call_cache`. Retry com args idênticos (mesmo hash) cai no branch de memoização e devolve `{"resultado_memoizado": null, "nota": "use este resultado"}` — o contrato de erro estruturado (§4.1 do pt1) se perde, e o modelo é instruído a confiar num `null`. | Alta — comportamento observável errado pro LLM |
| 9 | [`guards.py:304`](../../../dominios/agente/guards.py) retry | Captura `Exception` genérica — um erro determinístico (`ValueError`/`KeyError` de bug de código, não falha transiente) é re-executado do mesmo jeito ~1s depois, reportado como `upstream_5xx` (taxonomia errada) e come tempo de wall clock à toa. | Média |
| 10 | [`guards.py:75`](../../../dominios/agente/guards.py) `_previa` | Cap por `cap_tokens * 4` caracteres não corresponde ao cap real de tokens (tokenização real não é 4 char/token constante, varia por conteúdo — números/pontuação/PT-BR acentuado tokenizam diferente de inglês). Resultado "capado" ainda pode passar de 1800 tokens de verdade. | Média |
| 2 | [`guards.py:56-58,289`](../../../dominios/agente/guards.py) `_cache_key`/`tool_cache` | `_cache_key(tool_name, db, args)` = `sha1(tool\|db\|args)`, cache **entre requests**. Os 11 tools legados (herdados de antes do P1) não carregam data nos args — o período vem do estado da closure/sessão, não do payload da tool call. Sessão A filtrando julho pode servir número de julho pra sessão B filtrando agosto, por até 60s (TTL do cache de sucesso). **Não é gap novo — é regressão contra contrato já documentado:** [`docs/agente-chat-rag.md:177-188`](../../../docs/agente-chat-rag.md) especifica que toda chave de cache da camada de baixo (`cache_manager.get_or_compute`) inclui `{db}\|{from}\|{to}`; o `ToolCache` novo do guards.py fica **acima** dessa camada e derruba `{from}\|{to}` da própria chave, então um cache corretamente escopado (o de baixo) fica escondido atrás de um mal escopado (o de cima). **Fix confirmado:** `db` já chega em `_cache_key` como parâmetro explícito, passado por fora dos `args` porque as tools antigas não o carregam sozinhas ([`agente.py:203-215`](../../../dominios/agente/agente.py) `_tool_result_json`, docstring linha 213-215 explica exatamente esse motivo) — replicar o mesmo mecanismo pra `date_from`/`date_to`: acrescentar o parâmetro à assinatura de `_cache_key`/`dispatch`/`_tool_result_json` e passar a janela da sessão, do mesmo jeito que `db` já é passado hoje. | Alta — dado errado pra usuário diferente, não só perf |

---

## Cluster C — Segurança (item isolado, escopo pequeno)

| # | Local | Mecanismo | Prioridade |
|---|---|---|---|
| 8-sec | [`system_prompt.md:147`](../../../dominios/agente/system_prompt.md) | Prompt promete que texto livre chega embrulhado em `<dados>…</dados>` (pt1 §5, D-regra de segurança). **Zero ocorrências no código** — nenhuma tool que retorna texto livre faz esse wrapping. Texto livre chega sem marcação e o modelo é instruído a tratar `<dados>` como fronteira de confiança que nunca existe na prática — **pior que não prometer nada**, porque cria falsa sensação de defesa. GS-016 (golden set, injeção) não pega isso porque roda em modo offline com resposta final scriptada (pt2 §3) — não exercita o caminho real de wrapping. | **Alta.** Ou implementa o wrapping de verdade nas tools que retornam texto livre (`CTO_AGENDA.TEXTO`, `CTO_COMPLEMENTO.DESCR`, `NOME_RAZAO` — pt1 §5), ou remove a promessa do `system_prompt.md` até implementar, pra não mentir sobre a superfície de defesa. |

---

## Cluster D — Doc stale envenenando o grafo (baixa prioridade, escopo trivial)

| # | Local | Mecanismo | Prioridade |
|---|---|---|---|
| doc | [`docs/agente-chat-rag.md`](../../../docs/agente-chat-rag.md) | Documenta as 4 tools retiradas em D10 (`get_time_series`, `get_efetividade_conversao`, `get_maiores_acordos`, `explain_business_rule`) em 8 lugares — tabela de tools, tabela de janela (§4), roteamento "Conversão oficial" (§5), chave de cache de `maiores-acordos`. Arquivo não está no diff desta sessão (não foi tocado) e não é lido em runtime — confirmado: `agente.py` só lê `system_prompt.md`, não este arquivo, então zero impacto em produção apesar do nome. **Mas** é ingerido pelo `graphify-out/` (existe no repo, confirmado), e o node "As 15 Tools do Agente" no grafo passa a descrever as 15 erradas. `CLAUDE.md` deste projeto manda toda sessão ler o grafo antes de arquivo bruto — então uma sessão futura que confiar no grafo (em vez de ler `tools.py` direto) herda a lista errada. É exatamente a classe de falha que este handoff inteiro existe pra matar (D2: hierarquia de verdade código → prosa → agente; doc desalinhado do código é o que gerou as 7 divergências do pt1 e as 10 do pt2). | Baixa impacto direto, mas resolve rápido: atualizar os 8 pontos pras 4 tools novas (`query_kpi_historico`, `comparar_agentes`, `detalhar_portfolio`, `explicar_metrica`), depois rodar `graphify update .` pra o node parar de mentir. |

---

## Ordem sugerida (não é obrigatória, é a leitura de risco desta sessão)

1. **Cluster A** — dado financeiro real, maior blast radius, silencioso (ninguém percebe sem procurar).
2. **#3** — regressão nova desta sessão, no caminho crítico do próprio RunGuard.
3. **#2, #5** — dado errado servido pro usuário (cache cross-request, contrato de erro perdido).
4. **#8-sec** — falsa promessa de segurança, escopo pequeno, resolve rápido.
5. **#9, #10** — comportamento subótimo, não corrompe dado nem quebra segurança.
6. **Cluster D** — cosmético/grafo, zero impacto em produção, faz por último ou junto com qualquer outra atualização de doc.

Depois de cada cluster: rodar `python -m pytest tests/ -q`, confirmar não regrediu os 197 (ou o número corrente), e reportar contagem antes/depois. Não commitar sem pedir — mesmo estado de pt1–pt3, nada foi commitado ainda.
