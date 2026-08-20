"""
Drift test do metric_registry.json (D2/D9 do handoff agente-tools-handoff.md):
o registry versionado tem que bater byte-a-byte com o que
scripts/build_metric_registry.py geraria agora, e os valores de status têm
que bater com config/settings.py. Se este teste falhar, rode
`python scripts/build_metric_registry.py` de novo e versione o resultado —
nunca editar metric_registry.json à mão.
"""
import json
import os

from config.settings import (
    STATUS_APROVADOS,
    STATUS_EXCECAO,
    STATUS_GERADOS,
    STATUS_QUEBRADO,
    STATUS_QUEBRA_AUTOMATICA,
    STATUS_REJEITADO,
    STATUS_UNIVERSO_ACORDOS,
)
from scripts.build_metric_registry import build_registry

_REGISTRY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "dominios", "agente", "metric_registry.json",
)


def _load_registry():
    with open(_REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_registry_matches_settings():
    reg = _load_registry()
    assert reg["status"]["excecao"] == sorted(STATUS_EXCECAO) == [5]
    assert reg["status"]["universo_acordos"] == sorted(STATUS_UNIVERSO_ACORDOS) == [1, 2, 3, 5, 10, 12]
    assert reg["status"]["gerados"] == sorted(STATUS_GERADOS) == [1, 2, 3, 10, 12]
    assert reg["status"]["quebrado"] == sorted(STATUS_QUEBRADO) == [2]
    assert reg["status"]["aprovados"] == sorted(STATUS_APROVADOS) == [1, 3, 12]
    assert reg["status"]["rejeitado"] == sorted(STATUS_REJEITADO) == [7]
    assert reg["status"]["quebra_automatica"] == sorted(STATUS_QUEBRA_AUTOMATICA) == [10]


def test_registry_file_matches_build_output():
    """O JSON versionado não pode divergir do que o build script geraria agora."""
    on_disk = _load_registry()
    freshly_built = build_registry()
    assert on_disk == freshly_built


def test_registry_has_no_carga_lote():
    """carga_lote foi removido do rascunho original por não ter base no código (B4)."""
    reg = _load_registry()
    assert "carga_lote" not in reg["kpis"]
    assert "carga_lote" not in reg["caveats"]


def test_registry_tem_business_rules_migradas():
    """explain_business_rule foi retirada no P1 — as 5 regras migraram pra cá (§2.6)."""
    reg = _load_registry()
    for key in ("status_5", "denominador", "status_gerados", "thresholds"):
        assert key in reg["caveats"]
    assert "risco_composto_formula" in reg["kpis"]
    assert "25.0" in reg["caveats"]["thresholds"]
    assert "50.0" in reg["caveats"]["thresholds"]
