# Benchmark Interno — Plano de Implementação

## Objetivo

Adicionar benchmarks internos baseados em quartis históricos aos KPIs do dashboard
executivo, segmentados por AUTOS/CONSUMER. O benchmark usa a performance histórica
dos agentes (últimos 3 meses) para calcular quartis (Q1, mediana, Q3) e a média do
Top 10 (Q4), exibidos como linha de referência contextual abaixo do delta
período-a-período em cada card de KPI.

---

## Arquivos a modificar (em ordem)

| # | Arquivo | Ação |
|---|---------|------|
| 1 | `dominios/produtividade/queries.py` | Adicionar `build_benchmark_query()` |
| 2 | `api/routers/dashboard.py` | Adicionar endpoint `GET /dashboard/benchmarks/{db}` |
| 3 | `agecob-lens/src/services/api.ts` | Adicionar tipo `BenchmarkResponse` + `fetchBenchmarks()` |
| 4 | `agecob-lens/src/components/executive/HomeKpiStrip.tsx` | Estender interface + renderizar benchmark |
| 5 | `agecob-lens/src/hooks/useHomeViewModel.ts` | Integrar fetchBenchmarks nos KPIs |
| 6 | `agecob-lens/src/types/viewModels.ts` | (se necessário — validar após step 4) |

---

## Etapa 1 — Backend: Query Builder

**Arquivo:** `dominios/produtividade/queries.py`

Adicionar nova função `build_benchmark_query(db, lookback_months=3)` que retorna
métricas médias históricas por agente.

### Lógica SQL

```sql
DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
DECLARE @LookbackStart DATE = DATEADD(MONTH, -3, @Hoje);

-- CTE_Esforco_Diario: dedup diário por (agente, dia, ID_DEV)
WITH CTE_Esforco_Diario AS (
    SELECT
        CM.ID_USUARIO,
        CAST(CM.DATA AS DATE) AS dia,
        CM.ID_DEV,
        MAX(CASE WHEN CC.CONTATO = 1 THEN 1 ELSE 0 END) AS teve_contato
    FROM dbo.CTO_MASTER CM (NOLOCK)
    LEFT JOIN dbo.CTO_COMPLEMENTO CC (NOLOCK)
        ON CM.ID_COMPLEMENTO = CC.ID_COMPLEMENTO
    WHERE CM.DATA >= @LookbackStart AND CM.DATA < @Hoje
    GROUP BY CM.ID_USUARIO, CAST(CM.DATA AS DATE), CM.ID_DEV
),
-- CTE_Esforco_Dia: agrega por (agente, dia)
CTE_Esforco_Dia AS (
    SELECT
        ID_USUARIO,
        dia,
        COUNT(*) AS qtd_acionamentos,
        SUM(teve_contato) AS qtd_contatos
    FROM CTE_Esforco_Diario
    GROUP BY ID_USUARIO, dia
    HAVING COUNT(*) >= 5  -- ignora dias com muito pouco esforço
),
-- CTE_Acordos_Diario: acordos do período histórico
CTE_Acordos_Diario AS (
    SELECT
        R.ID_USUARIO,
        CAST(R.DT_EMISSAO AS DATE) AS dia,
        SUM(R.VALOR) AS valor_total_acordos,
        COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_acordos,
        SUM(CASE WHEN R.ID_REC_STATUS IN (1,3,12) AND R.PARCELA = 0
            THEN R.VALOR ELSE 0 END) AS valor_p1,
        SUM(CASE WHEN R.ID_REC_STATUS = 5 THEN R.VALOR ELSE 0 END) AS valor_excecoes
    FROM dbo.REC_MASTER R (NOLOCK)
    WHERE R.DT_EMISSAO >= @LookbackStart AND R.DT_EMISSAO < @Hoje
      AND R.ID_REC_STATUS IN (1,3,5,12)
    GROUP BY R.ID_USUARIO, CAST(R.DT_EMISSAO AS DATE)
),
-- JOIN e agregação final por agente
SELECT
    U.CHAVE,
    U.NOME,
    AVG(E.qtd_acionamentos * 1.0) AS avg_acionamentos_dia,
    AVG(E.qtd_contatos * 1.0) AS avg_contatos_dia,
    -- Taxa de contato média (ponderada: contatos totais / acionamentos totais)
    SUM(E.qtd_contatos) * 100.0 / NULLIF(SUM(E.qtd_acionamentos), 0) AS avg_taxa_contato,
    -- Taxa de conversão média (acordos / contatos)
    ISNULL(SUM(A.qtd_acordos), 0) * 100.0
        / NULLIF(SUM(E.qtd_contatos), 0) AS avg_taxa_conversao,
    -- Efetividade de caixa (1ª parcela / valor acordos)
    ISNULL(SUM(A.valor_p1), 0) * 100.0
        / NULLIF(SUM(A.valor_total_acordos), 0) AS avg_efetividade_caixa,
    -- % Exceções sobre valor
    ISNULL(SUM(A.valor_excecoes), 0) * 100.0
        / NULLIF(SUM(A.valor_total_acordos), 0) AS avg_pct_excecoes,
    -- Dias ativos (para filtrar agentes com pouca atividade)
    COUNT(DISTINCT E.dia) AS dias_ativos
FROM CTE_Esforco_Dia E
JOIN dbo.USU_MASTER U (NOLOCK) ON E.ID_USUARIO = U.ID_USUARIO
LEFT JOIN CTE_Acordos_Diario A ON E.ID_USUARIO = A.ID_USUARIO AND E.dia = A.dia
WHERE U.NOME NOT LIKE 'ANTLIA%'
  AND U.NOME NOT LIKE 'INTERNA%'
  AND U.NOME <> 'COBDESANTOS'
  AND U.NOME <> 'NEMBUSUSER'
  AND U.CHAVE <> 'NEMBUSUSER'
  AND U.CHAVE NOT LIKE 'INTERNA%'
  AND U.CHAVE NOT LIKE 'SUPORTE%'
  AND U.CHAVE NOT LIKE 'SISTEMA%'
GROUP BY U.CHAVE, U.NOME
HAVING COUNT(DISTINCT E.dia) >= 10  -- mínimo 10 dias ativos no período
```

