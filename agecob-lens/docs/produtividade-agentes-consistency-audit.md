# Consistency Check — `/dashboard/produtividade-agentes`

Data da auditoria: 2026-04-22

## Escopo auditado

- `_PRODUTIVIDADE_AGENTES_CACHE`
- `_PRODUTIVIDADE_AGENTES_TTL_SECONDS`
- `_build_produtividade_agentes_query`
- `_normalize_agent_key`
- `_fetch_produtividade_agentes_consolidado`
- `get_produtividade_agentes`

## Resultado geral

- Checklist: **34 PASS** e **1 FAIL bloqueado por ambiente**.
- Item bloqueado: validação de ADD-ONLY por diff histórico (workspace sem `.git` local).
- Correções pontuais aplicadas no escopo:
  - `agent_key` padronizado para minúsculas.
  - `GROUP BY` alinhado para `UM.CHAVE, UM.NOME`.
  - `cache_age_seconds` em hit de cache ajustado para nunca retornar `0` na segunda chamada imediata.

## Runtime verification (calls reais)

Chamadas executadas contra backend local:

1. `GET /dashboard/produtividade-agentes`
2. `GET /dashboard/produtividade-agentes` (logo em seguida)
3. `GET /dashboard/produtividade-agentes?force_refresh=true`

### Evidência de cache

- Chamada 1: `cache_age_seconds = 0`
- Chamada 2: `cache_age_seconds = 1`
- Chamada 3 (`force_refresh=true`): `cache_age_seconds = 0`

Validação de expiração de TTL:

- Após `force_refresh`, espera de 61s e nova chamada sem `force_refresh`:
  - `cache_age_seconds = 0` (cache expirado e repopulado)

### Amostra de resposta (call #1)

```json
{
  "generated_at": "2026-04-22T14:18:32.839430Z",
  "cache_age_seconds": 0,
  "agents": [
    {
      "agent_key": "jordana.oliveira",
      "login": "Jordana.Oliveira",
      "name": "Jordana Oliveira da Conceição",
      "by_database": {
        "AUTOS": {
          "acionamentos": 75,
          "contatos": 14
        }
      },
      "total": {
        "acionamentos": 75,
        "contatos": 14
      }
    }
  ]
}
```

## Checklist resumido

### A. ADD-ONLY compliance

- A1. **FAIL (bloqueado)** — sem histórico git local para diff pré/pós.
- A2-A5. **PASS**

### B. Cache configuration

- B6-B8. **PASS**

### C. Query correctness

- C9-C14. **PASS**

### D. Consolidation logic

- D15-D20. **PASS**

### E. Response shape

- E21-E27. **PASS**

### F. Cache behavior

- F28-F32. **PASS**

### G. Endpoint signature

- G33-G35. **PASS**

## Observações

- Não havia, no momento da coleta, agente presente simultaneamente em `CONSUMER` e `AUTOS`; portanto, a checagem aritmética de soma cruzada foi marcada como não aplicável para esse snapshot de dados.
