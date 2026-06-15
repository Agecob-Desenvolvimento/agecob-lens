# Ultra-Plano: Visualização de Metas (PDF → Dashboard)

**Data da análise do PDF:** 2026-06-12
**Arquivo origem:** `docs/document_pdf.pdf`
**Período:** 2T26 (abril–junho 2026)

---

## 0. Estrutura Real do PDF (≠ especificação original)

O PDF NÃO contém nomes de negociadores individuais. Os dados são agregados por **portfólio**.

| # | Coluna | Tipo | Significado |
|---|--------|------|-------------|
| 1 | Escritório | string | Sempre `AGECOB_LP` no documento |
| 2 | Portfólio | string | Nome do portfólio (ex: `BVFinanceira VII`) |
| 3 | Grupo | string | `Veículos` ou `CDC / SR` |
| 4 | Qtd Negociadores | float | Headcount alocado ao portfólio no 2T26 |
| 5–7 | Meta Caixa mensal | BRL | Meta de caixa para abr/mai/jun 2026 |
| 8–10 | Meta Retomadas # | count | Meta de quantidade de retomadas |
| 11–13 | Meta Retomadas R$ | BRL | Meta de valor de retomadas |
| 14–16 | Meta PNT mensal | BRL | Meta combinada (Caixa + Retomadas R$) |

Validação: `Meta PNT = Meta Caixa + Meta Retomadas R$` para cada mês. Total Geral:
- Qtd Negociadores total = 30.3 headcount
- Meta PNT 202604 = R$ 1.761.337
- Meta PNT 202605 = R$ 1.761.337
- Meta PNT 202606 = R$ 1.838.354

---

## 1. Estrutura do JSON Alvo

Arquivo: `dados_metas/ultimas_metas.json`

```json
{
  "meta": {
    "periodo": "2T26",
    "extraido_em": "2026-06-12T10:30:00-03:00",
    "arquivo_origem": "document_pdf.pdf",
    "total_registros": 42,
    "validado": true,
    "checksum_pnt_linhas": 1761337.00,
    "checksum_total_geral": 1761337.00
  },
  "metas": [
    {
      "escritorio": "AGECOB_LP",
      "portfolio": "BVFinanceira VII",
      "grupo": "Veículos",
      "qtd_negociadores": 4.0,
      "meta_caixa": { "202604": 173246.00, "202605": 173246.00, "202606": 181908.00 },
      "meta_retomadas_qtd": { "202604": 1, "202605": 1, "202606": 1 },
      "meta_retomadas_valor": { "202604": 48000.00, "202605": 48000.00, "202606": 48000.00 },
      "meta_pnt": { "202604": 221246.00, "202605": 221246.00, "202606": 229908.00 }
    }
  ]
}
```

### Decisões de design

| Decisão | Justificativa |
|---|---|
| `qtd_negociadores` como campo separado | Permite rateio da meta por agente quando necessário (meta ÷ headcount) |
| Metas mensais como objeto `{ "202604": valor }` | Busca O(1) por mês; compatível com filtro de data do dashboard |
| `portfolio` como string (= `DIV_AUX.CAMPO010`) | Compatível com `PortfolioFilter` existente |
| Sem array de negociadores (ausente no PDF) | Reflete a realidade dos dados; headcount supre a granularidade |
| `checksum_pnt_*` no envelope | Rastreabilidade da validação contra TOTAL GERAL |

---

## 2. Passo a Passo do `extrator.py`

### Localização
```
scripts/extrator.py                  ← script standalone
dados_metas/                         ← diretório de saída (gitignorado)
dados_metas/ultimas_metas.json       ← sempre o último processado com sucesso
dados_metas/metas_2T26.json          ← snapshot histórico
dados_metas/erro_extracao.log        ← log de falhas (não sobrescreve ultimas_metas)
```

### Dependência
`pdfplumber` — adicionar ao `requirements.txt` se ausente.

### Fluxo

```
1. Receber PDF como argumento: python extrator.py docs/document_pdf.pdf
2. Extrair tabelas com pdfplumber
3. Detectar cabeçalho de 2 níveis (super-headers + sub-headers)
4. Mapear colunas:
   - Colunas 1–3: dimensões (escritorio, portfolio, grupo)
   - Coluna 4: qtd_negociadores
   - Colunas 5–7: meta_caixa mensal
   - Colunas 8–10: meta_retomadas_qtd mensal
   - Colunas 11–13: meta_retomadas_valor mensal
   - Colunas 14–16: meta_pnt mensal
5. Detectar linha "TOTAL GERAL" e extrair totais
6. Identificar linhas "TOTAL <grupo>" como subtotais (não incluir nos dados)
7. VALIDAR:
   a. Colunas obrigatórias presentes?
   b. Para cada linha: meta_pnt[mês] ≈ meta_caixa[mês] + meta_retomadas_valor[mês]
      (tolerância: R$ 0.01)
   c. Soma das linhas de meta_pnt[202604] == TOTAL GERAL meta_pnt[202604]
8. SE validação FALHAR:
   → escrever erro_extracao.log com detalhes
   → NÃO sobrescrever ultimas_metas.json
   → exit code 1
9. SE validação PASSAR:
   → montar JSON conforme estrutura acima
   → sobrescrever ultimas_metas.json
   → salvar metas_{periodo}.json se não existir
   → exit code 0
```