### Detalhes da implementação Python

```python
def build_benchmark_query(db: str, lookback_months: int = 3) -> str:
    """
    Query que retorna métricas médias históricas por agente para cálculo de
    benchmarks internos (quartis).

    Parameters
    ----------
    db : str
        'COBwebRCBAUTOS' ou 'COBwebRCBCONSUMER'. Não suporta 'todos'
        (benchmarks são sempre por banco, realidades diferentes).
    lookback_months : int
        Janela de lookback em meses (default 3).
    """
    if db == "todos":
        raise ValueError("Benchmarks devem ser consultados por banco individual")

    return f"""
DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
DECLARE @LookbackStart DATE = DATEADD(MONTH, -{lookback_months}, @Hoje);

WITH CTE_Esforco_Diario AS (
    SELECT
        CM.ID_USUARIO,
        CAST(CM.DATA AS DATE) AS dia,
        CM.ID_DEV,
        MAX(CASE WHEN CC.CONTATO = 1 THEN 1 ELSE 0 END) AS teve_contato
    FROM dbo.CTO_MASTER CM (NOLOCK)
    LEFT JOIN dbo.CTO_COMPLEMENTO CC (NOLOCK)
        ON CM.ID_COMPLEMENTO = CC.ID_COMPLEMENTO
    WHERE CM.DATA >= @LookbackStart AND CM.DATA < @Hoje
    GROUP BY CM.ID_USUARIO, CAST(CM.DATA AS DATE), CM.ID_DEV
),
CTE_Esforco_Dia AS (
    SELECT
        ID_USUARIO,
        dia,
        COUNT(*) AS qtd_acionamentos,
        SUM(teve_contato) AS qtd_contatos
    FROM CTE_Esforco_Diario
    GROUP BY ID_USUARIO, dia
    HAVING COUNT(*) >= 5
),
CTE_Acordos_Diario AS (
    SELECT
        R.ID_USUARIO,
        CAST(R.DT_EMISSAO AS DATE) AS dia,
        SUM(R.VALOR) AS valor_total_acordos,
        COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_acordos,
        SUM(CASE WHEN R.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL}
                 AND R.PARCELA = {settings.PRIMEIRA_PARCELA}
            THEN R.VALOR ELSE 0 END) AS valor_p1,
        SUM(CASE WHEN R.ID_REC_STATUS IN {settings.STATUS_EXCECAO_SQL}
            THEN R.VALOR ELSE 0 END) AS valor_excecoes
    FROM dbo.REC_MASTER R (NOLOCK)
    WHERE R.DT_EMISSAO >= @LookbackStart AND R.DT_EMISSAO < @Hoje
      AND R.ID_REC_STATUS IN {settings.STATUS_UNIVERSO_SQL}
    GROUP BY R.ID_USUARIO, CAST(R.DT_EMISSAO AS DATE)
)
SELECT
    U.CHAVE,
    U.NOME,
    SUM(E.qtd_contatos) * 100.0 / NULLIF(SUM(E.qtd_acionamentos), 0) AS avg_taxa_contato,
    ISNULL(SUM(A.qtd_acordos), 0) * 100.0
        / NULLIF(SUM(E.qtd_contatos), 0) AS avg_taxa_conversao,
    ISNULL(SUM(A.valor_p1), 0) * 100.0
        / NULLIF(SUM(A.valor_total_acordos), 0) AS avg_efetividade_caixa,
    ISNULL(SUM(A.valor_excecoes), 0) * 100.0
        / NULLIF(SUM(A.valor_total_acordos), 0) AS avg_pct_excecoes,
    COUNT(DISTINCT E.dia) AS dias_ativos
FROM CTE_Esforco_Dia E
JOIN dbo.USU_MASTER U (NOLOCK) ON E.ID_USUARIO = U.ID_USUARIO
LEFT JOIN CTE_Acordos_Diario A ON E.ID_USUARIO = A.ID_USUARIO AND E.dia = A.dia
{settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
GROUP BY U.CHAVE, U.NOME
HAVING COUNT(DISTINCT E.dia) >= 10
ORDER BY avg_taxa_conversao DESC;
"""
```

