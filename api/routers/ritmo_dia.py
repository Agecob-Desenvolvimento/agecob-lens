"""
Ritmo do Dia — endpoint /dashboard/ritmo-dia/{db}

Usa KNN Fase 2 (modelo + scaler em deploy/) para prever acordos por banda
horária (8h–19h). Modelo/scaler ficam em cache com TTL de 24h.
"""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
from fastapi import APIRouter, HTTPException

import config.settings as settings
from core.database.query_executor import run_query

router = APIRouter(prefix="/dashboard")

_BANCOS_VALIDOS = {"COBwebRCBCONSUMER", "COBwebRCBAUTOS", "todos"}
_DEPLOY_DIR = Path(__file__).resolve().parents[2] / "deploy"
_MODEL_PATH = _DEPLOY_DIR / "knn_phase2_model.joblib"
_SCALER_PATH = _DEPLOY_DIR / "knn_phase2_scaler.joblib"
_MODEL_TTL = 24 * 60 * 60

_DS_MIN, _DS_PERIOD = 2, 5

_artifacts: Dict[str, object] = {"model": None, "scaler": None, "loaded_at": 0.0}
_artifacts_lock = Lock()


def _load_artifacts() -> Tuple[object, object]:
    with _artifacts_lock:
        now = time.time()
        if (
            _artifacts["model"] is None
            or _artifacts["scaler"] is None
            or now - float(_artifacts["loaded_at"]) > _MODEL_TTL
        ):
            _artifacts["model"] = joblib.load(_MODEL_PATH)
            _artifacts["scaler"] = joblib.load(_SCALER_PATH)
            _artifacts["loaded_at"] = now
        return _artifacts["model"], _artifacts["scaler"]


def _esperado(model, scaler, hora: int, dias_desde: int, dia_semana: int, acumulado: int) -> int:
    ds_sin = np.sin(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    ds_cos = np.cos(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    X = np.array([[hora, dias_desde, ds_sin, ds_cos, acumulado]])
    pred = model.predict(scaler.transform(X))[0]
    return max(0, int(round(pred)))


def _obter_dias_desde_batimento(db: str) -> int:
    sql = f"""
        SELECT TOP 1 DATEDIFF(DAY, CAST([DATA] AS DATE), CAST(GETDATE() AS DATE)) AS dias
        FROM {db}..CARGA_LOTE WITH (NOLOCK)
        WHERE ID_USUARIO = 1 AND QTD_NV_CLI > 10000
        ORDER BY [DATA] DESC
    """
    rows = run_query(sql, db, context="ritmo-dia/dias-desde-batimento")
    if not rows or rows[0].get("dias") is None:
        return 99
    return int(rows[0]["dias"])


def _obter_acordos_hoje(db: str) -> Dict[int, int]:
    sql = f"""
        SELECT DATEPART(HOUR, DT_EMISSAO) AS hora,
               COUNT(DISTINCT NR_RECEBIMENTO) AS qtd
        FROM {db}..REC_MASTER WITH (NOLOCK)
        WHERE CAST(DT_EMISSAO AS DATE) = CAST(GETDATE() AS DATE)
          AND ID_REC_STATUS IN (1, 3, 12)
          AND PARCELA = 0
          AND DATEPART(HOUR, DT_EMISSAO) BETWEEN 8 AND 19
        GROUP BY DATEPART(HOUR, DT_EMISSAO)
    """
    rows = run_query(sql, db, context="ritmo-dia/acordos-hoje")
    return {int(r["hora"]): int(r["qtd"]) for r in rows if r.get("hora") is not None}


def _faixa_de_dias(d: int) -> str:
    if d <= 5:
        return "pos_batimento"
    if d <= 15:
        return "absorcao"
    return "basal"


def _coletar_dados(db: str) -> Tuple[int, Dict[int, int]]:
    if db == "todos":
        dias_list: List[int] = []
        reais_total: Dict[int, int] = {}
        for source in settings.ALLOWED_DATABASES:
            dias_list.append(_obter_dias_desde_batimento(source))
            for h, q in _obter_acordos_hoje(source).items():
                reais_total[h] = reais_total.get(h, 0) + q
        dias_desde = min(dias_list) if dias_list else 99
        return dias_desde, reais_total
    return _obter_dias_desde_batimento(db), _obter_acordos_hoje(db)


@router.get("/ritmo-dia/{db}")
def ritmo_dia(db: str) -> Dict[str, object]:
    if db not in _BANCOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Banco inválido: {db}")

    now = datetime.now()
    hora_atual = now.hour
    dia_semana = now.weekday() + 2  # 2=seg … 6=sex (domingo=8, sábado=7)
    generated_at = now.isoformat()

    if hora_atual < 8 or hora_atual > 19:
        return {
            "meta": {
                "generated_at": generated_at,
                "em_operacao": False,
                "modelo": "knn_phase2",
            },
            "data": {"hora_atual": hora_atual, "acumulado_atual": 0, "bandas": []},
            "errors": [],
        }

    try:
        model, scaler = _load_artifacts()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao carregar modelo: {exc}")

    try:
        dias_desde, reais = _coletar_dados(db)
    except HTTPException:
        raise
    except Exception:
        dias_desde, reais = 99, {}

    faixa = _faixa_de_dias(dias_desde)

    bandas: List[Dict[str, object]] = []
    acumulado = 0
    for h in range(8, 20):
        esp = _esperado(model, scaler, h, dias_desde, dia_semana, acumulado)
        if not reais and h >= hora_atual:
            real, delta, status = None, None, "futuro"
        elif h < hora_atual:
            real = int(reais.get(h, 0))
            delta = real - esp
            status = "acima" if delta > 0 else ("abaixo" if delta < 0 else "ok")
            acumulado += real
        elif h == hora_atual:
            real, delta, status = None, None, "em_andamento"
        else:
            real, delta, status = None, None, "futuro"
        bandas.append({
            "hora": h,
            "esperado": esp,
            "real": real,
            "delta": delta,
            "status": status,
        })

    acumulado_atual = sum(reais.get(h, 0) for h in range(8, hora_atual))
    esperado_total = sum(int(b["esperado"]) for b in bandas)
    projecao_fechamento = acumulado_atual + sum(
        int(b["esperado"]) for b in bandas if b["status"] in ("em_andamento", "futuro")
    )

    return {
        "meta": {
            "generated_at": generated_at,
            "faixa_batimento": faixa,
            "dias_desde_ultimo_batimento": dias_desde,
            "modelo": "knn_phase2",
            "em_operacao": True,
        },
        "data": {
            "hora_atual": hora_atual,
            "acumulado_atual": acumulado_atual,
            "esperado_total": esperado_total,
            "projecao_fechamento": projecao_fechamento,
            "bandas": bandas,
        },
        "errors": [],
    }
