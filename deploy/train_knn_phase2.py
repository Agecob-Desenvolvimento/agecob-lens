"""
KNN Phase 2 — Ritmo do Dia (Model A: acordos_banda)
Walk-forward 4 folds, StandardScaler, cyclic dia_semana, lagged acumulado.
Target: acordos_banda (incremental por hora).
Artifacts: knn_phase2_model.joblib, knn_phase2_scaler.joblib, knn_phase2_validation.csv

Features:
  hora                       — qual hora está sendo prevista (8–19)
  dias_desde_ultimo_batimento — frescor da carteira (contínuo)
  dia_semana_sin/cos         — codificação cíclica (2=seg…6=sex, período 5)
  acumulado_lag              — acumulado ANTES desta hora (shift(1) dentro do dia)
                               No momento de prever a banda H, o sistema já sabe
                               o total até H-1 → sem leakage.

Fold structure (130 dias totais):
  Fold 1: treino dias[0:90],  teste dias[90:100]
  Fold 2: treino dias[0:100], teste dias[100:110]
  Fold 3: treino dias[0:110], teste dias[110:120]
  Fold 4: treino dias[0:120], teste dias[120:130]  ← holdout final

K selecionado por CV folds 1-3. Fold 4 é avaliação final.
Fold results cacheados → step 6 (CSV) não re-treina.
"""
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsRegressor
from sklearn.metrics import mean_absolute_error
import joblib
from datetime import datetime


def dia_em_andamento() -> bool:
    """True se agora é horário operacional da Agecob (seg–sex 08:00–19:30)."""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    h = now.hour + now.minute / 60
    return 8.0 <= h < 19.5


# ── STEP 1: DATA ──────────────────────────────────────────────────────────
print('=' * 62)
print('STEP 1 — DATA PREPARATION')
print('=' * 62)

COLS = ['banco_origem', 'dia', 'hora', 'dia_semana', 'total_dia',
        'acumulado_ate_hora', 'proporcao_ate_hora',
        'data_ultimo_batimento', 'dias_desde_ultimo_batimento', 'faixa_batimento']

df = pd.read_csv('d.csv', sep=';', decimal=',', names=COLS)
df['dia']                         = pd.to_datetime(df['dia'], errors='coerce')
df['hora']                        = pd.to_numeric(df['hora'], errors='coerce')
df['dia_semana']                  = pd.to_numeric(df['dia_semana'], errors='coerce')
df['acumulado_ate_hora']          = pd.to_numeric(df['acumulado_ate_hora'], errors='coerce')
df['dias_desde_ultimo_batimento'] = pd.to_numeric(df['dias_desde_ultimo_batimento'], errors='coerce')
df = df.dropna(subset=['dia', 'hora']).reset_index(drop=True)

n_null = int(df['dias_desde_ultimo_batimento'].isna().sum())
df['dias_desde_ultimo_batimento'] = df['dias_desde_ultimo_batimento'].fillna(30)
print(f'NULLs imputados (dias_desde_batimento=30): {n_null}')

df = df.sort_values(['banco_origem', 'dia', 'hora']).reset_index(drop=True)

# acordos_banda: incremental por hora dentro do dia (por banco)
df['acordos_banda'] = (
    df.groupby(['banco_origem', 'dia'])['acumulado_ate_hora']
      .diff()
      .fillna(df['acumulado_ate_hora'])
      .astype(int)
      .clip(lower=0)
)

# acumulado_lag: acumulado ENTRANDO nesta hora (shift(1) dentro do grupo)
# hora=8 (primeira hora) recebe 0 — sem acordos anteriores naquele dia.
df['acumulado_lag'] = (
    df.groupby(['banco_origem', 'dia'])['acumulado_ate_hora']
      .shift(1)
      .fillna(0)
      .astype(int)
)

