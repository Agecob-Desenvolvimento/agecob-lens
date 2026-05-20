# Agreement Effectiveness Queries (COBweb)

**Period:** Issues from 2026 onward  
**Valid statuses:** `ID_REC_STATUS IN (1, 3, 12)` -> ACTIVE, WRITEOFF BY PAYMENT, SINGLE PAYMENT WRITEOFF  
**First installment:** `PARCELA = 0`  
**Cushion (2nd installment onward):** `PARCELA > 0`  
**On-time conversion:** Payment within 5 days after due date (`DT_PAGAMENTO <= DT_VENCIMENTO + 5`)  
**Rounding:** Nearest integer (`FLOOR(value + 0.5)`)

---

## 1. Daily View - 1st Installment

```sql
SELECT 
    CAST(DT_EMISSAO AS DATE) AS Dia_Emissao,
    COUNT(*) AS Boletos_Gerados,
    SUM(CASE WHEN VR_PAGO > 0 
              AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
             THEN 1 ELSE 0 END) AS Pagos_No_Prazo,
    CAST(FLOOR(
        100.0 * SUM(CASE WHEN VR_PAGO > 0 
                         AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
                         THEN 1 ELSE 0 END) 
        / NULLIF(COUNT(*), 0) 
        + 0.5
    ) AS INT) AS Conversao_Prazo_5d
FROM REC_MASTER
WHERE PARCELA = 0
  AND ID_REC_STATUS IN (1, 3, 12)
  AND YEAR(DT_EMISSAO) >= 2026
GROUP BY CAST(DT_EMISSAO AS DATE)
ORDER BY Dia_Emissao;
```

## 2. Monthly View - 1st Installment

```sql
SELECT 
    YEAR(DT_EMISSAO) AS Ano,
    MONTH(DT_EMISSAO) AS Mes,
    COUNT(*) AS Boletos_Gerados,
    SUM(CASE WHEN VR_PAGO > 0 
              AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
             THEN 1 ELSE 0 END) AS Pagos_No_Prazo,
    CAST(FLOOR(
        100.0 * SUM(CASE WHEN VR_PAGO > 0 
                         AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
                         THEN 1 ELSE 0 END) 
        / NULLIF(COUNT(*), 0) 
        + 0.5
    ) AS INT) AS Conversao_Prazo_5d
FROM REC_MASTER
WHERE PARCELA = 0
  AND ID_REC_STATUS IN (1, 3, 12)
  AND YEAR(DT_EMISSAO) >= 2026
GROUP BY YEAR(DT_EMISSAO), MONTH(DT_EMISSAO)
ORDER BY Ano, Mes;
```

## 3. Daily View - Cushion (2nd Installment Onward)

```sql
SELECT 
    CAST(DT_EMISSAO AS DATE) AS Dia_Emissao,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM(CASE WHEN VR_PAGO > 0 
              AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
             THEN 1 ELSE 0 END) AS Pagos_No_Prazo,
    CAST(FLOOR(
        100.0 * SUM(CASE WHEN VR_PAGO > 0 
                         AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
                         THEN 1 ELSE 0 END) 
        / NULLIF(COUNT(*), 0) 
        + 0.5
    ) AS INT) AS Conversao_Colchao
FROM REC_MASTER
WHERE PARCELA > 0
  AND ID_REC_STATUS IN (1, 3, 12)
  AND YEAR(DT_EMISSAO) >= 2026
GROUP BY CAST(DT_EMISSAO AS DATE)
ORDER BY Dia_Emissao;
```

## 4. Monthly View - Cushion

