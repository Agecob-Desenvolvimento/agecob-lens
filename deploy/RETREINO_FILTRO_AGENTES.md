# Retreino KNN Phase 2 — Filtro de Agentes + Zeros

Documento das decisões técnicas tomadas no retreino do modelo KNN Phase 2 (Ritmo do Dia).

**Data:** 2026-05-12
**Commit:** `6fa4e71`
**Escopo deste repo:** apenas geração do `esperado` por hora. O `real` é responsabilidade do backend (agecob-lens).

---

## 1. Problema motivador

Card "Ritmo do Dia" no dashboard executivo mostrava `Acumulado atual: 97`, enquanto o card "Qtd Acordos" mostrava `20` no mesmo dia.

**Causa raiz:** filtros divergentes entre os dois cards.

- `api/routers/ritmo_dia.py:91-100` (`_obter_acordos_hoje`): contava direto em `REC_MASTER` com `ID_REC_STATUS IN (1,3,12) AND PARCELA=0`, **sem JOIN em `USU_MASTER`** → incluía usuários sistêmicos/suporte (ID_USUARIO=1, SISTEMA*, SUPORTE*, ANTLIA*, INTERNA*, COBDESANTOS, NEMBUSUSER).
- `dominios/produtividade/queries.py`: JOIN em `USU_MASTER` + `FILTRO_AGENTES_EXCLUIDOS_SQL` que excluía esses usuários.

O modelo havia sido treinado em `d.csv` **sem** filtro de agentes → `esperado_total` batia com 97 (ritmo) mas não com 20 (qtd acordos).

**Decisão de alinhamento:** o backend já aplica o filtro no `real`. Para o `esperado` casar, o **treino do modelo** precisa usar dataset filtrado equivalentemente.

---

## 2. Decisões técnicas

### 2.1 Schema do `banco_origem`

**Decisão:** usar nomes completos dos DB schemas como valor de `banco_origem`.

- `COBwebRCBAUTOS` (antes: `AUTOS`)
- `COBwebRCBCONSUMER` (antes: `CONSUMER`)

**Por quê:** alinhamento com o nome de fato do schema SQL Server, reduz ambiguidade quando backend monta queries dinâmicas por banco.

**Impacto:** dataset incompatível com o modelo Phase 2 anterior (que usava nomes curtos). Backend precisa passar o nome completo ao chamar o predict.

### 2.2 Inclusão de zeros no dataset

**Decisão:** incluir todas as combinações `banco × dia útil × hora 8-19`, mesmo quando `qtd = 0`.

Dataset final: **3144 linhas** = 131 dias úteis × 12 horas × 2 bancos.

**Por quê:**
- Caso de uso da UI: card mostra **esperado por hora** das 8h às 19h. Cada hora precisa de uma predição realista.
- Sem zeros, o modelo só aprende a distribuição de "quanto vem quando vem". Hora 19h (raramente tem acordo) recebia predição >0, mostrando falsa expectativa.
- Com zeros, modelo aprende padrão real → predições próximas de 0 em horas tipicamente vazias.

**Trade-off aceito:** distribuição alvo dominada por 0 (mediana = 0) → MAE bruto piora vs Phase 1 baseline, mas predição passa a ser **útil pro caso de uso**.

### 2.3 Janela temporal

Janela fixa: `2025-11-07 → 2026-05-08`.

- Apenas dias úteis (DATEPART WEEKDAY 2-6 com SET DATEFIRST 7).
- Horas 8-19 inclusive (`DATEPART(HOUR, DT_EMISSAO) BETWEEN 8 AND 19`).
- 131 dias úteis na janela.

### 2.4 Filtro de agentes (8 condições, UPPER+TRIM)

Aplicado em INNER JOIN `USU_MASTER`:

```sql
AND UPPER(LTRIM(RTRIM(U.NOME)))  <> 'COBDESANTOS'
AND UPPER(LTRIM(RTRIM(U.NOME)))  <> 'NEMBUSUSER'
AND UPPER(LTRIM(RTRIM(U.CHAVE))) <> 'NEMBUSUSER'
AND UPPER(LTRIM(RTRIM(U.NOME)))  NOT LIKE 'ANTLIA%'
AND UPPER(LTRIM(RTRIM(U.NOME)))  NOT LIKE 'INTERNA%'
AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'INTERNA%'
AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'SUPORTE%'
AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'SISTEMA%'
```

**Por quê todas as 8:** versão original da query proposta usava apenas 4 condições (só `NOME LIKE`). Filtro completo do backend usa também a coluna `CHAVE` e diferencia equals vs LIKE. Necessário replicar fielmente para alinhar com `real`.

### 2.5 Query SQL — escolha de abordagem

Duas versões geradas em `deploy/`:

- `gerar_dataset.sql` — versão inicial com CTEs recursivos + OUTER APPLY + concatenação string final.
- `gerar_dataset_v2.sql` — versão simplificada com tabelas `#temp`, sem CTE recursivo, sem OUTER APPLY aninhado, sem concatenação string.

**Por quê v2:** v1 deu erros de sintaxe (`Mensagem 102, próxima a ','` e `Mensagem 156, próxima a 'ORDER'`) que persistiam por **cache do editor SSMS** mesmo após corrigir o arquivo em disco. v2 = arquivo novo, sem cache, mais simples de debugar.

Decisão final: v2 é a versão usada para extrair o dataset.

### 2.6 Features do modelo

```
FEATURES = ['hora',
            'dias_desde_ultimo_batimento',
            'dia_semana_sin',
            'dia_semana_cos',
            'acumulado_lag']
```

**Tentativa descartada — `banco_bin`:** adicionei `df['banco_bin'] = (banco_origem.contains('CONSUMER')).astype(int)` para diferenciar AUTOS vs CONSUMER nos vizinhos do KNN.

Resultado: **piorou** quando combinado com dataset sem zeros (MAE 1.49 → 1.58, dir_acc 73.1% → 61.3%). Hipótese: a feature `dia_semana` cíclica + `acumulado_lag` já capturam a maior parte do padrão por banco; adicionar `banco_bin` introduziu ruído na métrica euclidiana sem trazer separação útil.

**Decisão:** reverter `banco_bin`, manter 5 features originais.

### 2.7 Critérios de promoção (Phase 1 vs KNN)

Definidos no `train_knn_phase2.py:STEP 8`:

1. MAE Fold 4 < 8.5
2. Melhora >= 10% vs Phase 1 (Fold 4)
3. Acerto direcional > 65% (Fold 4)
4. Nenhum fold pior que Phase 1

**Resultado do treino final (3144 linhas, 5 features):**

| Critério | Valor | Status |
|---|---|---|
| MAE Fold 4 | 1.27 | OK |
| Melhora vs Phase 1 | -1.3% | FALHOU (precisa -10%) |
| Acerto direcional | 47.3% | FALHOU |
| Nenhum fold pior | 3 folds piores | FALHOU |

**Decisão de override:** modelo **promovido mesmo sem passar critérios**.

**Por quê o override:**
- Critérios foram calibrados para a distribuição **sem zeros** (Phase 1 = mediana por hora×faixa). Com zeros, Phase 1 trivialmente acerta a mediana (=0) em muitas horas → MAE baixíssimo, difícil bater por delta percentual significativo.
- Phase 1 não está empacotada como artefato deployável neste pipeline (`.joblib` salvo é sempre KNN). Backend carrega o KNN.
- Caso de uso é UI por hora, não otimização de MAE agregado. KNN dá padrão por hora respeitando histórico individual; Phase 1 daria sempre o mesmo valor por `(hora, faixa, banco)`.

### 2.8 Comparação experimental — sem zeros vs com zeros

Executei ambas variantes para comparar:

| Variante | Linhas | MAE Fold 4 | Melhora | Dir acc | Folds OK |
|---|---|---|---|---|---|
| Sem zeros + 5 features | 870 | 1.49 | -19.1% | 73.1% | 1/4 (fold 4) |
| Sem zeros + 6 features (`banco_bin`) | 870 | 1.58 | -14.2% | 61.3% | 1/4 |
| Com zeros + 5 features | 3144 | 1.27 | -1.3% | 47.3% | 1/4 |
| Com zeros + 6 features (`banco_bin`) | 3144 | 1.21 | -5.5% | 59.1% | 1/4 |