---

## Etapa 2 — Backend: Endpoint

**Arquivo:** `api/routers/dashboard.py`

### Novo endpoint

```python
@router.get("/benchmarks/{db}")
def get_benchmarks(
    db: str,
    lookback_months: int = Query(default=3, ge=1, le=12),
    request: Request = None,
) -> Dict[str, Any]:
    """
    Retorna benchmarks internos (quartis históricos) para métricas de
    produtividade, segmentados por banco.

    Response shape:
    {
      "meta": {...},
      "data": {
        "taxa_contato":    { "q1": 15.2, "median": 28.5, "q3": 42.1, "top10_mean": 55.3 },
        "taxa_conversao":  { "q1": 1.8,  "median": 4.2,  "q3": 7.8,  "top10_mean": 12.1 },
        "efetividade_caixa": { ... },
        "pct_excecoes":    { ... }
      },
      "errors": []
    }
    """
    from dominios.produtividade.queries import build_benchmark_query
    import numpy as np

    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database(db)

    def _compute():
        query = build_benchmark_query(validated_db, lookback_months=lookback_months)
        return run_query(query, validated_db, run_id=run_id, context="dashboard/benchmarks")

    cache_key = f"benchmarks|{validated_db}|{lookback_months}m"
    rows = cache_manager.get_or_compute(cache_key, _compute)

    if not rows:
        return build_response_envelope(
            [],
            [validated_db],
            filters={"database": validated_db, "lookback_months": lookback_months},
            run_id=run_id,
        )

    def _quartis(values):
        arr = np.array([v for v in values if v is not None and not np.isnan(v)])
        if len(arr) == 0:
            return {"q1": None, "median": None, "q3": None, "top10_mean": None}
        n_top10 = max(1, len(arr) // 10)
        top10 = np.sort(arr)[-n_top10:]
        return {
            "q1": round(float(np.percentile(arr, 25)), 2),
            "median": round(float(np.percentile(arr, 50)), 2),
            "q3": round(float(np.percentile(arr, 75)), 2),
            "top10_mean": round(float(np.mean(top10)), 2),
        }

    data = {
        "taxa_contato": _quartis([r.get("avg_taxa_contato") for r in rows]),
        "taxa_conversao": _quartis([r.get("avg_taxa_conversao") for r in rows]),
        "efetividade_caixa": _quartis([r.get("avg_efetividade_caixa") for r in rows]),
        "pct_excecoes": _quartis([r.get("avg_pct_excecoes") for r in rows]),
        "n_agentes": len(rows),
        "lookback_months": lookback_months,
    }

    return build_response_envelope(
        data,
        [validated_db],
        filters={"database": validated_db, "lookback_months": lookback_months},
        run_id=run_id,
    )
```

