"""Guards for the drift detector itself (scripts/drift).

Two things must hold: the canonical side is read from config/settings.py (never
re-typed), and the sweep flags the known divergences without flagging the
labelled-sibling / historical / correction lines that look similar.
"""
import json

import config.settings as settings
from scripts.drift import canon, detect, fsnames
from scripts.drift.surfaces import Surface


# ── canonical extraction ─────────────────────────────────────────────────────

def test_canonical_values_come_from_settings():
    by_key = {d.key: d for d in canon.canonical_defs()}
    assert by_key["status_universo"].value == tuple(sorted(settings.STATUS_UNIVERSO_ACORDOS))
    assert by_key["status_gerados"].value == tuple(sorted(settings.STATUS_GERADOS))
    assert by_key["status_aprovados"].value == (1, 3, 12)
    assert by_key["risk_low"].value == settings.RISK_LEVEL_LOW_MAX
    assert by_key["boleto_grace_days"].value == 5


def test_taxa_contato_canonical_is_qtd_alo_not_qtd_contatos():
    reg = json.loads((canon.ROOT / "dominios/agente/metric_registry.json").read_text(encoding="utf-8"))
    tc = next(d for d in canon.canonical_defs() if d.key == "taxa_contato")
    assert "qtd_alo" in tc.value and "qtd_contatos" not in tc.value
    assert "qtd_alo" in reg["kpis"]["taxa_contato_pct"]["formula"]


# ── Windows-safe filenames ───────────────────────────────────────────────────

def test_safe_filename_strips_windows_hostiles():
    out = fsnames.safe_filename("Row\tcount: a/b <x> \"q\" |z*  ")
    assert "\t" not in out and ":" not in out and "/" not in out
    assert not out[:-3].endswith(".") and not out[:-3].endswith(" ")
    assert out.endswith(".md")


def test_safe_filename_reserved_stem_and_trailing_dot():
    assert fsnames.safe_filename("CON").startswith("_CON")
    assert fsnames.safe_filename("timeout de query.") == "timeout de query.md"


def test_unique_filename_numbers_collisions():
    taken = set()
    a = fsnames.unique_filename("dup", taken)
    b = fsnames.unique_filename("dup", taken)
    assert a == "dup.md" and b == "dup_2.md"


# ── sweep: catches real drift ────────────────────────────────────────────────

def _surface(path, text, tier="contract"):
    return Surface.make(path, tier, text)


def test_flags_wrong_universo_tuple_in_a_doc():
    s = _surface("agecob-lens/docs/specs/x.md",
                 "- `STATUS_UNIVERSO_ACORDOS = (1, 3, 5, 12)` — the pre-filter CTE.\n")
    fs = detect.sweep(surfaces=[s])
    hit = [f for f in fs if f.def_key == "status_universo" and f.kind == "near_miss"]
    assert hit and "(1, 3, 5, 12)" in hit[0].found


def test_flags_retired_cpc_allowlist():
    s = _surface("docs/x.md", "CPC uses `CPC_COMPLEMENTO_IDS = (252, 130, 110)` — do not change.\n")
    fs = detect.sweep(surfaces=[s])
    assert any(f.def_key == "cpc_predicate" and f.kind == "retired_token" for f in fs)


def test_flags_wrong_conversao_denominator():
    s = _surface("agecob-lens/docs/regras/x.md", "| Conversão | `qtd_acordos / qtd_acionamentos * 100` | |\n")
    fs = detect.sweep(surfaces=[s])
    assert any(f.def_key == "conversao" and f.kind == "contradiction" for f in fs)


# ── sweep: does NOT flag look-alikes ─────────────────────────────────────────

def test_reference_list_stating_canonical_is_not_flagged():
    s = _surface("docs/x.md",
                 "Pre-filter CTE is `STATUS_UNIVERSO_ACORDOS` = (1, 2, 3, 5, 10, 12).\n")
    fs = detect.sweep(surfaces=[s])
    assert not [f for f in fs if f.def_key == "status_universo"]


def test_labelled_sibling_tuple_is_not_flagged():
    s = _surface("docs/x.md",
                 "The generated set excludes exception: `STATUS_APROVADOS` (1, 3, 12) is narrower.\n")
    fs = detect.sweep(surfaces=[s])
    assert not [f for f in fs if f.def_key == "status_gerados" and f.kind == "near_miss"]


def test_historical_correction_line_is_not_flagged():
    s = _surface("docs/handoffs/h.md",
                 "`Taxa de conversão = qtd_acordos/qtd_acionamentos` (canonical denominator is `qtd_contatos`).\n",
                 tier="historical")
    fs = detect.sweep(surfaces=[s])
    assert not [f for f in fs if f.def_key == "conversao"]


def test_decimal_literal_is_not_a_status_set():
    s = _surface("dominios/x.py",
                 "value gerado: CAST(A.PLANO AS DECIMAL(10, 2)) -- STATUS_GERADOS basis\n", tier="code")
    fs = detect.sweep(surfaces=[s])
    assert not [f for f in fs if f.kind == "near_miss"]


# ── cross-checks ─────────────────────────────────────────────────────────────

def test_excluded_agent_gap_detected():
    fs = detect._excluded_agent_gap()
    # settings.py Python tuples are narrower than the SQL filter today
    assert fs and "FT5SYSTEM" in fs[0].found


def test_classify_auto_only_for_contract_docs():
    doc = detect.Finding("conversao", "agecob-lens/docs/specs/x.md", 1, "contradiction",
                         "a", "b", "c", "d", tier="contract")
    code = detect.Finding("conversao", "dominios/x.py", 1, "contradiction",
                          "a", "b", "c", "d", tier="code")
    assert detect.classify(doc) == "auto"
    assert detect.classify(code) == "human"
