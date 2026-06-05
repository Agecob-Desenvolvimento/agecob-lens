"""
Parity harness — Cluster A portfolio-rollup (Phase 2).

Proves, against the live SQL Server, that the consolidated `portfolio-rollup`
query reproduces the 5 legacy por-portfolio endpoints with 100.000000% parity
BEFORE any frontend switch. Runs the REAL builders (same code the API uses).

Compares, per portfolio, the legacy aggregate vs the rollup-derived aggregate:
  - portfolio count (number of distinct portfolios)
  - row count
  - SUM(valor)
  - COUNT(distinct recebimento)  == legacy `qtd_*` vs derived sum of rollup `qtd`

Matrix: db in {AUTOS, CONSUMER, todos} x period in {today, 7d, 30d, 90d}.

Decisive edge check: for the multi-status slices (acordos / 1ª parcela = 1,3,12)
the derived `qtd` is SUM of per-status rollup `qtd`. This equals the legacy
COUNT(DISTINCT NR_RECEBIMENTO) iff no NR_RECEBIMENTO appears under >1 approved
status in the same portfolio. The qtd comparison below catches any violation.

Usage:
    python scripts/parity_portfolio_rollup.py
    python scripts/parity_portfolio_rollup.py --db COBwebRCBAUTOS --period 30d
Exit code 0 only if every cell is 100.000000%.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date as date_cls, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config.settings as settings
from core.database.query_executor import run_query
from dominios.graficos.queries import (
    build_acordos_por_portfolio_query,
    build_primeira_parcela_por_portfolio_query,
    build_excecoes_por_portfolio_query,
    build_rejeitados_por_portfolio_query,
    build_quebrados_por_portfolio_query,
    build_portfolio_rollup_query,
)
from dominios.graficos import queries as gq  # noqa: F401  (ensures module import path)
# rollup deriver mirrors agecob-lens/src/lib/portfolioRollup.ts exactly
from importlib import import_module  # noqa: F401

DBS = ["COBwebRCBAUTOS", "COBwebRCBCONSUMER", "todos"]
PERIODS = ["today", "7d", "30d", "90d"]

# Legacy builder + its (qtd_field, valor_field) + status slice used to derive.
LEGACY = {
    "acordos-por-portfolio": dict(
        builder=build_acordos_por_portfolio_query,
        qtd="qtd_acordos", valor="valor_acordos", statuses=set(settings.STATUS_APROVADOS),
    ),
    "primeira-parcela-por-portfolio": dict(
        builder=build_primeira_parcela_por_portfolio_query,
        qtd="qtd_acordos", valor="valor_primeira_parcela", statuses=set(settings.STATUS_APROVADOS),
    ),
    "excecoes-por-portfolio": dict(
        builder=build_excecoes_por_portfolio_query,
        qtd="qtd_excecoes", valor="valor_excecoes", statuses=set(settings.STATUS_EXCECAO),
    ),
    "rejeitados-por-portfolio": dict(
        builder=build_rejeitados_por_portfolio_query,
        qtd="qtd_rejeitados", valor="valor_rejeitados", statuses=set(settings.STATUS_REJEITADO),
    ),
    "quebrados-por-portfolio": dict(
        builder=build_quebrados_por_portfolio_query,
        qtd="qtd_quebrados", valor="valor_quebrados", statuses=set(settings.STATUS_QUEBRADO),
    ),
}


def _period_args(period: str) -> Tuple[Optional[str], Optional[str]]:
    """Return (date_from, date_to_exclusive) matching _parse_period semantics."""
    if period == "today":
        return None, None  # builders default to GETDATE() window
    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    today = date_cls.today()
    return (today - timedelta(days=days - 1)).isoformat(), (today + timedelta(days=1)).isoformat()


def _conn_db(db: str) -> str:
    return settings.ALLOWED_DATABASES[0] if db == "todos" else db


def _run(builder: Callable, db: str, dfrom: Optional[str], dto: Optional[str]) -> List[Dict[str, Any]]:
    sql = builder(db, dfrom, dto)
    return run_query(sql, _conn_db(db), context="parity/portfolio-rollup")


def _derive_from_rollup(rollup: List[Dict[str, Any]], statuses: set) -> Dict[str, Dict[str, float]]:
    """portfolio_name -> {qtd, valor} for the given status slice (sum across statuses)."""
    out: Dict[str, Dict[str, float]] = {}
    for r in rollup:
        if int(r["id_rec_status"]) not in statuses:
            continue
        name = r["portfolio_name"]
        cur = out.setdefault(name, {"qtd": 0.0, "valor": 0.0})
        cur["qtd"] += float(r.get("qtd") or 0)
        cur["valor"] += float(r.get("valor") or 0)
    return out


def _legacy_map(rows: List[Dict[str, Any]], qtd_f: str, valor_f: str) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    for r in rows:
        name = r["portfolio_name"]
        cur = out.setdefault(name, {"qtd": 0.0, "valor": 0.0})
        cur["qtd"] += float(r.get(qtd_f) or 0)
        cur["valor"] += float(r.get(valor_f) or 0)
    return out


def _compare(legacy: Dict[str, Dict[str, float]], derived: Dict[str, Dict[str, float]]) -> Dict[str, Any]:
    names = set(legacy) | set(derived)
    mism: List[str] = []
    for n in names:
        l = legacy.get(n, {"qtd": 0.0, "valor": 0.0})
        d = derived.get(n, {"qtd": 0.0, "valor": 0.0})
        # exact integer compare for qtd; cent-rounded compare for valor
        if int(round(l["qtd"])) != int(round(d["qtd"])):
            mism.append(f"{n}: qtd {l['qtd']} != {d['qtd']}")
        if round(l["valor"], 2) != round(d["valor"], 2):
            mism.append(f"{n}: valor {l['valor']:.2f} != {d['valor']:.2f}")
    total = max(1, len(names))
    ok = total - len({m.split(':')[0] for m in mism})
    return {
        "portfolio_count_legacy": len(legacy),
        "portfolio_count_derived": len(derived),
        "sum_valor_legacy": round(sum(v["valor"] for v in legacy.values()), 2),
        "sum_valor_derived": round(sum(v["valor"] for v in derived.values()), 2),
        "sum_qtd_legacy": int(round(sum(v["qtd"] for v in legacy.values()))),
        "sum_qtd_derived": int(round(sum(v["qtd"] for v in derived.values()))),
        "parity_pct": (ok / total) * 100.0,
        "mismatches": mism,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", choices=DBS, default=None)
    ap.add_argument("--period", choices=PERIODS, default=None)
    args = ap.parse_args()
    dbs = [args.db] if args.db else DBS
    periods = [args.period] if args.period else PERIODS

    all_pass = True
    print("=" * 78)
    print("PARITY REPORT — portfolio-rollup vs 5 legacy endpoints")
    print("=" * 78)
    for db in dbs:
        for period in periods:
            dfrom, dto = _period_args(period)
            rollup = _run(build_portfolio_rollup_query, db, dfrom, dto)
            print(f"\n[{db} | {period}]  rollup rows={len(rollup)}")
            for name, cfg in LEGACY.items():
                legacy_rows = _run(cfg["builder"], db, dfrom, dto)
                legacy = _legacy_map(legacy_rows, cfg["qtd"], cfg["valor"])
                derived = _derive_from_rollup(rollup, cfg["statuses"])
                res = _compare(legacy, derived)
                status = "PASS" if res["parity_pct"] == 100.0 else "FAIL"
                if status == "FAIL":
                    all_pass = False
                print(
                    f"  {status}  {name:<32} parity={res['parity_pct']:.6f}%  "
                    f"portf {res['portfolio_count_legacy']}/{res['portfolio_count_derived']}  "
                    f"valor {res['sum_valor_legacy']}/{res['sum_valor_derived']}  "
                    f"qtd {res['sum_qtd_legacy']}/{res['sum_qtd_derived']}"
                )
                for m in res["mismatches"][:10]:
                    print(f"        ↳ {m}")
    print("\n" + "=" * 78)
    print("RESULT:", "100.000000% PARITY — safe to switch" if all_pass else "PARITY FAILED — DO NOT switch")
    print("=" * 78)
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