### Import necessário

Adicionar no topo de `api/routers/dashboard.py`:
```python
from dominios.produtividade.queries import (
    build_produtividade_query,
    build_benchmark_query,  # NOVO
)
```

### Nota sobre cache

O cache TTL padrão (60s) é curto para dados históricos. O `cache_manager.get_or_compute`
com a key `benchmarks|{db}|{months}m` garante que o resultado seja cacheado.
O TTL pode ser estendido via `cache_manager.set_ttl()` ou criando uma key com TTL
mais longo. Alternativa: usar `@cache_manager.cached(ttl=3600)` se disponível.
Se o cache_manager não suportar TTL por key, usar `CACHE_TTL_SECONDS` e o cache
natural de 60s — aceitável para este endpoint (carga ~2-5s por query).

---

## Etapa 3 — Frontend: API + Tipos

**Arquivo:** `agecob-lens/src/services/api.ts`

### Novo tipo

```typescript
export interface BenchmarkQuartiles {
  q1: number | null;
  median: number | null;
  q3: number | null;
  top10_mean: number | null;
}

export interface BenchmarkData {
  taxa_contato: BenchmarkQuartiles;
  taxa_conversao: BenchmarkQuartiles;
  efetividade_caixa: BenchmarkQuartiles;
  pct_excecoes: BenchmarkQuartiles;
  n_agentes: number;
  lookback_months: number;
}
```

### Nova função

```typescript
export async function fetchBenchmarks(
  db: DatabaseOption,
  lookbackMonths = 3,
): Promise<ApiEnvelope<BenchmarkData>> {
  const resolved = db === "todos" ? "COBwebRCBAUTOS" : db;
  return request<ApiEnvelope<BenchmarkData>>(
    `/dashboard/benchmarks/${resolved}?lookback_months=${lookbackMonths}`,
  );
}
```

**Observação:** Quando `db === "todos"`, o frontend deve fazer DUAS chamadas
(uma para AUTOS, uma para CONSUMER) e depois mostrar o benchmark do banco
correspondente no contexto certo. Alternativa: o ViewModel faz as duas chamadas
e o KPI strip mostra o benchmark de cada BU separadamente.

Para o Home (Index.tsx), onde selectedDatabase pode ser "todos", a abordagem
recomendada é:

1. Fazer `fetchBenchmarks("COBwebRCBAUTOS")` e `fetchBenchmarks("COBwebRCBCONSUMER")`
2. Para KPIs globais (que agregam os dois bancos), usar a média dos dois benchmarks
3. Para charts segmentados por BU, usar o benchmark específico

---

## Etapa 4 — Frontend: Estender tipos dos KPIs

**Arquivo:** `agecob-lens/src/components/executive/HomeKpiStrip.tsx`

### Modificações

Adicionar campo opcional `benchmark` nas interfaces:

