"""
Ritmo do Dia — endpoint /dashboard/ritmo-dia/{db}

Modelo híbrido por banco (MODEL_DOCS 5.10, decisão do gestor):
  - AUTOS: Phase 1 refinado — lookup mediana (hora, banco) em deploy/phase1_lookup.json
  - CONSUMER: KNN Fase 2 (modelo + scaler em deploy/) — mediana pós-filtro é 0 em
    todas as bandas; card zerado foi rejeitado, KNN mantido até volume crescer.
Artefatos ficam em cache com TTL de 24h.
"""
from __future__ import annotations

import json
import logging
import math
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
_LOOKUP_PATH = _DEPLOY_DIR / "phase1_lookup.json"
_VALOR_MODEL_PATH = _DEPLOY_DIR / "knn_phase2_valor_model.joblib"
_VALOR_SCALER_PATH = _DEPLOY_DIR / "knn_phase2_valor_scaler.joblib"
_VALOR_LOOKUP_PATH = _DEPLOY_DIR / "phase1_lookup_valor.json"
_MODEL_TTL = 24 * 60 * 60

_BANCOS_LOOKUP = {"COBwebRCBAUTOS"}  # bancos servidos pelo lookup; demais usam KNN

_DS_MIN, _DS_PERIOD = 2, 5

class Artifacts(NamedTuple):
    model: object
    scaler: object


_artifacts_cache: Dict[Path, Tuple[Artifacts, float]] = {}
_lookup_cache: Dict[Path, Tuple[Dict[str, object], float]] = {}
_artifacts_lock = Lock()

_ACORDOS_TTL = 30  # segundos
_acordos_cache: Dict[str, Tuple[date, float, Dict[int, int]]] = {}
_VALOR_TTL = 30  # segundos
_valor_cache: Dict[str, Tuple[date, float, Dict[int, float]]] = {}


def _load_artifacts_from(model_path: Path, scaler_path: Path) -> Artifacts:
    with _artifacts_lock:
        now = time.time()
        cached = _artifacts_cache.get(model_path)
        if cached is None or now - cached[1] > _MODEL_TTL:
            art = Artifacts(model=joblib.load(model_path), scaler=joblib.load(scaler_path))
            _artifacts_cache[model_path] = (art, now)
        return _artifacts_cache[model_path][0]


def _load_lookup_from(path: Path) -> Dict[str, object]:
    with _artifacts_lock:
        now = time.time()
        cached = _lookup_cache.get(path)
        if cached is None or now - cached[1] > _MODEL_TTL:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            _lookup_cache[path] = (data, now)
        return _lookup_cache[path][0]


def _load_artifacts() -> Artifacts:
    return _load_artifacts_from(_MODEL_PATH, _SCALER_PATH)


def _load_valor_artifacts() -> Artifacts:
    return _load_artifacts_from(_VALOR_MODEL_PATH, _VALOR_SCALER_PATH)


def _load_lookup() -> Dict[str, object]:
    return _load_lookup_from(_LOOKUP_PATH)


def _load_valor_lookup() -> Dict[str, object]:
    return _load_lookup_from(_VALOR_LOOKUP_PATH)


