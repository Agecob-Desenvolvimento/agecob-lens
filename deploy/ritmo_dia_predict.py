"""
Ritmo do Dia — predict module (KNN Phase 2, Model A)

Carrega knn_phase2_model.joblib + knn_phase2_scaler.joblib uma vez por processo
e expõe esperado_banda() para o router consumir.

Feature order (CRÍTICO — mesma do fit):
    [hora, dias_desde_ultimo_batimento, dia_semana_sin, dia_semana_cos, acumulado_lag]

Convenção de acumulado_lag:
    Para prever a banda da hora H, passar acumulado_ate_hora ao FINAL da hora H-1.
    Para hora=8 (primeira do dia), usar 0.
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np

_BASE_DIR  = Path(os.environ.get('RITMO_DIA_MODEL_DIR', Path(__file__).parent))
_MODEL_PATH  = _BASE_DIR / 'knn_phase2_model.joblib'
_SCALER_PATH = _BASE_DIR / 'knn_phase2_scaler.joblib'

_DS_MIN, _DS_PERIOD = 2, 5  # dia_semana 2=seg…6=sex, período 5

_model  = None
_scaler = None


def _load() -> None:
    global _model, _scaler
    if _model is None or _scaler is None:
        _model  = joblib.load(_MODEL_PATH)
        _scaler = joblib.load(_SCALER_PATH)


def dia_em_andamento() -> bool:
    """True se agora é horário operacional (seg–sex 08:00–19:30)."""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    h = now.hour + now.minute / 60
    return 8.0 <= h < 19.5


def esperado_banda(hora: int,
                   dias_desde_ultimo_batimento: int,
                   dia_semana: int,
                   acumulado_lag: int) -> int:
    """
    Esperado de acordos para a banda da hora `hora`.

    Args:
        hora: 8–19
        dias_desde_ultimo_batimento: contínuo, NULL → 30 (basais antigos)
        dia_semana: 2=seg … 6=sex (mesma convenção do CSV)
        acumulado_lag: total de acordos hoje até o INÍCIO da hora a prever
                       (= acumulado_ate_hora ao final da hora H-1).
                       Para hora=8, usar 0.

    Returns:
        Inteiro não-negativo (round do output do KNN).
    """
    _load()
    ds_sin = np.sin(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    ds_cos = np.cos(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    X = np.array([[hora, dias_desde_ultimo_batimento, ds_sin, ds_cos, acumulado_lag]])
    pred = _model.predict(_scaler.transform(X))[0]
    return max(0, int(round(pred)))


def esperado_curva_dia(dias_desde_ultimo_batimento: int,
                       dia_semana: int,
                       reais_por_hora: dict[int, int]) -> list[dict]:
    """
    Curva esperada/real/delta para todas as bandas 8h–19h de um dia.

    Args:
        dias_desde_ultimo_batimento: idem esperado_banda
        dia_semana: idem esperado_banda
        reais_por_hora: {hora: acordos_reais_observados} (somente horas já fechadas)

    Returns:
        [{hora, esperado, real, delta, status}, ...] para hora ∈ 8..19.
    """
    hora_atual = datetime.now().hour
    bandas = []
    acumulado = 0  # acumulado_lag percorrendo o dia hora a hora
    for h in range(8, 20):
        esp = esperado_banda(h, dias_desde_ultimo_batimento, dia_semana, acumulado)
        if h < hora_atual:
            real  = int(reais_por_hora.get(h, 0))
            delta = real - esp
            status = 'acima' if delta > 0 else ('abaixo' if delta < 0 else 'ok')
            acumulado += real
        elif h == hora_atual:
            real, delta, status = None, None, 'em_andamento'
        else:
            real, delta, status = None, None, 'futuro'
        bandas.append({'hora': h, 'esperado': esp, 'real': real,
                       'delta': delta, 'status': status})
    return bandas
