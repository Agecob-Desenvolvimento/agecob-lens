"""Diagnostico do modelo KNN ritmo do dia. Roda do root do projeto."""
import math
import sys
from pathlib import Path

import joblib
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "deploy" / "knn_phase2_model.joblib"
SCALER = ROOT / "deploy" / "knn_phase2_scaler.joblib"

m = joblib.load(MODEL)
s = joblib.load(SCALER)

ss = math.sin(2 * math.pi * (4 - 2) / 5)
cc = math.cos(2 * math.pi * (4 - 2) / 5)


def pred(hora, dias_desde, acumulado, banco_bin, acum2h):
    X = np.array([[hora, dias_desde, ss, cc, acumulado, banco_bin, acum2h]])
    return m.predict(s.transform(X))[0]


print(f"AUTOS    D15 14h: {pred(14, 15, 0, 0, 0):.2f}")
print(f"CONSUMER D15 14h: {pred(14, 15, 0, 1, 0):.2f}")
print(f"CONSUMER D5  14h: {pred(14, 5,  0, 1, 0):.2f}")
print(f"CONSUMER D30 14h: {pred(14, 30, 0, 1, 0):.2f}")
print(f"CONSUMER D15 10h: {pred(10, 15, 0, 1, 0):.2f}")
print(f"CONSUMER D15 11h acum=5: {pred(11, 15, 5, 1, 2):.2f}")
