"""
Visão de conversão de boletos (efetividade) para o agente de chat (/agente/chat).

Fonte: ETL de efetividade em memória (dominios/efetividade), chaves
`*-primeira` — a conversão oficial do dicionário (boleto de 1ª parcela pago
no prazo ≤ 5 dias do vencimento / boleto emitido, base 2026+). O ETL roda em
background; antes da primeira carga a tool degrada para um error dict.

Trim client-side para caber no contexto do modelo: mensal = últimos 12 meses,
diária = últimos 30 dias, por_agente = agente pedido ou top 15 por volume nos
últimos 3 meses.
"""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

CONVERSAO_VISOES = ("mensal", "diaria", "por_agente")

_VISAO_KEYS = {
    "mensal": "mensal-primeira",
    "diaria": "diaria-primeira",
    "por_agente": "mensal-agente-primeira",
}
_MESES_MENSAL = 12
_DIAS_DIARIA = 30
_MESES_POR_AGENTE = 3
_TOP_AGENTES = 15

_CRITERIO = (
    "Conversão oficial: boletos de 1ª parcela pagos no prazo (até 5 dias do "
    "vencimento) / boletos emitidos. Base do ETL: emissões 2026+."
)


def _conv_pct(pagos: float, gerados: float) -> float:
    if gerados <= 0:
        return 0.0
    return round(pagos * 100.0 / gerados, 2)


def _trim_mensal(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    ordenadas = sorted(rows, key=lambda r: (int(r.get("Ano") or 0), int(r.get("Mes") or 0)))
    janela = ordenadas[-_MESES_MENSAL:]
    gerados = sum(int(r.get("Boletos_Gerados") or 0) for r in janela)
    pagos = sum(int(r.get("Pagos_No_Prazo") or 0) for r in janela)
    return {
        "data": [
            {
                "ano": int(r.get("Ano") or 0),
                "mes": int(r.get("Mes") or 0),
                "boletos_gerados": int(r.get("Boletos_Gerados") or 0),
                "pagos_no_prazo": int(r.get("Pagos_No_Prazo") or 0),
                "conversao_pct": float(r.get("Conversao_Prazo_5d") or 0),
            }
            for r in janela
        ],
        "total": {
            "boletos_gerados": gerados,
            "pagos_no_prazo": pagos,
            "conversao_pct": _conv_pct(pagos, gerados),
        },
    }


def _trim_diaria(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    ordenadas = sorted(rows, key=lambda r: str(r.get("Dia_Emissao") or ""))
    janela = ordenadas[-_DIAS_DIARIA:]
    gerados = sum(int(r.get("Boletos_Gerados") or 0) for r in janela)
    pagos = sum(int(r.get("Pagos_No_Prazo") or 0) for r in janela)
    return {
        "data": [
            {
                "dia": str(r.get("Dia_Emissao") or "")[:10],
                "boletos_gerados": int(r.get("Boletos_Gerados") or 0),
                "pagos_no_prazo": int(r.get("Pagos_No_Prazo") or 0),
                "conversao_pct": float(r.get("Conversao_Prazo_5d") or 0),
            }
            for r in janela
        ],
        "total": {
            "boletos_gerados": gerados,
            "pagos_no_prazo": pagos,
            "conversao_pct": _conv_pct(pagos, gerados),
        },
    }


def _trim_por_agente(rows: List[Dict[str, Any]], agente: Optional[str]) -> Dict[str, Any]:
    """
    Com `agente`: série mensal só dele. Sem: total por agente nos últimos
    _MESES_POR_AGENTE meses presentes na base, top _TOP_AGENTES por volume.
    """
    if agente:
        wanted = agente.strip().lower()
        proprios = [r for r in rows if str(r.get("Agente") or "").strip().lower() == wanted]
        if not proprios:
            proprios = [r for r in rows if wanted in str(r.get("Agente") or "").strip().lower()]
        if not proprios:
            return {"error": f"Agente {agente!r} sem boletos na base de efetividade."}
        out = _trim_mensal(proprios)
        out["agente"] = str(proprios[0].get("Agente") or agente)
        return out

    meses = sorted({(int(r.get("Ano") or 0), int(r.get("Mes") or 0)) for r in rows})
    janela_meses = set(meses[-_MESES_POR_AGENTE:])
    acc: Dict[str, Dict[str, int]] = {}
    for r in rows:
        if (int(r.get("Ano") or 0), int(r.get("Mes") or 0)) not in janela_meses:
            continue
        nome = str(r.get("Agente") or "").strip()
        if not nome:
            continue
        bucket = acc.setdefault(nome, {"boletos_gerados": 0, "pagos_no_prazo": 0})
        bucket["boletos_gerados"] += int(r.get("Boletos_Gerados") or 0)
        bucket["pagos_no_prazo"] += int(r.get("Pagos_No_Prazo") or 0)

    agentes = [
        {
            "agente": nome,
            "boletos_gerados": b["boletos_gerados"],
            "pagos_no_prazo": b["pagos_no_prazo"],
            "conversao_pct": _conv_pct(b["pagos_no_prazo"], b["boletos_gerados"]),
        }
        for nome, b in acc.items()
    ]
    agentes.sort(key=lambda a: a["boletos_gerados"], reverse=True)
    return {
        "meses_considerados": [f"{ano:04d}-{mes:02d}" for ano, mes in sorted(janela_meses)],
        "data": agentes[:_TOP_AGENTES],
    }


def build_conversao_view(db: str, visao: str, agente: Optional[str] = None) -> Dict[str, Any]:
    """Lê o store do ETL de efetividade e devolve a visão pedida, já enxuta."""
    from dominios.efetividade.servico import get_efetividade

    try:
        envelope = get_efetividade(_VISAO_KEYS[visao], db)
    except HTTPException as exc:
        return {"error": str(exc.detail)}
    rows = envelope.get("data") or []
    if not rows:
        return {"error": "Base de efetividade vazia para esta visão."}

    if visao == "mensal":
        out = _trim_mensal(rows)
    elif visao == "diaria":
        out = _trim_diaria(rows)
    else:
        out = _trim_por_agente(rows, agente)
    out["visao"] = visao
    out["criterio"] = _CRITERIO
    return out