# dia_semana cíclico: 2=seg…6=sex → período=5
DS_MIN, DS_PERIOD = 2, 5
df['dia_semana_sin'] = np.sin(2 * np.pi * (df['dia_semana'] - DS_MIN) / DS_PERIOD)
df['dia_semana_cos'] = np.cos(2 * np.pi * (df['dia_semana'] - DS_MIN) / DS_PERIOD)

print(f'Shape: {df.shape}  |  dias: {df["dia"].nunique()}  |  bancos: {sorted(df["banco_origem"].unique())}')
print(f'acordos_banda — min:{df["acordos_banda"].min()}  max:{df["acordos_banda"].max()}  '
      f'median:{df["acordos_banda"].median():.1f}')

FEATURES = ['hora', 'dias_desde_ultimo_batimento', 'dia_semana_sin', 'dia_semana_cos', 'acumulado_lag']

# ── STEP 2: SPLIT TEMPORAL ────────────────────────────────────────────────
print()
print('=' * 62)
print('STEP 2 — SPLIT TEMPORAL')
print('=' * 62)

dias_ord    = sorted(df['dia'].unique())
N_DIAS      = len(dias_ord)
FOLD_SIZE   = 10
FOLD_STARTS = [N_DIAS - 40, N_DIAS - 30, N_DIAS - 20, N_DIAS - 10]

assert N_DIAS >= 50, f'Mínimo 50 dias para 4 folds, encontrado {N_DIAS}'
print(f'N_DIAS={N_DIAS}  FOLD_STARTS={FOLD_STARTS}  FOLD_SIZE={FOLD_SIZE}')

for i, fs in enumerate(FOLD_STARTS):
    d0 = pd.Timestamp(dias_ord[fs]).date()
    d1 = pd.Timestamp(dias_ord[fs + FOLD_SIZE - 1]).date()
    print(f'  Fold {i+1}: treino dias[0:{fs}]  teste [{d0} -> {d1}]')


def build_split(fold_start: int):
    mask_test  = df['dia'].isin(set(dias_ord[fold_start:fold_start + FOLD_SIZE]))
    mask_train = df['dia'].isin(set(dias_ord[:fold_start]))
    return df[mask_train].copy().reset_index(drop=True), df[mask_test].copy().reset_index(drop=True)


def compute_phase1_preds(fd_train: pd.DataFrame, fd_test: pd.DataFrame) -> np.ndarray:
    """
    Phase 1 baseline: mediana de acordos_banda por (hora, faixa_batimento).
    Fallback: mediana por hora quando célula ausente.
    Vetorizado via merge — sem iterrows.
    """
    lk = (fd_train.groupby(['hora', 'faixa_batimento'])['acordos_banda']
                  .median().round().astype(int)
                  .rename('p1_pred')
                  .reset_index())
    fb = (fd_train.groupby('hora')['acordos_banda']
                  .median().round().astype(int)
                  .rename('p1_fallback')
                  .reset_index())

    result = fd_test[['hora', 'faixa_batimento']].copy()
    result = result.merge(lk, on=['hora', 'faixa_batimento'], how='left')
    result = result.merge(fb, on='hora', how='left')
    result['p1_pred'] = result['p1_pred'].where(result['p1_pred'].notna(), result['p1_fallback'])
    return result['p1_pred'].fillna(0).values


# ── STEP 3: K SELECTION (folds 1–3) + cache fold data ────────────────────
print()
print('=' * 62)
print('STEP 3 — K SELECTION (walk-forward folds 1–3)')
print('=' * 62)

K_OPTS = [5, 7, 10]
cv_knn = {k: [] for k in K_OPTS}
cv_p1  = []

# Cache: list of dicts, one per fold — reused in step 6 (no re-training)
fold_cache = []