def _feature_vector(
    hora: int, dias_desde: int, dia_semana: int, acumulado: float, banco_bin: int, acum_primeiras_2h: float,
) -> np.ndarray:
    ds_sin = np.sin(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    ds_cos = np.cos(2 * np.pi * (dia_semana - _DS_MIN) / _DS_PERIOD)
    return np.array([[hora, dias_desde, ds_sin, ds_cos, acumulado, banco_bin, acum_primeiras_2h]])


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
    X = _feature_vector(hora, dias_desde, dia_semana, acumulado, banco_bin, acum_primeiras_2h)
    pred = float(model.predict(scaler.transform(X))[0])
    return max(0, math.ceil(pred))


def _esperado_valor(
    model,
    scaler,
    hora: int,
    dias_desde: int,
    dia_semana: int,
    acumulado: float,
    banco_bin: int,
    acum_primeiras_2h: float,
) -> float:
    X = _feature_vector(hora, dias_desde, dia_semana, acumulado, banco_bin, acum_primeiras_2h)
    pred = float(model.predict(scaler.transform(X))[0])
    return round(max(0.0, pred), 2)


def _esperado_lookup(lookup: Dict[str, object], banco: str, hora: int) -> int:
    pred = float(lookup["medianas"][banco][str(hora)])
    return max(0, math.ceil(pred))


def _esperado_lookup_valor(lookup: Dict[str, object], banco: str, hora: int) -> float:
    pred = float(lookup["medianas"][banco][str(hora)])
    return round(max(0.0, pred), 2)


def _modelo_label(db: str, sufixo: str = "") -> str:
    if db == "todos":
        return f"hibrido_autos_p1_consumer_knn{sufixo}"
    return f"phase1_hora_banco{sufixo}" if db in _BANCOS_LOOKUP else f"knn_phase2{sufixo}"


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
          AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
          AND R.PARCELA = 0
          AND DATEPART(HOUR, R.DT_EMISSAO) BETWEEN 8 AND 19
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
        GROUP BY DATEPART(HOUR, R.DT_EMISSAO)
    """
    rows = run_query(sql, db, context="ritmo-dia/acordos-hoje")
    result = {int(r["hora"]): int(r["qtd"]) for r in rows if r.get("hora") is not None}
    _acordos_cache[db] = (today, now, result)
    return result


def _obter_valor_hoje(db: str) -> Dict[int, float]:
    today = date.today()
    now = time.time()
    cached = _valor_cache.get(db)
    if cached is not None:
        cached_date, ts, value = cached
        if cached_date == today and now - ts < _VALOR_TTL:
            return value

    sql = f"""
        SELECT DATEPART(HOUR, R.DT_EMISSAO) AS hora,
               SUM(R.VALOR) AS valor
        FROM {db}..REC_MASTER R WITH (NOLOCK)
        JOIN {db}..USU_MASTER U WITH (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
        WHERE CAST(R.DT_EMISSAO AS DATE) = CAST(GETDATE() AS DATE)
          AND R.ID_REC_STATUS IN {settings.STATUS_GERADOS_SQL}
          AND R.PARCELA = 0
          AND DATEPART(HOUR, R.DT_EMISSAO) BETWEEN 8 AND 19
          {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
        GROUP BY DATEPART(HOUR, R.DT_EMISSAO)
    """
    rows = run_query(sql, db, context="ritmo-dia/valor-hoje")
    result = {int(r["hora"]): float(r["valor"] or 0.0) for r in rows if r.get("hora") is not None}
    _valor_cache[db] = (today, now, result)
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


def _bancos_para(db: str) -> List[str]:
    return list(settings.ALLOWED_DATABASES) if db == "todos" else [db]


def _coletar_dados_por_banco(db: str) -> Dict[str, Tuple[int, Dict[int, int]]]:
    return {b: (_obter_dias_desde_batimento(b), _obter_acordos_hoje(b)) for b in _bancos_para(db)}


def _coletar_valor_por_banco(db: str) -> Dict[str, Dict[int, float]]:
    return {b: _obter_valor_hoje(b) for b in _bancos_para(db)}


def _bandas_para_banco(
    model,
    scaler,
    lookup: Dict[str, object],
    banco: str,
    dias_desde: int,
    dia_semana: int,
    reais: Dict[int, int],
    hora_atual: int,
) -> List[Dict[str, object]]:
    usa_lookup = banco in _BANCOS_LOOKUP
    acum_2h_full = int(reais.get(8, 0) + reais.get(9, 0))
    bandas: List[Dict[str, object]] = []
    acumulado = 0
    for h in range(8, 20):
        if usa_lookup:
            esp = _esperado_lookup(lookup, banco, h)
        else:
            acum_2h = 0 if h < 10 else acum_2h_full
            esp = _esperado(model, scaler, h, dias_desde, dia_semana, acumulado,
                            _BANCO_BIN[banco], acum_2h)
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


def _bandas_valor_para_banco(
    model,
    scaler,
    lookup: Dict[str, object],
    banco: str,
    dias_desde: int,
    dia_semana: int,
    reais: Dict[int, float],
    hora_atual: int,
) -> List[Dict[str, object]]:
    usa_lookup = banco in _BANCOS_LOOKUP
    acum_2h_full = float(reais.get(8, 0.0) + reais.get(9, 0.0))
    bandas: List[Dict[str, object]] = []
    acumulado = 0.0
    for h in range(8, 20):
        if usa_lookup:
            esp = _esperado_lookup_valor(lookup, banco, h)
        else:
            acum_2h = 0.0 if h < 10 else acum_2h_full
            esp = _esperado_valor(model, scaler, h, dias_desde, dia_semana, acumulado,
                                   _BANCO_BIN[banco], acum_2h)
        if not reais and h >= hora_atual:
            real, delta, status = None, None, "futuro"
        elif h < hora_atual:
            real = float(reais.get(h, 0.0))
            delta = round(real - esp, 2)
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
            "acumulado": round(acumulado, 2) if real is not None else None,
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


def _agregar_bandas_valor(bandas_por_banco: List[List[Dict[str, object]]]) -> List[Dict[str, object]]:
    if len(bandas_por_banco) == 1:
        return bandas_por_banco[0]
    out: List[Dict[str, object]] = []
    for i in range(12):
        per = [b[i] for b in bandas_por_banco]
        esp = round(sum(float(p["esperado"]) for p in per), 2)
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
            real = round(sum(float(r) for r in reals if r is not None), 2)
            delta = round(real - esp, 2)
            status = "acima" if delta > 0 else ("abaixo" if delta < 0 else "ok")
            acum = round(sum(float(p["acumulado"]) for p in per if p.get("acumulado") is not None), 2)
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
                "modelo": _modelo_label(db),
                "modelo_valor": _modelo_label(db, "_valor"),
            },
            "data": {
                "hora_atual": hora_atual,
                "acumulado_atual": 0,
                "valor_acumulado_atual": 0.0,
                "bandas": [],
            },
            "errors": [],
        }

    try:
        model, scaler = _load_artifacts()
        lookup = _load_lookup()
        valor_model, valor_scaler = _load_valor_artifacts()
        valor_lookup = _load_valor_lookup()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao carregar modelo: {exc}")

    try:
        por_banco = _coletar_dados_por_banco(db)
        valor_por_banco = _coletar_valor_por_banco(db)
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
                "modelo": _modelo_label(db),
                "modelo_valor": _modelo_label(db, "_valor"),
            },
            "data": {
                "hora_atual": hora_atual,
                "acumulado_atual": 0,
                "valor_acumulado_atual": 0.0,
                "bandas": [],
            },
            "errors": [{"msg": "Falha ao consultar dados operacionais"}],
        }

    dias_desde_min = min((d for d, _ in por_banco.values()), default=99)
    faixa = _faixa_de_dias(dias_desde_min)

    bandas_por_banco = [
        _bandas_para_banco(model, scaler, lookup, banco, dias_desde, dia_semana, reais, hora_atual)
        for banco, (dias_desde, reais) in por_banco.items()
    ]
    bandas = _agregar_bandas(bandas_por_banco)

    bandas_valor_por_banco = [
        _bandas_valor_para_banco(valor_model, valor_scaler, valor_lookup, banco,
                                  por_banco[banco][0], dia_semana, valor_por_banco.get(banco, {}), hora_atual)
        for banco in por_banco
    ]
    bandas_valor = _agregar_bandas_valor(bandas_valor_por_banco)
    for banda, banda_valor in zip(bandas, bandas_valor):
        banda["esperado_valor"] = banda_valor["esperado"]
        banda["real_valor"] = banda_valor["real"]
        banda["delta_valor"] = banda_valor["delta"]
        banda["status_valor"] = banda_valor["status"]
        banda["acumulado_valor"] = banda_valor["acumulado"]

    acumulado_atual = sum(
        reais.get(h, 0) for _, reais in por_banco.values() for h in range(8, hora_atual)
    )
    esperado_total = sum(int(b["esperado"]) for b in bandas)
    projecao_fechamento = acumulado_atual + sum(
        int(b["esperado"]) for b in bandas if b["status"] in ("em_andamento", "futuro")
    )

    valor_acumulado_atual = round(sum(
        valores.get(h, 0.0) for valores in valor_por_banco.values() for h in range(8, hora_atual)
    ), 2)
    valor_esperado_total = round(sum(float(b["esperado_valor"]) for b in bandas), 2)
    valor_projecao_fechamento = round(valor_acumulado_atual + sum(
        float(b["esperado_valor"]) for b in bandas if b["status"] in ("em_andamento", "futuro")
    ), 2)

    return {
        "meta": {
            "generated_at": generated_at,
            "faixa_batimento": faixa,
            "dias_desde_ultimo_batimento": dias_desde_min,
            "modelo": _modelo_label(db),
            "modelo_valor": _modelo_label(db, "_valor"),
            "em_operacao": True,
        },
        "data": {
            "hora_atual": hora_atual,
            "acumulado_atual": acumulado_atual,
            "esperado_total": esperado_total,
            "projecao_fechamento": projecao_fechamento,
            "valor_acumulado_atual": valor_acumulado_atual,
            "valor_esperado_total": valor_esperado_total,
            "valor_projecao_fechamento": valor_projecao_fechamento,
            "bandas": bandas,
        },
        "errors": [],
    }
