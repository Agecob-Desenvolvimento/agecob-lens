---
title: Agecob — Padrões e Anti-Padrões
tags: [agecob, backend, sql, padroes]
created: 2026-04-27
updated: 2026-04-27
---

# Padrões e Anti-Padrões — agecob-lens

Lições aprendidas em produção. Cada item tem o padrão correto e o anti-padrão que ele substitui.

---

## SQL

### ✅ CTE separada → join de agregados

```sql
-- CORRETO: agregar cada tabela em CTE separada, depois join
WITH CTE_Esforco AS (
    SELECT agente, COUNT(*) AS acionamentos
    FROM CTO_MASTER ...
    GROUP BY agente
),
CTE_Acordos AS (
    SELECT agente, COUNT(DISTINCT NR_RECEBIMENTO) AS acordos
    FROM REC_MASTER ...
    GROUP BY agente
)
SELECT E.agente, E.acionamentos, A.acordos
FROM CTE_Esforco E
LEFT JOIN CTE_Acordos A ON E.agente = A.agente
```

### ❌ Join direto linha × linha

```sql
-- ERRADO: produto cartesiano implícito → 81s em 6 meses de dados
SELECT agente, COUNT(DISTINCT C.ID_CTO_MASTER), COUNT(DISTINCT R.NR_RECEBIMENTO)
FROM CTO_MASTER C
JOIN REC_MASTER R ON C.agente = R.agente AND C.DATA = R.DT_EMISSAO
GROUP BY agente
```

**Degradação medida:** 81s → 1s ao trocar para CTEs separadas.

---

### ✅ CROSS APPLY TOP 1 para 1:N controlado

```sql
-- CORRETO: pega um único portfólio por acordo
CROSS APPLY (
    SELECT TOP 1 DA2.CAMPO010
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
    WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
      AND RD.ID_CARTEIRA = R.ID_CARTEIRA
      AND DA2.CAMPO010 IS NOT NULL
) DA
```

Duas cláusulas não são opcionais (`dominios/graficos/queries.py:118-125`):

- **`AND RD.ID_CARTEIRA = R.ID_CARTEIRA`** — a chave real é composta
  (`NR_RECEBIMENTO` + `ID_CARTEIRA`). Só `NR_RECEBIMENTO` casa linhas de carteiras
  diferentes. Ver `config/settings.py:163-169` e o commit `0854587`.
- **`AND DA2.CAMPO010 IS NOT NULL`** — sem a guarda, o `TOP 1` pode trazer `NULL` e o
  acordo aparece com portfólio vazio. Atenção ao efeito colateral: como é `CROSS APPLY`
  (não `OUTER APPLY`), um acordo cujas dívidas tenham `CAMPO010` todo nulo é
  **descartado** da agregação em vez de virar linha com portfólio nulo.

### ❌ JOIN direto em tabela 1:N

```sql
-- ERRADO: multiplica linhas quando acordo cobre múltiplas dívidas
JOIN REC_DIVIDAS RD ON RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
JOIN DIV_AUX DA ON DA.ID_DIVIDA = RD.ID_DIVIDA
```

---

### ✅ Filtro de agentes no SQL (antes da agregação)

Não copie a lista à mão — use a constante. O valor real é
`FILTRO_AGENTES_EXCLUIDOS_SQL` (`config/settings.py:196-206`), com 9 cláusulas e todas
as comparações normalizadas por `UPPER(LTRIM(RTRIM(...)))`:

```sql
    AND UPPER(LTRIM(RTRIM(U.NOME)))  <> 'COBDESANTOS'
    AND UPPER(LTRIM(RTRIM(U.NOME)))  <> 'FT5SYSTEM'
    AND UPPER(LTRIM(RTRIM(U.NOME)))  <> 'NEMBUSUSER'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) <> 'NEMBUSUSER'
    AND UPPER(LTRIM(RTRIM(U.NOME)))  NOT LIKE 'ANTLIA%'
    AND UPPER(LTRIM(RTRIM(U.NOME)))  NOT LIKE 'INTERNA%'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'INTERNA%'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'SUPORTE%'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'SISTEMA%'
```

O snippet anterior deste doc omitia `FT5SYSTEM`, `U.CHAVE <> 'NEMBUSUSER'` e
`U.CHAVE NOT LIKE 'INTERNA%'`, e não normalizava caixa/espaços — copiá-lo readmitia
silenciosamente agentes de sistema nos números. Lembre que Efetividade usa outra lista
de propósito (`FILTRO_AGENTES_EFETIVIDADE_SQL`); ver `regras-de-negocio.md`.