for fold_idx in range(3):
    fd_tr, fd_te = build_split(FOLD_STARTS[fold_idx])
    y_te = fd_te['acordos_banda'].values
    p1_p = compute_phase1_preds(fd_tr, fd_te)
    cv_p1.append(mean_absolute_error(y_te, p1_p))

    sc  = StandardScaler()
    Xtr = sc.fit_transform(fd_tr[FEATURES])
    Xte = sc.transform(fd_te[FEATURES])
    ytr = fd_tr['acordos_banda'].values

    fold_preds = {'fd_te': fd_te, 'y_te': y_te, 'p1_pred': p1_p}
    for k in K_OPTS:
        knn = KNeighborsRegressor(n_neighbors=k, metric='euclidean')
        knn.fit(Xtr, ytr)
        preds = np.round(knn.predict(Xte)).astype(int)
        cv_knn[k].append(mean_absolute_error(y_te, preds))
        fold_preds[f'knn_pred_k{k}'] = preds

    fold_cache.append(fold_preds)

print(f'{"":8} {"Fold1":>8} {"Fold2":>8} {"Fold3":>8} {"Media":>10}')
print('-' * 48)
print(f'{"Phase1":8} {cv_p1[0]:>8.2f} {cv_p1[1]:>8.2f} {cv_p1[2]:>8.2f} {np.mean(cv_p1):>10.2f}')
print('-' * 48)

best_k, best_cv_mae = None, float('inf')
for k in K_OPTS:
    vals = cv_knn[k]
    m    = np.mean(vals)
    print(f'{"k="+str(k):8} {vals[0]:>8.2f} {vals[1]:>8.2f} {vals[2]:>8.2f} {m:>10.2f}')
    if m < best_cv_mae:
        best_cv_mae, best_k = m, k

print(f'\nk selecionado: {best_k}  (MAE médio folds 1-3: {best_cv_mae:.2f})')

# ── STEP 4: FOLD 4 — HOLDOUT FINAL ───────────────────────────────────────
print()
print('=' * 62)
print(f'STEP 4 — FOLD 4 HOLDOUT (k={best_k})')
print('=' * 62)

fd_tr4, fd_te4 = build_split(FOLD_STARTS[3])
y_tr4 = fd_tr4['acordos_banda'].values
y_te4 = fd_te4['acordos_banda'].values

sc4  = StandardScaler()
Xtr4 = sc4.fit_transform(fd_tr4[FEATURES])
Xte4 = sc4.transform(fd_te4[FEATURES])

knn4 = KNeighborsRegressor(n_neighbors=best_k, metric='euclidean')
knn4.fit(Xtr4, y_tr4)
knn_pred4 = np.round(knn4.predict(Xte4)).astype(int)
p1_pred4  = compute_phase1_preds(fd_tr4, fd_te4)

# Cache fold 4 (same structure as folds 1-3)
fold_cache.append({
    'fd_te':               fd_te4,
    'y_te':                y_te4,
    'p1_pred':             p1_pred4,
    f'knn_pred_k{best_k}': knn_pred4,
})

mae_knn4 = mean_absolute_error(y_te4, knn_pred4)
mae_p1_4 = mean_absolute_error(y_te4, p1_pred4)

# Acerto direcional: sign(KNN - P1) == sign(real - P1), excluindo empates
knn_dev  = knn_pred4.astype(float) - p1_pred4
real_dev = y_te4.astype(float)     - p1_pred4
mask_nz  = real_dev != 0
dir_acc  = (np.sign(knn_dev[mask_nz]) == np.sign(real_dev[mask_nz])).mean()

print(f'Treino: {pd.Timestamp(fd_tr4["dia"].min()).date()} -> '
      f'{pd.Timestamp(fd_tr4["dia"].max()).date()}  ({fd_tr4["dia"].nunique()} dias, {len(fd_tr4)} linhas)')
print(f'Teste:  {pd.Timestamp(fd_te4["dia"].min()).date()} -> '
      f'{pd.Timestamp(fd_te4["dia"].max()).date()}  ({fd_te4["dia"].nunique()} dias, {len(fd_te4)} linhas)')
