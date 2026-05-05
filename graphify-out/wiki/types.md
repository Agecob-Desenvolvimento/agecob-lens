# Tipos — TypeScript & Contratos de API

[← index](index.md)

## Tipos de Banco

```typescript
type DatabaseOption  = "COBwebRCBAUTOS" | "COBwebRCBCONSUMER" | "todos"
type AdminDatabase   = Exclude<DatabaseOption, "todos">  // sem "todos"
```

---

## Envelope de API

```typescript
interface ApiMeta {
  generated_at: string   // ISO8601
  total_rows: number
  sources: string[]
  filters: Record<string, unknown>
}

interface ApiErrorItem {
  code: string
  message: string
}

interface ApiEnvelope<T> {
  meta: ApiMeta
  data: T[]
  errors: ApiErrorItem[]
}
```

---

## Rows de Domínio

```typescript
interface AcordoRow {
  // acordos de hoje por agente
}

interface ProdutividadeRow {
  CHAVE: string
  NOME: string
  qtd_acionamentos: number
  qtd_contatos: number
  cpc_percentual: number
  qtd_acordos: number
  acordos_percentual: number
  valor_acordos: number
  acordo_medio: number
  parcelamento_medio: number
  desconto_medio_percentual: number
  valor_primeira_parcela: number
  qtd_excecoes: number
  valor_excecoes: number
}

interface ProdutividadeRowWithSource extends ProdutividadeRow {
  source: Exclude<DatabaseOption, "todos">
}

interface StatusCargaRow { /* status de carga do banco */ }
interface PrimeiraParcelaDiaRow { /* valor 1ª parcela do dia */ }
interface ExcecoesPorPortfolioRow { /* exceções agrupadas por portfolio */ }
interface ExcecoesPorAgenteRow { /* exceções por agente */ }
interface AcordosPorPortfolioRow { /* acordos por portfolio */ }
interface PrimeiraParcelaPorAgenteRow { /* 1ª parcela por agente */ }
interface AcordoHojeAgenteRow { /* acordos hoje filtrado por agente */ }
```

---

## Efetividade de Boletos

```typescript
interface EfDiariaRow               { /* efetividade diária 1ª parcela */ }
interface EfDiariaColchaoRow        { /* efetividade diária colchão */ }
interface EfMensalRow               { /* efetividade mensal 1ª parcela */ }
interface EfMensalColchaoRow        { /* efetividade mensal colchão */ }
interface EfAgenteRow               { /* por agente 1ª parcela */ }
interface EfAgenteColchaoRow        { /* por agente colchão */ }
interface EfDiariaColchaoVencimentoRow   { /* colchão por vencimento diário */ }
interface EfMensalColchaoVencimentoRow   { /* colchão por vencimento mensal */ }
interface EfAgenteColchaoVencimentoRow   { /* colchão por vencimento por agente */ }
```

---

## Admin / Indexes

```typescript
interface IndexDescriptor {
  name: string
  table: string
  columns: string[]
  exists: boolean
}

interface IndexesStatusResponse {
  indexes: IndexDescriptor[]
}

interface IndexesApplyResponse {
  applied: string[]
  skipped: string[]
  errors: string[]
}
```

---

## Tipos Executivos (`types/executive.ts`)

```typescript
type InsightSeverity = "critical" | "warning" | "positive"
type MetricUnit      = "BRL" | "%" | "num" | "pct"

interface ExecutiveKpi {
  id: string
  title: string
  value: number | string
  unit: MetricUnit
  trend?: number
  color?: string
}

interface RankingRow {
  position: number
  agente: string
  valor: number
  percentual: number
}

interface InsightSlot {
  severity: InsightSeverity
  text: string
  icon?: string
}

interface ActionSlot {
  action: string
  detail: string
}

interface InsightEngineOutput {
  insight1: InsightSlot | null
  insight2: InsightSlot | null
  action: ActionSlot | null
  empty: boolean
}
```

---

## Métricas Agregadas (`lib/metrics.ts`)

```typescript
interface MetricTotals {
  qtd_acionamentos: number
  qtd_contatos: number
  qtd_acordos: number
  qtd_excecoes: number
  valor_acordos: number
  valor_primeira_parcela: number
  valor_excecoes: number
  agentes: number
}
```