### Pseudocódigo da validação

```python
MESES = ["202604", "202605", "202606"]

def validar_linha(linha: dict) -> list[str]:
    erros = []
    for mes in MESES:
        caixa = linha["meta_caixa"][mes]
        retomadas = linha["meta_retomadas_valor"][mes]
        pnt = linha["meta_pnt"][mes]
        if abs(caixa + retomadas - pnt) > 0.01:
            erros.append(
                f"{linha['portfolio']} {mes}: "
                f"caixa({caixa}) + retomadas({retomadas}) = {caixa + retomadas} "
                f"≠ pnt({pnt})"
            )
    return erros

def validar_total_geral(linhas, total_geral, mes):
    soma = sum(l["meta_pnt"][mes] for l in linhas)
    if abs(soma - total_geral["meta_pnt"][mes]) > 0.01:
        raise ValueError(f"{mes}: soma linhas ({soma}) ≠ TOTAL GERAL ({total_geral['meta_pnt'][mes]})")
```

---

## 3. Lógica do Frontend

### 3.1 Novo Endpoint no Backend

**Arquivo:** `api/routers/dashboard.py`

```python
@router.get("/dashboard/metas")
def get_metas():
    """Serve o JSON de metas extraído do PDF."""
    metas_path = Path("dados_metas/ultimas_metas.json")
    if not metas_path.exists():
        return build_response_envelope(
            data=[],
            errors=["Arquivo de metas não encontrado. Execute extrator.py primeiro."]
        )
    with open(metas_path, "r", encoding="utf-8") as f:
        dados = json.load(f)
    return dados  # já é um dict compatível com o envelope padrão
```

### 3.2 Tipos e Serviço no Frontend

**Arquivo:** `src/services/api.ts`

```typescript
export interface MetaMensal {
  "202604": number;
  "202605": number;
  "202606": number;
}

export interface MetaRow {
  escritorio: string;
  portfolio: string;
  grupo: string;
  qtd_negociadores: number;
  meta_caixa: MetaMensal;
  meta_retomadas_qtd: MetaMensal;
  meta_retomadas_valor: MetaMensal;
  meta_pnt: MetaMensal;
}

export interface MetasEnvelope {
  meta: {
    periodo: string;
    extraido_em: string;
    validado: boolean;
    total_registros: number;
  };
  metas: MetaRow[];
}

export async function fetchMetas(): Promise<MetasEnvelope> {
  return request<MetasEnvelope>("/dashboard/metas");
}
```

### 3.3 Hook `useMetasData`

**Arquivo:** `src/hooks/useMetasData.ts`

Lógica central:

```
Se portfolio != null (filtro específico):
  → filtrar metas where portfolio === selectedPortfolio
  → dados são as metas EXATAS do portfólio

Se portfolio == null ("Todos"):
  → agrupar TODAS as metas
  → para cada mês, somar meta_pnt de todos os portfólios
  → dividir pelo total de qtd_negociadores (headcount)
  → isso dá a meta MÉDIA por headcount
  → isMedia = true → exibir banner de aviso
```

**Nota sobre a regra de ouro adaptada:** Como as metas são por portfólio (não por agente), a média no modo "Todos" é calculada como: `Σ(meta_pnt) / Σ(qtd_negociadores)` = meta média por agente equivalente. Isso evita o número irreal de soma total e dá um valor comparável por headcount.

### 3.4 Componente `MetaVsRealPanel`

**Arquivo:** `src/components/detalhamento/MetaVsRealPanel.tsx`

**Props:**
```typescript
interface MetaVsRealPanelProps {
  metasFiltradas: MetaRow[];       // metas já filtradas pelo portfolio
  isMedia: boolean;                 // exibe banner de aviso
  mesSelecionado: string;           // "202604" | "202605" | "202606"
  dadosReais: Array<{               // dados reais do SQL Server
    portfolio: string;
    valor_acordos: number;          // proxy para "realizado"
    primeira_parcela: number;
  }>;
  loading?: boolean;
}
```

**Estrutura visual:**