print()
print(f'{"Métrica":<26} {"Phase 1":>10} {"KNN k="+str(best_k):>12} {"Delta":>10}')
print('-' * 62)
print(f'{"MAE global (acordos/banda)":<26} {mae_p1_4:>10.2f} {mae_knn4:>12.2f} {mae_knn4 - mae_p1_4:>+10.2f}')
print(f'{"Acerto direcional":<26} {"—":>10} {dir_acc:>12.1%}')
print(f'{"N obs":<26} {len(y_te4):>10}')

fd_te4 = fd_te4.copy()
fd_te4['knn_pred'] = knn_pred4
fd_te4['p1_pred']  = p1_pred4.astype(int)

# MAE por faixa
print()
print(f'{"Faixa":<22} {"Phase 1":>10} {"KNN":>10} {"Delta":>10}')
print('-' * 54)
for f in sorted(fd_te4['faixa_batimento'].unique()):
    s  = fd_te4[fd_te4['faixa_batimento'] == f]
    m1 = mean_absolute_error(s['acordos_banda'], s['p1_pred'])
    mk = mean_absolute_error(s['acordos_banda'], s['knn_pred'])
    print(f'{f:<22} {m1:>10.2f} {mk:>10.2f} {mk - m1:>+10.2f}  n={len(s)}')

# MAE por hora
print()
print(f'{"Hora":<8} {"Phase 1":>10} {"KNN":>10} {"Delta":>10}')
print('-' * 42)
for h in sorted(fd_te4['hora'].unique()):
    s    = fd_te4[fd_te4['hora'] == h]
    m1   = mean_absolute_error(s['acordos_banda'], s['p1_pred'])
    mk   = mean_absolute_error(s['acordos_banda'], s['knn_pred'])
    flag = '  <- PIOR' if mk > m1 + 0.5 else ''
    print(f'{int(h):<8} {m1:>10.2f} {mk:>10.2f} {mk - m1:>+10.2f}  n={len(s)}{flag}')

# ── STEP 5: RESUMO 4 FOLDS ────────────────────────────────────────────────
print()
print('=' * 62)
print('STEP 5 — RESUMO COMPARATIVO (todos os 4 folds)')
print('=' * 62)

all_p1_mae  = cv_p1 + [mae_p1_4]
all_knn_mae = cv_knn[best_k] + [mae_knn4]
folds_ok    = all(km < p1m for km, p1m in zip(all_knn_mae, all_p1_mae))

print(f'{"Fold":<8} {"Phase 1":>10} {"KNN k="+str(best_k):>12} {"Delta":>10} {"Status":>8}')
print('-' * 52)
for i, (p1m, km) in enumerate(zip(all_p1_mae, all_knn_mae), 1):
    status = 'OK' if km < p1m else 'PIOR'
    print(f'{i:<8} {p1m:>10.2f} {km:>12.2f} {km - p1m:>+10.2f} {status:>8}')
print('-' * 52)
print(f'{"Global":<8} {np.mean(all_p1_mae):>10.2f} {np.mean(all_knn_mae):>12.2f} '
      f'{np.mean(all_knn_mae) - np.mean(all_p1_mae):>+10.2f}')

# ── STEP 6: EXPORT CSV VALIDAÇÃO (usa fold_cache — sem re-treinar) ────────
print()
print('=' * 62)
print('STEP 6 — EXPORT CSV VALIDAÇÃO')
print('=' * 62)

rows = []
for fold_idx, cache in enumerate(fold_cache):
    fd_te  = cache['fd_te']
    y_vals = cache['y_te']
    p1_p   = cache['p1_pred'].astype(int)
    knn_p  = cache[f'knn_pred_k{best_k}']

    for i, (_, r) in enumerate(fd_te.iterrows()):
        rows.append({
            'fold':            fold_idx + 1,
            'dia':             r['dia'].date(),
            'hora':            int(r['hora']),
            'banco_origem':    r['banco_origem'],
            'faixa_batimento': r['faixa_batimento'],
            'real':            int(y_vals[i]),
            'knn_pred':        int(knn_p[i]),
            'p1_pred':         int(p1_p[i]),
            'err_knn':         int(abs(y_vals[i] - knn_p[i])),
            'err_p1':          int(abs(y_vals[i] - p1_p[i])),
        })

