# Caveat de Promoção — Modelo de Valor Esperado (KNN Phase 2)

**Commit de origem:** `5eda3d7` (feat(ritmo-dia): expected generated value model)
**Escopo:** `deploy/train_knn_valor.py` → `knn_phase2_valor_model.joblib` / `knn_phase2_valor_scaler.joblib`, consumidos por `api/routers/ritmo_dia.py` (`_load_valor_artifacts()` / `_load_valor_lookup()`).

---

## 1. Diferença em relação ao modelo de quantidade

`train_knn_phase2.py` (modelo de quantidade, `acordos_banda`) só promove o
artefato após passar por critério formal — ver `STEP 8` do script e
`RETREINO_FILTRO_AGENTES.md` §2.7:

1. MAE Fold 4 < 8.5
2. Melhora ≥ 10% vs. baseline Phase 1
3. Acerto direcional > 65%
4. Nenhum fold pior que Phase 1

`train_knn_valor.py` (modelo de valor, R$) **não tem equivalente**. O script faz
apenas:

- holdout único (últimos 15 dias úteis) para escolher `k` entre `{5, 7, 10}`
- treino final nos 90 dias completos, sem re-avaliação pós-treino
- sem comparação contra baseline (mediana de `valor` por hora/faixa/banco)
- sem acerto direcional
- sem walk-forward multi-fold

## 2. Resultado medido (review PR #17)

Holdout: **MAE ≈ R$ 2.542**. A mediana de `valor` por hora no dataset
(`deploy/d_valor.csv`) fica na faixa **R$ 0–1.500** — o erro médio do modelo
supera boa parte dos valores típicos que está tentando prever.

## 3. Status

Artefato foi promovido e está em produção mesmo sem esse critério avaliado
formalmente. `api/routers/ritmo_dia.py` carrega o modelo incondicionalmente
(sem fallback para um baseline caso o modelo esteja fora de um range aceitável).

## 4. Próximos passos, se for revisar

- Adicionar bloco `STEP 8`-style comparando contra baseline (mediana por
  hora×faixa×banco, análogo ao Phase 1 de quantidade).
- Trocar holdout único por walk-forward de múltiplos folds (mesmo padrão do
  script de quantidade).
- Avaliar se MAE absoluto é a métrica certa dada a cauda longa de `valor`
  (poucos acordos de valor muito alto puxam o erro médio) — considerar MAE
  por faixa de valor, ou erro percentual, em vez de R$ bruto agregado.