```typescript
export interface HomeKpiPrimary {
  label: string;
  value: number | null;
  unit: "BRL" | "count" | "percent";
  baseline?: {
    value: number;
    label: string;
    betterWhen: "up" | "down";
    baselineValue?: number;
  };
  // NOVO:
  benchmark?: {
    value: number;       // top10_mean
    label: string;       // "Top 10"
  };
}

export interface HomeKpiSecondary {
  label: string;
  value: number | null;
  unit: "BRL" | "percent" | "count";
  baseline?: {
    value: number;
    label: string;
    betterWhen: "up" | "down" | "flat";
  };
  caption?: string;
  // NOVO:
  benchmark?: {
    value: number;       // top10_mean
    label: string;       // "Top 10"
  };
}
```

### Renderização do benchmark no card

No `SecondaryCard`, abaixo do baseline/caption, adicionar:

```tsx
{kpi.benchmark ? (
  <div className={cn(
    "text-[10px] font-medium mt-0.5",
    kpi.value != null && kpi.value >= kpi.benchmark.value
      ? "text-success-fg"
      : "text-amber-600"
  )}>
    Bench {kpi.benchmark.label}: {fmtPct(kpi.benchmark.value)}
  </div>
) : null}
```

No `PrimaryCard`, seguir o mesmo padrão abaixo do baseline.

**Regras de cor:**
- Verde (`text-success-fg`): valor atual ≥ benchmark
- Âmbar (`text-amber-600`): valor atual < benchmark
- Para métricas onde "menor é melhor" (% Exceções): inverter lógica

Para lidar com "menor é melhor", adicionar prop `benchmarkBetterWhen` ou usar
o `baseline.betterWhen` como hint:

```tsx
const aboveBenchmark = kpi.baseline?.betterWhen === "down"
  ? (kpi.value != null && kpi.value <= kpi.benchmark.value)
  : (kpi.value != null && kpi.value >= kpi.benchmark.value);
```

---

## Etapa 5 — Frontend: Integrar no ViewModel

**Arquivo:** `agecob-lens/src/hooks/useHomeViewModel.ts`

### Modificações

1. Importar `fetchBenchmarks` e tipos
2. Adicionar queries para benchmarks (AUTOS + CONSUMER)
3. Passar `benchmark` nos objetos `kpiPrimary` e `kpiSecondary`

```typescript
// Novos imports
import { fetchBenchmarks } from "@/services/api";
import type { BenchmarkData } from "@/services/api";

// Dentro de useHomeViewModel():

// Benchmark queries — um por banco
const { data: benchAutosEnv } = useQuery({
  queryKey: ["benchmarks", "COBwebRCBAUTOS"] as const,
  queryFn: () => fetchBenchmarks("COBwebRCBAUTOS"),
  staleTime: 3600_000, // 1h cache
});
const { data: benchConsumerEnv } = useQuery({
  queryKey: ["benchmarks", "COBwebRCBCONSUMER"] as const,
  queryFn: () => fetchBenchmarks("COBwebRCBCONSUMER"),
  staleTime: 3600_000,
});

const benchAutos = benchAutosEnv?.data as BenchmarkData | undefined;
const benchConsumer = benchConsumerEnv?.data as BenchmarkData | undefined;

// Benchmark combinado (média dos dois bancos, para visão "todos")
const benchGlobal = useMemo(() => {
  if (!benchAutos || !benchConsumer) return undefined;
  const avg = (a: number | null, b: number | null) =>
    a != null && b != null ? (a + b) / 2 : (a ?? b);
  return {
    taxa_contato: avg(
      benchAutos.taxa_contato?.top10_mean,
      benchConsumer.taxa_contato?.top10_mean,
    ),
    taxa_conversao: avg(
      benchAutos.taxa_conversao?.top10_mean,
      benchConsumer.taxa_conversao?.top10_mean,
    ),
    efetividade_caixa: avg(
      benchAutos.efetividade_caixa?.top10_mean,
      benchConsumer.efetividade_caixa?.top10_mean,
    ),
    pct_excecoes: avg(
      benchAutos.pct_excecoes?.top10_mean,
      benchConsumer.pct_excecoes?.top10_mean,
    ),
  };
}, [benchAutos, benchConsumer]);
```