```
┌──────────────────────────────────────────────────────────┐
│ ⚠️ Atenção: Como 'Todos os Portfólios' foi selecionado,  │
│ as metas exibidas representam a média por headcount,      │
│ e não a soma total dos portfólios.                        │
└──────────────────────────────────────────────────────────┘   ← amber banner

┌──────────────────────────────────────────────────────────┐
│ Meta vs Real — PNT (Junho 2026)               ☰ Mês ▼   │
│                                                          │
│ BVFinanceira VII    ████████████████░░░  85%  R$ 189k    │
│ Panamericano XV     ████████████████████  100% R$ 240k   │
│ Santander XLII      ██████████░░░░░░░░░░  50%  R$ 86k    │
│ ...                                                      │
│                     ├─── Real ───┤├ Meta ┤               │
└──────────────────────────────────────────────────────────┘
```

**Ordenação:** Por % de atingimento crescente (quem está mais longe da meta primeiro — prioridade de ação).

**Cores das barras:**
- Verde (emerald): ≥ 95% da meta
- Amarelo (amber): 70–94%
- Vermelho (rose): < 70%

### 3.5 Integração na Página

Em `DetalhamentoAgentes.tsx`, adicionar como NOVA seção (Bloco 1.5 ou dentro do Bloco 1):

```tsx
// Após o MetaEditor, dentro do Bloco 1
import { MetaVsRealPanel } from "@/components/detalhamento/MetaVsRealPanel";
import { useMetasData } from "@/hooks/useMetasData";

// Dentro do componente:
const mesSelecionado = "202606"; // ou derivado do filtro de data global
const { metasFiltradas, isMedia, envelopeMeta } = useMetasData(
  vm.selectedPortfolio,
  mesSelecionado
);

// Portfolios com dados reais (via vm ou hook separado)
const portfoliosReais = useMemo(() => {
  // Agregar vm.heatmapAgents por portfolio
  // (requer que os dados reais tenham coluna de portfólio)
}, [vm.heatmapAgents]);
```

**Nota:** Os dados reais atuais (`useProdutividadeData`) podem não incluir a coluna de portfólio no nível do agente. Será necessário verificar se a query SQL já retorna `DIV_AUX.CAMPO010` por linha. Se não, será preciso um endpoint adicional ou estender a query existente. Isso é um risco identificado (ver seção 6).

### 3.6 Seletor de Mês

Adicionar um `Select` simples acima do gráfico para alternar entre `202604`, `202605`, `202606`. Default: mês atual (junho = `202606`).

```
Meta vs Real — PNT    [Junho 2026 ▼]
```

---

## 4. Sugestão de Visualização

### Recomendação: Barras horizontais agrupadas com indicador de %

**Por que este formato:**

| Critério | Avaliação |
|---|---|
| Comparação Meta vs Real | ✅ Barras lado a lado: percepção imediata do gap |
| Escalabilidade (15–40 portfólios) | ✅ Layout vertical empilha sem perder legibilidade |
| Precisão numérica | ✅ Tooltip com valores exatos; rótulo de % visível |
| Densidade de informação | ✅ 3 dimensões em 1 linha: nome, % atingimento, valor |
| Consistência com design system | ✅ shadcn/ui + Recharts, mesma paleta do Executive |
| Portabilidade (mobile) | ⚠️ Aceitável com scroll vertical |

**Esboço final:**

```
┌─────────────────────────────────────────────────────────┐
│ Meta vs Real — PNT (Caixa + Retomadas)     Junho 2026 ▼ │
│                                                         │
│ ⚠️ Média por headcount — portfolios agregados           │  ← só se isMedia
│                                                         │
│ Portfolio           Real           Meta         Ating.  │
│ ─────────────────────────────────────────────────────── │
│ Mercedes I          R$ 0          R$ 0           —      │  ← cinza (sem meta)
│ BVFinanceira VI     R$ 0          R$ 0           —      │
│ Panamericano XIII   R$ 52k        R$ 0           ∞*     │  ← azul (sem meta, tem real)
│ Santander XXIX      R$ 12k        R$ 66         18%     │  ← vermelho
│ BVFinanceira V      R$ 3.2k       R$ 8.8k       36%     │
│ Santander XXXII     R$ 8.1k       R$ 12.3k      66%     │  ← amarelo
│ BVFinanceira I      R$ 5.5k       R$ 6.0k       92%     │
│ Panamericano XV     R$ 232k       R$ 240k       97%     │  ← verde
│ BVFinanceira VII    R$ 225k       R$ 230k       98%     │
│ Santander XLII      R$ 224k       R$ 224k      100%     │
└─────────────────────────────────────────────────────────┘

* Portfolio sem meta definida mas com produção real.
  Tratar como "não se aplica" — cor neutra, sem %.
```

---

## 5. Sequência de Implementação

