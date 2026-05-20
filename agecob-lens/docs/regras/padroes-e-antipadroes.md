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
    SELECT TOP 1 DA.CAMPO010
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_AUX DA (NOLOCK) ON DA.ID_DIVIDA = RD.ID_DIVIDA
    WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
) CA
```

### ❌ JOIN direto em tabela 1:N

```sql
-- ERRADO: multiplica linhas quando acordo cobre múltiplas dívidas
JOIN REC_DIVIDAS RD ON RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
JOIN DIV_AUX DA ON DA.ID_DIVIDA = RD.ID_DIVIDA
```

---

### ✅ Filtro de agentes no SQL (antes da agregação)

```sql
WHERE U.NOME NOT IN ('COBDESANTOS', 'NEMBUSUSER')
  AND U.NOME NOT LIKE 'ANTLIA%'
  AND U.NOME NOT LIKE 'INTERNA%'
  AND U.CHAVE NOT LIKE 'suporte%'
  AND U.CHAVE NOT LIKE 'SISTEMA%'
```

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

- TTL padrão: 60 segundos
- Auto-refresh do frontend: 2 minutos
- Bypass: `?force_refresh=true`
- `cache_age_seconds` no response para transparência

### ❌ Cache sem bypass

Sem `force_refresh`, o operador não tem como forçar dados frescos após uma ação no COBweb.

---

## Arquitetura de Query

### ✅ Builder function com flag de comportamento

```python
def _build_produtividade_query(db: str, *, use_distinct_esforco: bool) -> str:
```

Uma única função, dois comportamentos controlados por flag explícito.

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
