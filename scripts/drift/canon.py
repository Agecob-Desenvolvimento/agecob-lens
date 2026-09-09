"""The source-of-truth side of the sweep.

Tuples and scalars are imported from ``config.settings`` (the same path
``scripts/build_metric_registry.py`` uses). Formula text is read from
``dominios/agente/metric_registry.json``, which is generated from settings and
guarded by ``tests/test_metric_registry.py``. Nothing is hand-typed twice.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import config.settings as settings

ROOT = Path(__file__).resolve().parents[2]
_REGISTRY = ROOT / "dominios" / "agente" / "metric_registry.json"


@dataclass(frozen=True)
class WrongForm:
    pattern: str          # a line matching this (with `context`) is drifted
    why: str
    absent: Optional[str] = None   # ...but only if the line does NOT also match this


@dataclass(frozen=True)
class Definition:
    key: str
    kind: str                       # status_set | scalar | formula | name_set
    value: object                   # tuple[int,...] | int | str
    source: str
    context: str                    # a line is "about" this def iff it matches
    wrong: Tuple[WrongForm, ...] = ()
    guarded_by: Optional[str] = None  # test that already pins this, if any
    note: str = ""


def _registry() -> dict:
    return json.loads(_REGISTRY.read_text(encoding="utf-8"))


def canonical_defs() -> List[Definition]:
    reg = _registry()
    s = settings
    thr_low = s.RISK_LEVEL_LOW_MAX
    thr_mid = s.RISK_LEVEL_MID_MAX
    grace = _grace_days(s.BOLETO_PAGO_PRAZO_SQL)

    return [
        Definition(
            "status_universo", "status_set", tuple(sorted(s.STATUS_UNIVERSO_ACORDOS)),
            "config/settings.py :: STATUS_UNIVERSO_ACORDOS",
            r"UNIVERSO|universo\s+(de\s+|dos\s+)?acord|pr[eé]-?filtro.{0,12}CTE|CTE\s+pre-?filter|pre-?filter\s+CTE",
            note="quebras (2, 10) must survive the CTE pre-filter",
        ),
        Definition(
            "status_gerados", "status_set", tuple(sorted(s.STATUS_GERADOS)),
            "config/settings.py :: STATUS_GERADOS",
            r"GERADOS|valor(es)?\s+gerad|generated\s+(value|agreement)|gerados\s*[=(]",
        ),
        Definition(
            "status_aprovados", "status_set", tuple(sorted(s.STATUS_APROVADOS)),
            "config/settings.py :: STATUS_APROVADOS",
            r"APROVADOS|acordos?\s+aprovad|approved\s+agreement|aprovados\s*[=(]",
        ),
        Definition(
            "status_portfolio_rollup", "status_set", tuple(sorted(s.STATUS_PORTFOLIO_ROLLUP)),
            "config/settings.py :: STATUS_PORTFOLIO_ROLLUP",
            r"PORTFOLIO_ROLLUP|portfolio-?rollup|rollup\s+(union|universo)",
        ),
        Definition(
            "status_excecao", "scalar", _only(s.STATUS_EXCECAO),
            "config/settings.py :: STATUS_EXCECAO",
            r"STATUS_EXCECAO|exce[cç][aã]o\s+(de\s+neg[oó]cio|do\s+dashboard)|business\s+exception",
            wrong=(WrongForm(r"(IN\s*\(\s*11\s*\)|ID_REC_STATUS\s*=\s*11|status\s+11\b)",
                             "business exception is status 5 (enum PENDENTE); enum 11 EXCEÇÃO is unused"),),
        ),
        Definition(
            "status_rejeitado", "scalar", _only(s.STATUS_REJEITADO),
            "config/settings.py :: STATUS_REJEITADO",
            r"REJEITADO|rejeitad|rejected",
        ),
        Definition(
            "status_quebrado", "scalar", _only(s.STATUS_QUEBRADO),
            "config/settings.py :: STATUS_QUEBRADO",
            r"QUEBRADO|boleto.{0,8}quebrad|broken\s+boleto",
        ),
        Definition(
            "primeira_parcela", "scalar", s.PRIMEIRA_PARCELA,
            "config/settings.py :: PRIMEIRA_PARCELA",
            r"PRIMEIRA_PARCELA|primeira\s+parcela\s+(é|=|is)|first\s+instal?lment\s+(is|=)",
            wrong=(WrongForm(r"(primeira\s+parcela|first\s+instal?lment)\s*(é|is|=)\s*(PARCELA\s*=\s*)?1\b",
                             "first installment is PARCELA = 0, not 1"),),
        ),
        Definition(
            "portfolio_column", "name_set", s.PORTFOLIO_COLUMN,
            "config/settings.py :: PORTFOLIO_COLUMN",
            r"PORTFOLIO_COLUMN|portf[oó]lio.{0,20}(coluna|column|campo)|portfolio.{0,12}column",
            wrong=(WrongForm(r"CART_MASTER", "portfolio name lives in DIV_AUX.CAMPO010, not CART_MASTER",
                             absent=r"CAMPO010"),),
        ),
        Definition(
            "boleto_grace_days", "scalar", grace,
            "config/settings.py :: BOLETO_PAGO_PRAZO_SQL",
            r"DATEADD\s*\(\s*DAY\s*,\s*\d|car[êe]ncia|grace|pago\s+no\s+prazo|on-?time",
        ),
        Definition(
            "risk_low", "scalar", thr_low,
            "config/settings.py :: RISK_LEVEL_LOW_MAX",
            r"RISK_LEVEL_LOW|baixo.{0,10}(risco|composto|<=)|risco.{0,12}baixo|threshold.{0,10}low",
        ),
        Definition(
            "risk_mid", "scalar", thr_mid,
            "config/settings.py :: RISK_LEVEL_MID_MAX",
            r"RISK_LEVEL_MID|m[eé]dio.{0,10}(risco|composto|<=)|risco.{0,12}m[eé]dio",
        ),
        Definition(
            "cpc_predicate", "formula", "CTO_COMPLEMENTO.ALO = 1 AND CTO_COMPLEMENTO.CONTATO = 1",
            "agecob-lens/docs/data-layer.md :: Funil de contato (ADR-013)",
            r"\bCPC\b|\bRPC\b|pessoa\s+certa|CONTATO\s*=\s*1|COD_COMPLEMENTO|CPC_COMPLEMENTO",
            wrong=(
                WrongForm(r"CPC_COMPLEMENTO_(IDS|CODS)", "curated COD_COMPLEMENTO / ID allowlist was retired 2026-08-19"),
                WrongForm(r"COD_COMPLEMENTO\s+IN\s*\(", "COD_COMPLEMENTO is not a key; join CTO_COMPLEMENTO on ID_COMPLEMENTO"),
                WrongForm(r"ID_COMPLEMENTO\s+IN\s*\(\s*\d", "CPC join is CTO_MASTER.ID_COMPLEMENTO = CTO_COMPLEMENTO.ID_COMPLEMENTO; an ID_COMPLEMENTO IN (…) numeric allowlist was retired 2026-08-19"),
                WrongForm(r"CONTATO\s*=\s*1", "CPC needs ALO = 1 AND CONTATO = 1; CONTATO=1 alone fires on WhatsApp/boleto dispatch",
                          absent=r"ALO\s*=\s*1"),
            ),
        ),
        Definition(
            "taxa_contato", "formula", reg["kpis"]["taxa_contato_pct"]["formula"].split("—")[0].strip(),
            "dominios/agente/metric_registry.json :: kpis.taxa_contato_pct",
            r"taxa\s+de\s+contato|taxa_contato|contact\s+rate",
            wrong=(WrongForm(r"qtd_contatos\s*/\s*(Σ\s*)?qtd_acionamentos",
                             "Taxa de contato is qtd_alo / qtd_acionamentos; qtd_contatos is CPC"),),
            guarded_by="tests/test_metric_registry.py (registry only, not consumers)",
        ),
        Definition(
            "conversao", "formula", "qtd_acordos / qtd_contatos",
            "dominios/agente/metric_registry.json :: kpis.taxa_conversao_pct",
            r"convers[aã]o|conversion",
            wrong=(
                WrongForm(r"qtd_acordos\s*/\s*qtd_acionamentos", "conversão denominator is qtd_contatos (CPC), not qtd_acionamentos"),
                WrongForm(r"pagos?\s*/\s*emitidos", "pagos/emitidos is efetividade_boleto_pct, not conversão", absent=r"efetividade"),
            ),
        ),
        Definition(
            "dedup_partition", "formula", "NR_RECEBIMENTO, ID_CARTEIRA, PARCELA",
            "agecob-lens/docs/data-layer.md :: dedup / docs/data-dictionary.md §1.2",
            r"ROW_NUMBER|PARTITION\s+BY|dedup|re-?write|regravaç",
            wrong=(WrongForm(r"PARTITION\s+BY[^)]*contrato", "dedup partitions by instalment, not contract"),),
        ),
    ]


def _only(t) -> int:
    return int(t[0])


def _grace_days(sql: str) -> int:
    m = re.search(r"DATEADD\s*\(\s*DAY\s*,\s*(\d+)", sql)
    return int(m.group(1)) if m else 5


def excluded_agent_names(sql_filter: str) -> set:
    """The literal agent tokens a `FILTRO_AGENTES_*_SQL` string filters on."""
    return set(re.findall(r"'%?([A-Z0-9]+)%?'", sql_filter))