### Wave A — ETL (`extrator.py`)
- [x] A1: Criar `dados_metas/` no `.gitignore`
- [x] A2: Extrator com pdfplumber — lógica em `dominios/metas/extrator.py` (reutilizável); `scripts/extrator.py` é CLI fino. Extração **posicional** via `extract_words()` (o PDF não expõe grid p/ `extract_tables`)
- [x] A3: pdfplumber adicionado ao `requirements.txt`
- [x] A4: Testado — 53 registros, checksum PNT 202604 = TOTAL GERAL = 1.761.337
- [x] A5: Documentado no README (Scripts + Endpoints)

### Wave B — Backend
- [x] B1: Rota `GET /dashboard/metas`
- [x] B2: Fallback envelope com `errors` quando JSON ausente
- [x] B3: Endpoint dedicado `GET /dashboard/real-por-portfolio/{db}` (`build_real_por_portfolio_query`, CROSS APPLY TOP 1 — ADR-004), em vez de estender `useProdutividadeData`

### Wave C — Frontend
- [x] C1: Tipos `MetaRow`, `MetasEnvelope`, `fetchMetas()`, `RealPorPortfolioRow`, `fetchRealPorPortfolio()` em `api.ts`
- [x] C2: Hook `useMetasData` com média por headcount (`mediaRow` no modo "Todos")
- [x] C3: `MetaVsRealPanel` — barras horizontais Real vs linha-de-Meta (barras CSS, não Recharts, p/ densidade)
- [x] C4: Banner amber condicional a `isMedia`
- [x] C5: Seletor de mês (default 202606)
- [x] C6: Integrado em `DetalhamentoAgentes.tsx` (após `MetaEditor`, condicional a `envelopeMeta`)
- [x] C7: Dados reais via `GET /dashboard/real-por-portfolio/{db}`
- [ ] C8: Testar com portfolio específico → metas exatas (requer backend prod — não validável local)
- [ ] C9: Testar com "Todos" → média + banner (idem)

---

## 6. Riscos e Pontos de Atenção

| Risco | Severidade | Mitigação |
|---|---|---|
| **Dados reais sem coluna de portfólio** — `useProdutividadeData` pode não incluir `DIV_AUX.CAMPO010` por agente | 🔴 Alto | Verificar query `QUERY_AGENTES_UNIFICADO_BASE`; se ausente, adicionar JOIN com `DIV_AUX` ou criar endpoint separado `GET /dashboard/real-por-portfolio` |
| **Nome do portfólio no PDF ≠ `DIV_AUX.CAMPO010`** | 🟡 Médio | Criar dicionário de mapeamento se necessário; validar com 3–5 portfólios |
| **PDF com merge cells** — pdfplumber pode quebrar linhas | 🟡 Médio | Testar com PDF real; pdfplumber lida bem com tabelas, mas células mescladas no cabeçalho de 2 níveis exigem tratamento |
| **Formato do PDF variar entre trimestres** | 🟡 Médio | Estrutura de colunas parece estável; validar com PDF do trimestre anterior se disponível |
| **Meta mensal vs diária** — dashboard mostra granularidade diária | 🟢 Baixo | Gráfico de metas usa visão mensal; se necessário rateio diário, dividir por dias úteis |
| **Arquivo JSON não encontrado** — frontend não quebra | 🟢 Baixo | API retorna envelope com `errors`; `MetaVsRealPanel` omite-se quando `!envelopeMeta` |
| **Portfólios com meta zero** (ex: `BVFinanceira VI`, `Mercedes I`) | 🟢 Baixo | Tratar como "sem meta definida" — barra cinza, sem % de atingimento |

---

## 7. Verificação

- [x] `python scripts/extrator.py docs/document_pdf.pdf` gera JSON válido (exit 0)
- [x] Soma `meta_pnt` das linhas == `TOTAL GERAL` para cada mês (validação interna passou)
- [x] `meta_pnt = meta_caixa + meta_retomadas_valor` para cada linha (validação interna passou)
- [x] `erro_extracao.log` gerado em falha; `ultimas_metas.json` NÃO sobrescrito (lógica `processar_pdf` levanta `ValueError`; CLI loga e mantém arquivo)
- [x] `GET /dashboard/metas` retorna JSON (lê `ultimas_metas.json` direto)
- [x] `GET /dashboard/metas` retorna envelope com `errors` quando JSON ausente
- [ ] Componente filtra por portfólio específico (requer backend prod — não validável local)
- [x] Modo "Todos" calcula média por headcount (não soma) — `useMetasData` `mediaRow`
- [x] Banner de aviso visível APENAS no modo "Todos" (`isMedia`)
- [x] Seletor de mês alterna entre 202604/202605/202606
- [x] Página não quebra se `ultimas_metas.json` não existir (panel condicional a `envelopeMeta`)
- [~] `npm run build` — `tsc --noEmit` passa (exit 0); bundling Vite OOM no ambiente atual (137), não-bloqueante p/ tipos
- [x] `npm run test` (vitest) — 201 testes, 0 regressões