```sql
SELECT 
    YEAR(DT_EMISSAO) AS Ano,
    MONTH(DT_EMISSAO) AS Mes,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM(CASE WHEN VR_PAGO > 0 
              AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
             THEN 1 ELSE 0 END) AS Pagos_No_Prazo,
    CAST(FLOOR(
        100.0 * SUM(CASE WHEN VR_PAGO > 0 
                         AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) 
                         THEN 1 ELSE 0 END) 
        / NULLIF(COUNT(*), 0) 
        + 0.5
    ) AS INT) AS Conversao_Colchao
FROM REC_MASTER
WHERE PARCELA > 0
  AND ID_REC_STATUS IN (1, 3, 12)
  AND YEAR(DT_EMISSAO) >= 2026
GROUP BY YEAR(DT_EMISSAO), MONTH(DT_EMISSAO)
ORDER BY Ano, Mes;
```

## 5. Monthly View by Agent - 1st Installment

Excluded agents: names containing `'Antlia'`, `'suporte'`, `'Interna'`, `'User'`.

```sql
SELECT 
    U.CHAVE AS Agente,
    YEAR(R.DT_EMISSAO) AS Ano,
    MONTH(R.DT_EMISSAO) AS Mes,
    COUNT(*) AS Boletos_Gerados,
    SUM(CASE WHEN R.VR_PAGO > 0 
              AND R.DT_PAGAMENTO <= DATEADD(DAY, 5, R.DT_VENCIMENTO) 
             THEN 1 ELSE 0 END) AS Pagos_No_Prazo,
    CAST(FLOOR(
        100.0 * SUM(CASE WHEN R.VR_PAGO > 0 
                         AND R.DT_PAGAMENTO <= DATEADD(DAY, 5, R.DT_VENCIMENTO) 
                         THEN 1 ELSE 0 END) 
        / NULLIF(COUNT(*), 0) 
        + 0.5
    ) AS INT) AS Conversao_Prazo_5d
FROM REC_MASTER R
INNER JOIN USU_MASTER U ON R.ID_USUARIO = U.ID_USUARIO
WHERE R.PARCELA = 0
  AND R.ID_REC_STATUS IN (1, 3, 12)
  AND YEAR(R.DT_EMISSAO) >= 2026
  AND (U.CHAVE NOT LIKE '%Antlia%' 
       AND U.CHAVE NOT LIKE '%suporte%' 
       AND U.CHAVE NOT LIKE '%Interna%' 
       AND U.CHAVE NOT LIKE '%User%')
GROUP BY U.CHAVE, YEAR(R.DT_EMISSAO), MONTH(R.DT_EMISSAO)
ORDER BY Ano, Mes, Agente;
```

## 6. Monthly View by Agent - Cushion

```sql
SELECT 
    U.CHAVE AS Agente,
    YEAR(R.DT_EMISSAO) AS Ano,
    MONTH(R.DT_EMISSAO) AS Mes,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM(CASE WHEN R.VR_PAGO > 0 
              AND R.DT_PAGAMENTO <= DATEADD(DAY, 5, R.DT_VENCIMENTO) 
             THEN 1 ELSE 0 END) AS Pagos_No_Prazo,
    CAST(FLOOR(
        100.0 * SUM(CASE WHEN R.VR_PAGO > 0 
                         AND R.DT_PAGAMENTO <= DATEADD(DAY, 5, R.DT_VENCIMENTO) 
                         THEN 1 ELSE 0 END) 
        / NULLIF(COUNT(*), 0) 
        + 0.5
    ) AS INT) AS Conversao_Colchao
FROM REC_MASTER R
INNER JOIN USU_MASTER U ON R.ID_USUARIO = U.ID_USUARIO
WHERE R.PARCELA > 0
  AND R.ID_REC_STATUS IN (1, 3, 12)
  AND YEAR(R.DT_EMISSAO) >= 2026
  AND (U.CHAVE NOT LIKE '%Antlia%' 
       AND U.CHAVE NOT LIKE '%suporte%' 
       AND U.CHAVE NOT LIKE '%Interna%' 
       AND U.CHAVE NOT LIKE '%User%')
GROUP BY U.CHAVE, YEAR(R.DT_EMISSAO), MONTH(R.DT_EMISSAO)
ORDER BY Ano, Mes, Agente;
```

---

It is now **100% complete** with everything we defined. You can replace the content of `queries.md` with this block and send it to the AI agent confidently.