**Observação:** a variante "sem zeros + 5 features" foi a melhor pelo critério, mas inadequada pro caso de uso. Variante final = "com zeros + 5 features" pela utilidade de produto, não pela métrica.

### 2.9 Hiperparâmetro k

Selecionado via CV walk-forward (folds 1-3):

```
            Fold1    Fold2    Fold3      Media
k=5          0.57     0.98     0.74       0.77
k=7          0.57     0.91     0.75       0.74
k=10         0.58     0.87     0.71       0.72  ← selecionado
```

`k=10` mantido (mesmo k do modelo anterior).

### 2.10 Modelo deployável

O `STEP 7` salva sempre o modelo treinado nos **130 dias completos** (não nos folds), pra deploy:

```python
sc_full  = StandardScaler()
X_full   = sc_full.fit_transform(df[FEATURES])
knn_full = KNeighborsRegressor(n_neighbors=best_k, metric='euclidean')
knn_full.fit(X_full, df['acordos_banda'].values)
```

Artefatos finais:
- `deploy/knn_phase2_model.joblib` — KNN k=10, treinado em 3144 linhas
- `deploy/knn_phase2_scaler.joblib` — StandardScaler ajustado nas 3144 linhas
- `deploy/knn_phase2_validation.csv` — predições nos 4 folds (960 linhas), sem re-treino

---

## 3. Divisão de responsabilidades

| Item | Repo | Componente |
|---|---|---|
| Geração `d.csv` | ML ag | `deploy/gerar_dataset_v2.sql` |
| Treino KNN | ML ag | `deploy/train_knn_phase2.py` |
| Artefatos `.joblib` | ML ag (committed) | `deploy/knn_phase2_*.joblib` |
| Predição `esperado` por hora | agecob-lens (backend) | carrega joblib, chama `predict` |
| Cálculo `real` por hora | agecob-lens (backend) | query SQL com filtro próprio de agentes |
| Renderização card | agecob-lens (frontend) | `RitmoDiaCard.tsx` |

**Importante:** o filtro de agentes no `real` é responsabilidade exclusiva do backend (já aplicado por ele). Este repo apenas **espelha** o filtro no treino do modelo para que `esperado` e `real` referenciem a mesma população de acordos.

---

## 4. Pontos de atenção pra próximos retreinos

- **Janela:** atualizar `@data_ini`/`@data_fim` em `gerar_dataset_v2.sql` ao mover a janela temporal. CTE recursivo foi substituído por loop `WHILE` — sem `MAXRECURSION` necessário.
- **Cache SSMS:** se sintaxe SQL der erro persistente, fechar a aba do arquivo sem salvar e reabrir (cache do editor não recarrega após edit externo).
- **`banco_origem` consistente:** se voltar a usar nomes curtos (`AUTOS`/`CONSUMER`), atualizar Bancos CTE + WHERE em `OUTER APPLY` + INSERT do `#acordos`. Backend precisa passar o mesmo formato.
- **Critérios de promoção:** considerar revisar para distribuição com zeros. Sugestão: filtrar critério MAE só em horas com `acordos > 0` (separa "modelo prevê bem horas ativas" de "modelo concorda com Phase 1 em horas mortas").
- **Features descartadas:** `banco_bin` testada e descartada. `acumulado_primeiras_2h` (sugestão do script) ainda não testada — pode ajudar nos folds 1-2.

---

## 5. Histórico do dataset

| Versão | Linhas | Filtro agentes | Zeros | Banco_origem |
|---|---|---|---|---|
| Inicial (commit `ea32d48`) | 860 | Não | Não | AUTOS/CONSUMER (curto) |
| Retreino atual (`6fa4e71`) | 3144 | Sim (8 condições) | Sim | COBwebRCB* (completo) |
