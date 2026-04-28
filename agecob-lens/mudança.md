## Problem
Colchão conversion shows 0% for recent months.  
Current query groups by `DT_EMISSAO`. Colchão boletos have future `DT_VENCIMENTO`, so no payments happened yet.  
We need both views: emission date and due date.

## Option B — Keep both views

Add new endpoints for colchão grouped by `DT_VENCIMENTO`.  
Dashboard will have a sub‑toggle to switch between them.

### New endpoints
GET /efetividade/diaria-colchao-vencimento
GET /efetividade/mensal-colchao-vencimento

**Rules:**
- Group by `CAST(DT_VENCIMENTO AS DATE)` (daily) or `YEAR(DT_VENCIMENTO), MONTH(DT_VENCIMENTO)` (monthly).
- Filter `YEAR(DT_VENCIMENTO) >= 2026`.
- Keep same 5‑day window: `DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO)`.
- Keep same rounding (`FLOOR(... + 0.5)`), status filter (`ID_REC_STATUS IN (1,3,12)`), and `PARCELA > 0`.
- Same response envelope (`meta`, `data`, `quality`).

### Frontend changes

- When user toggles **“Colchão”** in global filter, show a sub‑toggle: `Por Emissão` | `Por Vencimento`.
- Default: `Por Vencimento`.
- `Por Emissão` → use existing colchão endpoints (`/efetividade/diaria-colchao`, `/efetividade/mensal-colchao`).
- `Por Vencimento` → use new endpoints above.
- Agent ranking (`/efetividade/mensal-agente-colchao`) stays on emission logic for now (or apply same dual logic if desired).
- All sections (KPI, daily chart, monthly trend) update accordingly.

Follow existing dashboard patterns.  
Do NOT change primeira‑parcela endpoints or logic.