### ❌ Filtro de agentes em Python (depois da query)

O filtro Python iterava o resultset inteiro uma segunda vez sem necessidade. Removido no refactor.

---

### ✅ CTE_Saldo_Original restrito ao dia

```sql
CTE_Saldo_Original AS (
    SELECT RD.NR_RECEBIMENTO, SUM(ISNULL(DM.VR_SALDO, 0)) AS VR_ORIGINAL
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_MASTER DM (NOLOCK) ON RD.ID_DIVIDA = DM.ID_DIVIDA
    WHERE RD.NR_RECEBIMENTO IN (
        SELECT NR_RECEBIMENTO FROM REC_MASTER (NOLOCK)
        WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
    )
    GROUP BY RD.NR_RECEBIMENTO
)
```

### ❌ CTE_Saldo_Original sem filtro de data

Agregava toda a história de dívidas para depois joinar com acordos do dia. Invisível em volume baixo; primeira coisa a quebrar em escala.

---

## Cache

### ✅ TTL curto + force_refresh

- TTL padrão: 60 segundos (`DASHBOARD_CACHE_TTL`, `config/settings.py:308`)
- Auto-refresh do frontend: 2 minutos
- Bypass: `?force_refresh=true` — **existe em um único endpoint**,
  `/dashboard/produtividade-agentes` (`api/routers/dashboard.py:621`)
- `cache_age_seconds` no response — idem, só nesse endpoint, servido pelo
  `ProdutividadeService` (`dominios/produtividade/servico.py:21-30`, `:86`), que tem
  cache próprio e não passa pelo `cache_manager`

> **Correção (2026-09-16).** O texto original apresentava `force_refresh` e
> `cache_age_seconds` como padrão geral do cache. Não são: o `cache_manager`
> (`core/cache/cache_manager.py`) não expõe bypass por query-string nem devolve idade
> do cache. Os demais endpoints só têm o TTL. O anti-padrão abaixo continua válido como
> princípio, mas descreve uma capacidade que hoje cobre um endpoint, não a API inteira.

### ❌ Cache sem bypass

Sem `force_refresh`, o operador não tem como forçar dados frescos após uma ação no COBweb.

---

## Arquitetura de Query

### ✅ Builder function com flag de comportamento

```python
def build_produtividade_query(
    db: str,
    *,
    use_distinct_esforco: bool,
    date_from: Optional[str] = None,
    date_to_exclusive: Optional[str] = None,
    portfolio: Optional[str] = None,
) -> str:
```

Uma única função, dois comportamentos controlados por flag explícito. A função é
pública (sem underscore) e vive em `dominios/produtividade/queries.py:14-21`, importada
por `dominios/produtividade/servico.py:12` e `dominios/agente/agentes.py:20`. Os três
parâmetros opcionais de janela/portfólio foram acrescentados depois do refactor
original.

### ❌ Duas constantes/funções paralelas para a mesma lógica

`QUERY_PRODUTIVIDADE_HOJE` e `QUERY_AGENTES_UNIFICADO_BASE` faziam a mesma coisa com diferenças sutis. Mudança de regra de negócio exigia atualizar dois lugares.

---

## Frontend

### ✅ Separar volume (count) e valor (BRL) em eixos/gráficos diferentes

Métricas com unidades diferentes nunca no mesmo eixo Y.

### ❌ Misturar count e BRL no mesmo gráfico

O gráfico "Distribuição de Produtividade" original misturava contagens e valores monetários — leitura ambígua.

---

### ✅ Trend line apenas em séries temporais contínuas

Linhas conectam pontos ao longo do tempo ou de uma dimensão contínua.

### ❌ Trend line em barras categóricas

Uma única linha de tendência sobre barras de agentes (dimensão categórica) não tem significado estatístico.

---

## Processo

### ✅ ADD-ONLY em prompts de implementação

Cada prompt adiciona funcionalidade nova. Refactors são prompts separados com checklist de consistência.

### ❌ Misturar adição + refactor no mesmo prompt

Risco de regressão sem code review. O agente pode "melhorar" algo que não deveria tocar.

---

### ✅ Validar no banco antes de escrever código

Confirmar schema, índices e distribuição de dados antes de qualquer implementação.

### ❌ Assumir schema e implementar direto

Schema do COBweb tem convenções não-óbvias (`PARCELA = 0`, `DIV_AUX.CAMPO010` para portfólio). Assumir = bug.

---

## Referências

- [[agecob-decisoes-tecnicas]] — ADRs que fundamentam esses padrões
- [[refactor_main_py_report]] — Onde vários desses padrões foram aplicados
- [[agecob-moc]] — Índice geral