4. No `kpiSecondary` useMemo, adicionar campo `benchmark`:

```typescript
// Para Taxa de Contato:
{
  label: "Taxa de Contato %",
  value: cpc,
  unit: "percent" as const,
  baseline: mk(cpc, cpcPrev, "up"),
  benchmark: benchGlobal ? {
    value: benchGlobal.taxa_contato ?? 0,
    label: "Top 10",
  } : undefined,
},
// Para Conversão %:
{
  label: "Conversão %",
  value: conv,
  unit: "percent" as const,
  baseline: mk(conv, convPrev, "up"),
  benchmark: benchGlobal ? {
    value: benchGlobal.taxa_conversao ?? 0,
    label: "Top 10",
  } : undefined,
},
// Para Efetividade de Caixa:
{
  label: "Efetividade de Caixa",
  value: indiceConversaoCaixa ?? 0,
  unit: "percent" as const,
  baseline: mk(indiceConversaoCaixa ?? 0, indiceConversaoCaixaPrev ?? 0, "up"),
  benchmark: benchGlobal ? {
    value: benchGlobal.efetividade_caixa ?? 0,
    label: "Top 10",
  } : undefined,
},
// Para % Exc. s/ 1ª Parcela (menor é melhor):
{
  label: "% Exc. s/ 1ª Parcela",
  value: excecoesPctParcela,
  unit: "percent" as const,
  baseline: mk(excecoesPctParcela, excecoesPctParcelaPrev, "down"),
  benchmark: benchGlobal ? {
    value: benchGlobal.pct_excecoes ?? 0,
    label: "Top 10",
  } : undefined,
},
```

---

## Etapa 6 — Validação

### Checklist de verificação

- [ ] Backend: `build_benchmark_query("COBwebRCBAUTOS")` retorna SQL válido
- [ ] Backend: endpoint `/dashboard/benchmarks/COBwebRCBAUTOS` retorna JSON com quartis
- [ ] Backend: endpoint funciona para ambos os bancos
- [ ] Backend: cache está funcional (segunda chamada retorna em <100ms)
- [ ] Frontend: `fetchBenchmarks` retorna dados tipados corretamente
- [ ] Frontend: benchmark aparece nos cards da Home com valor correto
- [ ] Frontend: cor verde quando acima do benchmark, âmbar quando abaixo
- [ ] Frontend: para "% Exceções", lógica invertida (menor é melhor)
- [ ] Frontend: fallback graceful quando benchmark indisponível (não quebra o layout)
- [ ] Frontend: `staleTime: 3600_000` evita refetch excessivo

### Teste manual

```powershell
# Testar backend
curl http://127.0.0.1:8000/dashboard/benchmarks/COBwebRCBAUTOS
curl http://127.0.0.1:8000/dashboard/benchmarks/COBwebRCBCONSUMER

# Testar frontend (build)
cd agecob-lens && npm run build
```

---

## Observações

1. **numpy** é necessário no backend para calcular percentiles. Se não estiver
   disponível, usar `statistics` da stdlib ou implementar manualmente com sorted().
   Verificar `requirements.txt` para numpy.

2. **Segmentação AUTOS/CONSUMER**: benchmarks são sempre por banco individual.
   O frontend faz duas chamadas e combina para a visão "todos".

3. **Janela de lookback**: 3 meses é o default. Pode ser ajustado via query param
   `?lookback_months=6`.

4. **Mínimo de dias ativos**: `HAVING COUNT(DISTINCT E.dia) >= 10` remove agentes
   com pouquíssima atividade, evitando distorcer os quartis com outliers.

5. **CPC (count)** não é incluído no benchmark porque é uma métrica absoluta que
   depende do volume de acionamentos — o que interessa é a taxa de contato (%).

6. **HandoffEficienciaGroupedBar** já tem prop `metaConversao={3}` hardcoded.
   Após implementar benchmarks, considerar substituir pelo valor real do
   benchmark de conversão por banco (fora do escopo imediato).
