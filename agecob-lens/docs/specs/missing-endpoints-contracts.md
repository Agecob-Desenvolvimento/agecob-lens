# Missing Endpoint Contracts (Query Placeholder Mode)

This document lists required endpoints and payload contracts for pending analytics blocks.
SQL/query bodies are intentionally left blank as placeholders until business finalizes them.

## 1) Productivity Distribution Dataset

- **Endpoint**: `GET /dashboard/produtividade-distribuicao/{database_name}`
- **Purpose**: Feed "Dispersão da Produtividade" with distribution by ranges/time.
- **Query Placeholder**: `TODO: BUSINESS_QUERY_REQUIRED`

### Query Params
- `start_date` (optional, `YYYY-MM-DD`)
- `end_date` (optional, `YYYY-MM-DD`)
- `assessoria` (optional)
- `interval` (optional: `day|week|month`)

### Response Contract
```json
{
  "meta": {
    "generated_at": "ISO-8601",
    "total_rows": 0,
    "sources": ["COBwebRCBAUTOS"],
    "filters": {
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "assessoria": "string",
      "interval": "day"
    }
  },
  "data": [
    {
      "range_label": "0-10",
      "agent_count": 0,
      "qtd_acionamentos": 0,
      "qtd_contatos": 0,
      "qtd_acordos": 0
    }
  ],
  "errors": []
}
```

## 2) Productivity History (28 months + 15 days)

- **Endpoint**: `GET /dashboard/produtividade-historico/{database_name}`
- **Purpose**: Historical trend support for `AnaliseProdutividade`.
- **Query Placeholder**: `TODO: BUSINESS_QUERY_REQUIRED`

### Query Params
- `start_date` (required for historical mode)
- `end_date` (required for historical mode)
- `assessoria` (optional)
- `office` (optional)

### Response Contract
```json
{
  "meta": {
    "generated_at": "ISO-8601",
    "total_rows": 0,
    "sources": ["COBwebRCBCONSUMER"],
    "filters": {
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "assessoria": "string",
      "office": "string"
    }
  },
  "data": [
    {
      "period": "YYYY-MM",
      "office": "string",
      "qtd_acionamentos": 0,
      "qtd_contatos": 0,
      "cpc_percentual": 0.0,
      "qtd_acordos": 0,
      "valor_acordos": 0.0
    }
  ],
  "errors": []
}
```

## 3) Agent Detail Dimensions

- **Endpoint**: `GET /dashboard/agente-detalhes/{database_name}`
- **Purpose**: Supply detailed agent panel blocks without time metrics.
- **Query Placeholder**: `TODO: BUSINESS_QUERY_REQUIRED`

### Query Params
- `assessoria` (optional)
- `agent_key` (optional)
- `start_date` (optional)
- `end_date` (optional)

### Response Contract
```json
{
  "meta": {
    "generated_at": "ISO-8601",
    "total_rows": 0,
    "sources": ["COBwebRCBCONSUMER"],
    "filters": {
      "assessoria": "string",
      "agent_key": "string",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD"
    }
  },
  "data": [
    {
      "agent_key": "string",
      "agent_name": "string",
      "qtd_acionamentos": 0,
      "qtd_contatos": 0,
      "qtd_acordos": 0,
      "valor_acordos": 0.0,
      "acordos_percentual": 0.0
    }
  ],
  "errors": []
}
```
