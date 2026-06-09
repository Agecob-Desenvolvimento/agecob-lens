# Gráfico: 1ª Parcela por Portfólio · Rentabilidade & Risco

> Documento técnico para análise — 2026-06-08

---

## 1. Arquitetura de dados

```
SQL Server
├─ build_primeira_parcela_por_portfolio_query()   → portfolio_name, qtd_acordos, valor_primeira_parcela
├─ build_excecoes_por_portfolio_query()            → portfolio_name, valor_excecoes
├─ build_quebrados_por_portfolio_query()           → portfolio_name, valor_quebrados
└─ build_rejeitados_por_portfolio_query()          → portfolio_name, valor_rejeitados
       │
       ▼ todas com: PARCELA=0, DT_EMISSAO=hoje, FILTRO_AGENTES_EXCLUIDOS_SQL
       
FastAPI → services/api.ts → useHomeViewModel.ts → portfolioRiskMap
                                                      │
       ppPortfolioRows (1ª parcela)  ─────────────────┘
                    │
                    ▼
       HandoffPortfolioRentabilidade.tsx  (merge + cálculo + ranking)
```

### Status por query

| Query | ID_REC_STATUS | O que retorna |
|---|---|---|
| 1ª parcela (GERADOS) | `1, 2, 3, 10, 12` | `valor_primeira_parcela`, `qtd_acordos` |
| Exceções | `5` | `valor_excecoes` |
| Quebrados | `2` | `valor_quebrados` |
| Rejeitados | `7` | `valor_rejeitados` |

---

## 2. Cálculo de risco por carteira

### 2.1 Fórmula

```
excecoes%   = valor_excecoes   / valor_primeira_parcela × 100
quebrados%  = valor_quebrados  / valor_primeira_parcela × 100
rejeitados% = valor_rejeitados / valor_primeira_parcela × 100

riscoComposto = max(excecoes%, quebrados%, rejeitados%)
```

**Denominador único**: `valor_primeira_parcela` (todas as 3 taxas usam a mesma base).

**Por que `max()` e não soma?**
Exceções (status 5) e quebrados (status 2) são **subconjuntos** do pool GERADOS `(1,2,3,10,12)`. Somá-los inflaciona artificialmente: 5% exceções + 3% quebrados não são 8% de área comprometida — são, no pior caso, 5%. Rejeitados (status 7) são externos ao pool mas normalizados pela mesma base.

**Caps de segurança**: cada dimensão individual e o composto são capados em `Math.min(..., 100)`. Se uma dimensão ultrapassa 100%, um `console.warn` é emitido com os valores brutos em R$ para diagnóstico.

### 2.2 Thresholds

| Nível | Faixa | Cor | Significado tático |
|---|---|---|---|
| **Baixo** | 0 – 25% | `#22c55e` | Operação normal. Nenhuma dimensão preocupa. |
| **Médio** | 25 – 50% | `#f59e0b` | Early warning. Monitore a pior dimensão. |
| **Alto** | > 50% | `#ef4444` | Risco material. Ação necessária. |

---

## 3. Ranking — como as carteiras aparecem

### 3.1 Ordenação (3 níveis)

```
.sort((a, b) =>
  a.compositeRisk - b.compositeRisk    // 1º: risco crescente (Baixo → Médio → Alto)
  || b.qtd - a.qtd                     // 2º: qtd acordos decrescente
  || b.value - a.value                 // 3º: valor decrescente
)
```

### 3.2 Por que `qtd_acordos` entra no ranking

**Problema**: sem `qtd_acordos`, uma carteira com 4 acordos e risco 2% venceria uma com 40 acordos e risco 3%. A de 4 acordos é trivial de manter — poucos clientes, fácil controle. A de 40 acordos representa volume real e sustentabilidade.

**Solução**: dentro do mesmo nível de risco, carteiras com **mais acordos sobem**. Isso premia escala e pune concentração.

### 3.3 Top 15

Apenas as 15 melhores pelo ranking são exibidas. A barra de valor (`maxBar`) é calculada sobre essas 15 — a referência visual é sempre relativa ao conjunto visível.

### 3.4 Exemplo de ranking

| # | Carteira | Risco | Qtd | Valor | Por que está aqui |
|---|---|---|---|---|---|
| 1 | CARTEIRA A | 3% Baixo | 42 | R$ 500k | Baixo risco, alto volume, alto valor |
| 2 | CARTEIRA B | 3% Baixo | 38 | R$ 420k | Mesmo risco, menos volume e valor |
| 3 | CARTEIRA C | 8% Baixo | 55 | R$ 380k | Risco ainda Baixo, maior volume |
| 4 | CARTEIRA D | 12% Médio | 30 | R$ 600k | Primeiro Médio — apesar do valor alto |
| ... | | | | | |
| 14 | CARTEIRA M | 45% Médio | 8 | R$ 80k | Risco elevado, pouco volume |
| 15 | CARTEIRA Z | 62% Alto | 15 | R$ 120k | Último lugar — Alto risco |

---

## 4. Elementos visuais por linha

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ● CARTEIRA_A   [█████████████████████░░░░]  R$ 500 mil   42  [███░]  3% │
│   ↑             ↑                           ↑             ↑     ↑     ↑
│   dot           barra de valor              1ª parcela    qtd   stacked score
│   (nível risco) (relativa ao max das 15)    compact BRL         bar
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Dot de risco
- Cor = nível do risco composto (emerald / amber / red)
- Hover no dot: título "Risco composto: Baixo (3.2%)"

