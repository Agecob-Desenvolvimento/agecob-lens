"""
Ritmo do Dia — endpoint /dashboard/ritmo-dia/{db}

Usa KNN Fase 2 (modelo + scaler em deploy/) para prever acordos por banda
horária (8h–19h). Modelo/scaler ficam em cache com TTL de 24h.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime
from pathlib import Path
from threading import Lock
from typing import Dict, List, NamedTuple, Optional, Tuple

import joblib
import numpy as np
from fastapi import APIRouter, HTTPException

import config.settings as settings
from core.database.query_executor import run_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard")

_BANCOS_VALIDOS = {"COBwebRCBCONSUMER", "COBwebRCBAUTOS", "todos"}
_BANCO_BIN = {"COBwebRCBAUTOS": 0, "COBwebRCBCONSUMER": 1}
_DEPLOY_DIR = Path(__file__).resolve().parents[2] / "deploy"
_MODEL_PATH = _DEPLOY_DIR / "knn_phase2_model.joblib"
_SCALER_PATH = _DEPLOY_DIR / "knn_phase2_scaler.joblib"
_MODEL_TTL = 24 * 60 * 60

_DS_MIN, _DS_PERIOD = 2, 5

class Artifacts(NamedTuple):
    model: object
    scaler: object


_artifacts: Optional[Artifacts] = None
_artifacts_loaded_at: float = 0.0
_artifacts_lock = Lock()

_ACORDOS_TTL = 30  # segundos
_acordos_cache: Dict[str, Tuple[date, float, Dict[int, int]]] = {}


def _load_artifacts() -> Artifacts:
    global _artifacts, _artifacts_loaded_at
    with _artifacts_lock:
        now = time.time()
        if _artifacts is None or now - _artifacts_loaded_at > _MODEL_TTL:
            _artifacts = Artifacts(
                model=joblib.load(_MODEL_PATH),
                scaler=joblib.load(_SCALER_PATH),
            )
            _artifacts_loaded_at = now
        return _artifacts


def _esperado(
    model,
    scaler,
    hora: int,
    dias_desde: int,
    dia_semana: int,
    acumulado: int,
    banco_bin: int,
    acum_primeiras_2h: int,
) -> int:
    ds_sin = np.sin(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    ds_cos = np.cos(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    X = np.array([[hora, dias_desde, ds_sin, ds_cos, acumulado, banco_bin, acum_primeiras_2h]])
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
    today = date.today()
    now = time.time()
    cached = _acordos_cache.get(db)
    if cached is not None:
        cached_date, ts, value = cached
        if cached_date == today and now - ts < _ACORDOS_TTL:
            return value

    sql = f"""
        SELECT DATEPART(HOUR, R.DT_EMISSAO) AS hora,
               COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd
        FROM {db}..REC_MASTER R WITH (NOLOCK)
        JOIN {db}..USU_MASTER U WITH (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
        WHERE CAST(R.DT_EMISSAO AS DATE) = CAST(GETDATE() AS DATE)
          AND R.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL}
          AND R.PARCELA = 0
          AND DATEPART(HOUR, R.DT_EMISSAO) BETWEEN 8 AND 19
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
        GROUP BY DATEPART(HOUR, R.DT_EMISSAO)
    """
    rows = run_query(sql, db, context="ritmo-dia/acordos-hoje")
    result = {int(r["hora"]): int(r["qtd"]) for r in rows if r.get("hora") is not None}
    _acordos_cache[db] = (today, now, result)
    return result


def normalizar_dia_semana(data: datetime) -> Optional[int]:
    """Retorna 2 (seg) … 6 (sex). None para sáb/dom."""
    wd = data.weekday()
    if wd >= 5:
        return None
    return wd + 2


def _faixa_de_dias(d: int) -> str:
    if d <= 5:
        return "pos_batimento"
    if d <= 15:
        return "absorcao"
    return "basal"


def _coletar_dados_por_banco(db: str) -> Dict[str, Tuple[int, Dict[int, int]]]:
    bancos = list(settings.ALLOWED_DATABASES) if db == "todos" else [db]
    return {b: (_obter_dias_desde_batimento(b), _obter_acordos_hoje(b)) for b in bancos}


def _bandas_para_banco(
    model,
    scaler,
    dias_desde: int,
    dia_semana: int,
    reais: Dict[int, int],
    banco_bin: int,
    hora_atual: int,
) -> List[Dict[str, object]]:
    acum_2h_full = int(reais.get(8, 0) + reais.get(9, 0))
    bandas: List[Dict[str, object]] = []
    acumulado = 0
    for h in range(8, 20):
        acum_2h = 0 if h < 10 else acum_2h_full
        esp = _esperado(model, scaler, h, dias_desde, dia_semana, acumulado, banco_bin, acum_2h)
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
            "acumulado": acumulado if real is not None else None,
        })
    return bandas


def _agregar_bandas(bandas_por_banco: List[List[Dict[str, object]]]) -> List[Dict[str, object]]:
    if len(bandas_por_banco) == 1:
        return bandas_por_banco[0]
    out: List[Dict[str, object]] = []
    for i in range(12):
        per = [b[i] for b in bandas_por_banco]
        esp = sum(int(p["esperado"]) for p in per)
        reals = [p["real"] for p in per]
        base_status = per[0]["status"]
        if all(r is None for r in reals):
            out.append({
                "hora": per[0]["hora"],
                "esperado": esp,
                "real": None,
                "delta": None,
                "status": base_status,
                "acumulado": None,
            })
        else:
            real = sum(int(r) for r in reals if r is not None)
            delta = real - esp
            status = "acima" if delta > 0 else ("abaixo" if delta < 0 else "ok")
            acum = sum(int(p["acumulado"]) for p in per if p.get("acumulado") is not None)
            out.append({
                "hora": per[0]["hora"],
                "esperado": esp,
                "real": real,
                "delta": delta,
                "status": status,
                "acumulado": acum,
            })
    return out


@router.get("/ritmo-dia/{db}")
def ritmo_dia(db: str) -> Dict[str, object]:
    if db not in _BANCOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Banco inválido: {db}")

    now = datetime.now()
    hora_atual = now.hour
    dia_semana = normalizar_dia_semana(now)
    generated_at = now.isoformat()

    if hora_atual < 8 or hora_atual > 19 or dia_semana is None:
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
        por_banco = _coletar_dados_por_banco(db)
    except HTTPException:
        raise
    except Exception:
        logger.error(
            "ritmo-dia: falha ao consultar dados operacionais (db=%s)", db, exc_info=True
        )
        return {
            "meta": {
                "generated_at": generated_at,
                "em_operacao": True,
                "modelo": "knn_phase2",
            },
            "data": {"hora_atual": hora_atual, "acumulado_atual": 0, "bandas": []},
            "errors": [{"msg": "Falha ao consultar dados operacionais"}],
        }

    dias_desde_min = min((d for d, _ in por_banco.values()), default=99)
    faixa = _faixa_de_dias(dias_desde_min)

    bandas_por_banco = [
        _bandas_para_banco(model, scaler, dias_desde, dia_semana, reais, _BANCO_BIN[banco], hora_atual)
        for banco, (dias_desde, reais) in por_banco.items()
    ]
    bandas = _agregar_bandas(bandas_por_banco)

    acumulado_atual = sum(
        reais.get(h, 0) for _, reais in por_banco.values() for h in range(8, hora_atual)
    )
    esperado_total = sum(int(b["esperado"]) for b in bandas)
    projecao_fechamento = acumulado_atual + sum(
        int(b["esperado"]) for b in bandas if b["status"] in ("em_andamento", "futuro")
    )

    return {
        "meta": {
            "generated_at": generated_at,
            "faixa_batimento": faixa,
            "dias_desde_ultimo_batimento": dias_desde_min,
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
