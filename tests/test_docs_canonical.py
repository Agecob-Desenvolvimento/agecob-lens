"""Regression guards for docs that restate business definitions.

Each of these docs drifted from `config/settings.py` / `data-layer.md` and was
realigned. The assertions run the drift detector on the single doc and require
zero `auto`-class findings — they would have failed before the realignment.

Run the sweep yourself: `python -m scripts.drift`
"""
from pathlib import Path

from scripts.drift.detect import sweep
from scripts.drift.surfaces import Surface, _tier

_ROOT = Path(__file__).resolve().parents[1]


def _auto_findings(rel_path: str):
    text = (_ROOT / rel_path).read_text(encoding="utf-8")
    surf = Surface.make(rel_path, _tier(rel_path), text)
    return [f for f in sweep(surfaces=[surf]) if f.fix_class == "auto"]


def test_refactor_main_py_has_no_auto_drift():
    hits = _auto_findings("agecob-lens/docs/specs/refactor-main-py.md")
    assert not hits, [f"{h.def_key} L{h.line}: {h.found}" for h in hits]


def test_mapa_kpis_dashboard_has_no_auto_drift():
    hits = _auto_findings("agecob-lens/docs/specs/mapa-kpis-dashboard.md")
    assert not hits, [f"{h.def_key} L{h.line}: {h.found}" for h in hits]


def test_regras_de_negocio_has_no_auto_drift():
    hits = _auto_findings("agecob-lens/docs/regras/regras-de-negocio.md")
    assert not hits, [f"{h.def_key} L{h.line}: {h.found}" for h in hits]


def test_agecob_lens_claude_md_has_no_auto_drift():
    hits = _auto_findings("agecob-lens/docs/CLAUDE.md")
    assert not hits, [f"{h.def_key} L{h.line}: {h.found}" for h in hits]
