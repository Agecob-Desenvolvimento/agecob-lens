"""
KNN Phase 2 — Ritmo do Dia, modelo de VALOR esperado gerado.

Espelha train_knn_phase2.py (modelo de quantidade), mas alvo = valor (R$) em
vez de acordos_banda. Features iguais ao contrato já deployado em
api/routers/ritmo_dia.py:_esperado (7 features, banco_bin + acum_primeiras_2h
inclusos — divergem do FEATURES de 5 colunas do script antigo de quantidade,
que ficou desatualizado em relacao ao artefato em producao).

Fonte: deploy/d_valor.csv (gerado por deploy/gerar_dataset_valor.py).
Holdout simples (ultimos 15 dias uteis) para escolha de k — nao repete o
walk-forward de 4 folds do script de quantidade (fora de escopo aqui).
Sem criterio formal de promocao (vs. STEP 8 do script de quantidade) — ver
deploy/CAVEAT_PROMOCAO_MODELO_VALOR.md.

Artefatos: knn_phase2_valor_model.joblib, knn_phase2_valor_scaler.joblib
"""
import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsRegressor
from sklearn.metrics import mean_absolute_error

DS_MIN, DS_PERIOD = 2, 5
BANCO_BIN = {"COBwebRCBAUTOS": 0, "COBwebRCBCONSUMER": 1}
FEATURES = ["hora", "dias_desde_ultimo_batimento", "dia_semana_sin", "dia_semana_cos",
            "acumulado_lag", "banco_bin", "acum_primeiras_2h"]

print("=" * 62)
print("STEP 1 — DATA")
print("=" * 62)

df = pd.read_csv("deploy/d_valor.csv")
df["dia"] = pd.to_datetime(df["dia"])
df = df.sort_values(["banco_origem", "dia", "hora"]).reset_index(drop=True)

df["acumulado_lag"] = (
    df.groupby(["banco_origem", "dia"])["valor_acumulado_ate_hora"]
      .shift(1)
      .fillna(0.0)
)

acum_2h = (
    df[df["hora"].isin([8, 9])]
      .groupby(["banco_origem", "dia"])["valor"]
      .sum()
      .rename("acum_2h_full")
)
df = df.merge(acum_2h, on=["banco_origem", "dia"], how="left")
df["acum_2h_full"] = df["acum_2h_full"].fillna(0.0)
df["acum_primeiras_2h"] = np.where(df["hora"] >= 10, df["acum_2h_full"], 0.0)

df["dia_semana_sin"] = np.sin(2 * np.pi * (df["dia_semana"] - DS_MIN) / DS_PERIOD)
df["dia_semana_cos"] = np.cos(2 * np.pi * (df["dia_semana"] - DS_MIN) / DS_PERIOD)
df["banco_bin"] = df["banco_origem"].map(BANCO_BIN)

print(f"Shape: {df.shape}  |  dias: {df['dia'].nunique()}  |  bancos: {sorted(df['banco_origem'].unique())}")
print(f"valor — min:{df['valor'].min():.2f}  max:{df['valor'].max():.2f}  median:{df['valor'].median():.2f}")

print()
print("=" * 62)
print("STEP 2 — HOLDOUT (ultimos 15 dias uteis) + SELECAO DE k")
print("=" * 62)

dias_ord = sorted(df["dia"].unique())
holdout_dias = set(dias_ord[-15:])
train_mask = ~df["dia"].isin(holdout_dias)
test_mask = df["dia"].isin(holdout_dias)

fd_tr, fd_te = df[train_mask], df[test_mask]
print(f"Treino: {fd_tr['dia'].nunique()} dias ({len(fd_tr)} linhas)  |  "
      f"Teste: {fd_te['dia'].nunique()} dias ({len(fd_te)} linhas)")

sc = StandardScaler()
Xtr = sc.fit_transform(fd_tr[FEATURES])
Xte = sc.transform(fd_te[FEATURES])
ytr = fd_tr["valor"].values
yte = fd_te["valor"].values

best_k, best_mae = None, float("inf")
for k in [5, 7, 10]:
    knn = KNeighborsRegressor(n_neighbors=k, metric="euclidean")
    knn.fit(Xtr, ytr)
    preds = knn.predict(Xte)
    mae = mean_absolute_error(yte, preds)
    print(f"k={k:<3} MAE={mae:.2f}")
    if mae < best_mae:
        best_k, best_mae = k, mae

print(f"\nk selecionado: {best_k}  (MAE holdout: R$ {best_mae:.2f})")

print()
print("=" * 62)
print("STEP 3 — SALVAR ARTEFATOS (treino completo, 90 dias)")
print("=" * 62)

sc_full = StandardScaler()
X_full = sc_full.fit_transform(df[FEATURES])
knn_full = KNeighborsRegressor(n_neighbors=best_k, metric="euclidean")
knn_full.fit(X_full, df["valor"].values)

joblib.dump(knn_full, "deploy/knn_phase2_valor_model.joblib")
joblib.dump(sc_full, "deploy/knn_phase2_valor_scaler.joblib")
print("deploy/knn_phase2_valor_model.joblib")
print("deploy/knn_phase2_valor_scaler.joblib")
print(f"Features: {FEATURES}")
print(f"k={best_k}, metric=euclidean")
