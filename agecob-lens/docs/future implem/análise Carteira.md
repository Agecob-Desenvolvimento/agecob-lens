# Pipeline — Portfolio Analysis (Análise de Carteira)

**Status:** Phase 1 defined. Future phases outlined.
**Type:** New page — `src/pages/AnaliseCarteira.tsx`
**Document:** Standalone (not part of Operational Analysis pipeline).

---

## 1. Context

Unlike the same-day dashboard (`Index.tsx`, window = today) and Operational Analysis (time-series over weeks/months), Portfolio Analysis operates on the **current stock** of agreements. It answers: "Is our active portfolio healthy?"

No date filter. Snapshot of present state.

---

## 2. Phase 1 — Agreement Effectiveness by Agent

### 2.1 Metric

| KPI | Definition | Source |
|---|---|---|
| `qtd_ativos` | COUNT agreements WHERE `ID_REC_STATUS = 1` | `REC_MASTER` |
| `qtd_honrados` | COUNT ativos WHERE payment date exists | `REC_MASTER` + `REC_PAGAMENTOS` |
| `qtd_quebrados` | COUNT WHERE `ID_REC_STATUS IN (2, 10)` | `REC_MASTER` |
| `efetividade` | `honrados / ativos * 100` | derived |

Status reference:
- `1` = ATIVO (active, awaiting payment)
- `2` = QUEBRA (broken — client didn't pay)
- `10` = QUEBRA AUTOMÁTICA (system-cancelled, grace period expired)

### 2.2 Query

```sql
SELECT
    U.NOME AS agente,
    COUNT(DISTINCT CASE WHEN R.ID_REC_STATUS = 1 THEN R.NR_RECEBIMENTO END) AS qtd_ativos,
    COUNT(DISTINCT CASE WHEN R.ID_REC_STATUS = 1 AND P.DATA_PAGAMENTO IS NOT NULL THEN R.NR_RECEBIMENTO END) AS qtd_honrados,
    COUNT(DISTINCT CASE WHEN R.ID_REC_STATUS IN (2, 10) THEN R.NR_RECEBIMENTO END) AS qtd_quebrados,
    ISNULL(SUM(DISTINCT CASE WHEN R.ID_REC_STATUS = 1 AND P.DATA_PAGAMENTO IS NOT NULL THEN R.VALOR END), 0) AS valor_honrados,
    ISNULL(SUM(DISTINCT CASE WHEN R.ID_REC_STATUS IN (2, 10) THEN R.VALOR END), 0) AS valor_quebrados,
    ISNULL(
        COUNT(DISTINCT CASE WHEN R.ID_REC_STATUS = 1 AND P.DATA_PAGAMENTO IS NOT NULL THEN R.NR_RECEBIMENTO END) * 100.0 /
        NULLIF(COUNT(DISTINCT CASE WHEN R.ID_REC_STATUS = 1 THEN R.NR_RECEBIMENTO END), 0), 0
    ) AS efetividade_percentual
FROM {DB}..REC_MASTER R (NOLOCK)
JOIN {DB}..USU_MASTER U (NOLOCK) ON U.CHAVE = R.ID_USUARIO
LEFT JOIN {DB}..REC_PAGAMENTOS P (NOLOCK) ON P.NR_RECEBIMENTO = R.NR_RECEBIMENTO
WHERE R.ID_REC_STATUS IN (1, 2, 10)
  AND U.CHAVE NOT IN ('COBDESANTOS', 'NEMBUSUSER')
  AND U.CHAVE NOT LIKE 'ANTLIA%'
  AND U.CHAVE NOT LIKE 'INTERNA%'
GROUP BY U.NOME
ORDER BY efetividade_percentual DESC
Note: REC_PAGAMENTOS table name pending validation. Adjust if actual name differs.

2.3 Endpoint
text
GET /dashboard/efetividade-acordos/{db}
Response contract:

json
{
  "meta": {
    "generated_at": "ISO-8601",
    "total_rows": 0,
    "sources": ["REC_MASTER", "REC_PAGAMENTOS", "USU_MASTER"]
  },
  "data": [
    {
      "agente": "string",
      "qtd_ativos": 0,
      "qtd_honrados": 0,
      "qtd_quebrados": 0,
      "valor_honrados": 0.0,
      "valor_quebrados": 0.0,
      "efetividade_percentual": 0.0
    }
  ]
}
2.4 UI
Component: EfetividadeAcordosPanel.tsx

Element	Spec
Chart type	Horizontal BarChart (Recharts)
Y axis	Agent names, sorted by effectiveness descending
X axis	efetividade_percentual (0–100%)
Color	Green ≥ 80%, amber 60–79%, red < 60%
Supplementary	Table below chart with all columns
Highlight	Agents with effectiveness < 60% flagged
Page layout:

text
+--------------------------------------------------+
| Header: "Análise de Carteira" + SidebarTrigger   |
+--------------------------------------------------+
| Database selector: [All / AUTOS / CONSUMER]      |
+--------------------------------------------------+
| Section: Efetividade dos Acordos                 |
|   Bar chart (horizontal, by agent)               |
|   Data table (full breakdown)                    |
+--------------------------------------------------+
| (Future sections — placeholder)                  |
+--------------------------------------------------+
3. Pipeline (No Fact Table Required)
text
REC_MASTER + REC_PAGAMENTOS + USU_MASTER
        │
        ▼
  FastAPI endpoint (direct query, no aggregation job)
        │
        ▼
  React component (EfetividadeAcordosPanel)
No fact table needed — snapshot query is lightweight (current state only, no date range scan).

4. Future Phases (Outline)
Phase	Analysis	Question
2	Portfolio concentration	"Which portfolio holds most active agreements?"
3	Aging	"How old are active agreements?"
4	At-risk agreements	"Which active agreements haven't paid any installment yet?"
5	Breakage by cohort	"Which issuance month had the most breakages?"
6	Value distribution	"What's the value profile of active agreements?"
5. Dependencies
Validate REC_PAGAMENTOS table name in both databases.

Add route in App.tsx: /analise-carteira → AnaliseCarteira.tsx.

Add sidebar entry in AppSidebar.tsx: "Análise de Carteira".

Implement endpoint in main.py.

Build EfetividadeAcordosPanel.tsx component.

6. References
id_rec_status.txt — agreement status codes.

pipeline-analise-operacional_v2.md — sibling pipeline (Operational Analysis).

main.py — existing backend; exclusion rules and DB connection pattern.