pd.DataFrame(rows).to_csv('knn_phase2_validation.csv', index=False)
print(f'knn_phase2_validation.csv  ({len(rows)} linhas, 4 folds, sem re-treino)')

# ── STEP 7: SALVAR ARTEFATOS ──────────────────────────────────────────────
print()
print('=' * 62)
print('STEP 7 — SALVAR ARTEFATOS')
print('=' * 62)

# Modelo para deploy: treinado em todos os 130 dias
sc_full  = StandardScaler()
X_full   = sc_full.fit_transform(df[FEATURES])
knn_full = KNeighborsRegressor(n_neighbors=best_k, metric='euclidean')
knn_full.fit(X_full, df['acordos_banda'].values)

joblib.dump(knn_full, 'knn_phase2_model.joblib')
joblib.dump(sc_full,  'knn_phase2_scaler.joblib')
print('knn_phase2_model.joblib   — KNN completo (130 dias, para deploy)')
print('knn_phase2_scaler.joblib  — StandardScaler (130 dias, para deploy)')
print(f'Features: {FEATURES}')
print(f'k={best_k}, metric=euclidean')

# ── STEP 8: DECISÃO DE PROMOÇÃO ───────────────────────────────────────────
print()
print('=' * 62)
print('STEP 8 — DECISÃO DE PROMOÇÃO')
print('=' * 62)

delta     = mae_knn4 - mae_p1_4
delta_pct = delta / mae_p1_4 * 100

crit_mae     = mae_knn4 < 8.5
crit_melhora = delta_pct <= -10.0
crit_direcao = dir_acc >= 0.65
crit_folds   = folds_ok

print(f'Critério 1 — MAE < 8.5:                {"OK" if crit_mae else "FALHOU":6}  (MAE={mae_knn4:.2f})')
print(f'Critério 2 — Melhora >= 10% vs Phase1: {"OK" if crit_melhora else "FALHOU":6}  ({delta_pct:+.1f}%)')
print(f'Critério 3 — Acerto direcional > 65%:  {"OK" if crit_direcao else "FALHOU":6}  ({dir_acc:.1%})')
print(f'Critério 4 — Nenhum fold pior:         {"OK" if crit_folds else "FALHOU":6}')
print()

all_ok = crit_mae and crit_melhora and crit_direcao and crit_folds
if all_ok:
    print(f'RESULTADO: PROMOVER KNN Phase 2  (k={best_k})')
    print(f'  Phase 1 MAE:       {mae_p1_4:.2f}')
    print(f'  KNN MAE:           {mae_knn4:.2f}  ({delta_pct:+.1f}%)')
    print(f'  Acerto direcional: {dir_acc:.1%}')
    print(f'  Modelo:    knn_phase2_model.joblib')
    print(f'  Scaler:    knn_phase2_scaler.joblib')
    print(f'  Validação: knn_phase2_validation.csv')
else:
    failed = []
    if not crit_mae:      failed.append(f'MAE={mae_knn4:.2f} >= 8.5')
    if not crit_melhora:  failed.append(f'melhora={delta_pct:+.1f}% (precisa <= -10%)')
    if not crit_direcao:  failed.append(f'dir_acc={dir_acc:.1%} < 65%')
    if not crit_folds:    failed.append('fold(s) pior que Phase 1')
    print(f'RESULTADO: MANTER Phase 1')
    print(f'  Falhou: {"; ".join(failed)}')
    print()
    print(f'  Próximos passos:')
    print(f'    — banco_origem como feature binária (0=AUTOS, 1=CONSUMER)')
    print(f'    — acumulado_primeiras_2h para horas >= 10')
    print(f'    — aumentar janela de treino além dos 130 dias disponíveis')

print()
print(f'Features: {FEATURES}')