### 4.2 Barra de valor
- Largura = `valor / maxBar × 100` (maxBar = maior valor entre as 15)
- Cor = mesma do dot, opacidade 0.7
- Carteiras de Alto risco também recebem fundo `bg-rose-50/30` na linha inteira

### 4.3 Stacked risk bar (barra empilhada)
- Largura total = `riscoComposto` % do container (cap 100%)
- Segmentos internos proporcionais à contribuição de cada dimensão:
  - **Vermelho** `#ef4444`: quebrados — perda concretizada
  - **Âmbar** `#f59e0b`: exceções — valor em risco
  - **Amarelo** `#eab308`: rejeitados — oportunidade perdida
- A pior dimensão (a que define o score) ocupa a maior fatia

### 4.4 Score
- Label (Baixo / Médio / Alto) + percentual inteiro
- Ex: `Baixo 3%`, `Médio 28%`, `Alto 62%`

---

## 5. Tooltip (hover na stacked bar)

```
┌───────────────────────────┐
│ CARTEIRA_A                │
│                           │
│ ● Quebrados: 1.2%         │
│ ● Exceções: 2.8%          │
│ ● Rejeitados: 3.0%        │
│ ───────────────────       │
│ Risco (pior dimensão): 3.0% │
└───────────────────────────┘
```

Mostra o breakdown exato das 3 dimensões e confirma qual está ditando o score.

---

## 6. Legenda (rodapé)

```
● Baixo ≤25%   ● Médio 25–50%   ● Alto >50%   |   ● Quebrados   ● Exceções   ● Rejeitados
```

---

## 7. Relação risco × acordos × valor

### 7.1 Interpretação por posição no ranking

| Posição | Perfil | Ação sugerida |
|---|---|---|
| Topo (verde) | Baixo risco + alto volume + alto valor | Portfólios âncora — expandir |
| Meio-superior (verde) | Baixo risco + baixo volume | Nichos seguros — crescer volume |
| Meio (âmbar) | Médio risco | Monitorar pior dimensão |
| Meio-inferior (âmbar) | Médio risco + baixo volume | Carteiras em degradação |
| Fim (vermelho) | Alto risco | Intervenção ou redução de exposição |

### 7.2 O que o ranking NÃO mede

- **Tendência**: o risco é uma foto do dia. Uma carteira subindo de 20% para 45% em 3 dias não é capturada.
- **Concentração de agente**: uma carteira com 40 acordos de um único agente tem risco de dependência que a fórmula não vê.
- **Sazonalidade**: alguns portfólios têm picos de exceções em datas específicas do mês.

---

## 8. Diagnóstico de anomalias

### 8.1 Risco > 100%

Se o console do navegador exibir:
```
[HandoffPortfolioRentabilidade] Risco >100% para "PANAMERICANO XV":
exceções=195.0% quebrados=0.0% rejeitados=0.0%
(1ª parcela = R$ 5000.00 | exc = R$ 9750.00 | ...)
```

**Causa**: o `valor_excecoes` (R$ 9750) é maior que `valor_primeira_parcela` (R$ 5000) para a mesma carteira no mesmo dia. Isso indica que as queries de risco estão retornando dados de uma **janela maior** que a query de 1ª parcela, ou há duplicação de NR_RECEBIMENTO no JOIN.

**Ação**: verificar se `build_excecoes_por_portfolio_query` está filtrando `DT_EMISSAO = hoje` e se `PARCELA = 0` está aplicado.

### 8.2 Todas as carteiras como Alto risco

Se o ranking mostra maioria vermelha:
- Thresholds podem estar baixos demais para o perfil do negócio
- Ou os dados de risco estão inflados (ver 8.1)
- Ajustar thresholds em `HandoffPortfolioRentabilidade.tsx` (constante `HIGH_RISK_THRESHOLD` e limiares em `compositeRiskLevel`)

---

## 9. Arquivos

| Camada | Arquivo | Linha |
|---|---|---|
| Backend — 1ª parcela | `dominios/graficos/queries.py` | 528-563 |
| Backend — exceções | `dominios/graficos/queries.py` | 70-106 |
| Backend — quebrados | `dominios/graficos/queries.py` | 261-295 |
| Backend — rejeitados | `dominios/graficos/queries.py` | 224-258 |
| Config — STATUS_GERADOS | `config/settings.py` | 54-56 |
| API — fetch functions | `agecob-lens/src/services/api.ts` | 657, 420, 514, 502 |
| ViewModel — riskMap | `agecob-lens/src/hooks/useHomeViewModel.ts` | 273-303 |
| Tipos — PortfolioRiskEntry | `agecob-lens/src/types/viewModels.ts` | 14-18 |
| **Componente** | `agecob-lens/src/components/executive/HandoffPortfolioRentabilidade.tsx` | 1-300 |
| Página | `agecob-lens/src/pages/Index.tsx` | 81-88 |

---

## 10. Parâmetros ajustáveis

| Parâmetro | Local | Default | Efeito |
|---|---|---|---|
| `HIGH_RISK_THRESHOLD` | Componente, linha 31 | `50` | Limite Baixo→Médio e toggle |
| Limiar Baixo | `compositeRiskLevel()`, linha 34 | `25` | Abaixo disso é verde |
| Limiar Médio | `compositeRiskLevel()`, linha 35 | `HIGH_RISK_THRESHOLD` | Entre 25 e 50 é âmbar |
| Top N | `useMemo`, linha 95 | `15` | Quantas carteiras exibir |
| Ordenação | `useMemo`, linha 91 | risco→qtd→valor | Critérios de ranking |
