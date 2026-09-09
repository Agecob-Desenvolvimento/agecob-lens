"""Consumer surfaces — every file that could restate a business definition.

A surface carries a ``tier`` that feeds blast-radius scoring:

* ``canonical``  — the source of truth; never flagged against itself
* ``contract``   — always-loaded or authoritative docs (CLAUDE.md, README, regras/, specs/)
* ``code``       — executable backend / frontend
* ``test``       — pins behaviour; drift here is usually intentional
* ``historical`` — plans/, handoffs/, archive/, *.original.md — kept for the record
* ``fork``       — the tracked ``entrega-api/`` copy
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, List

from .canon import ROOT

_SKIP_DIRS = {
    "node_modules", "dist", "build", "__pycache__", ".git", "graphify-out", ".venv",
    "venv", "logs", "ds-bundle", ".obsidian", "dados_metas", "coverage",
    ".claude", ".design-sync", ".idea", ".vscode", ".pytest_cache", ".mypy_cache",
}
_CANONICAL = {
    "config/settings.py",
    "dominios/agente/metric_registry.json",
    "agecob-lens/docs/data-layer.md",
    "agecob-lens/docs/regras/id-rec-status.md",
    "docs/data-dictionary.md",
}
# Meta-docs whose job is to *discuss* drift or track work in progress — they
# quote both the right and the wrong form on purpose. Scanning them is noise.
_META_DOCS = {"DRIFT_REPORT.md", "docs/audits/sql-consistency.md"}


def _is_meta_doc(rel: str) -> bool:
    base = rel.rsplit("/", 1)[-1]
    return rel in _META_DOCS or base.startswith("PROGRESS") or base.startswith("HANDOFF-drift")
_CODE_EXT = {".py", ".ts", ".tsx", ".sql"}
_DOC_EXT = {".md"}


@dataclass(frozen=True)
class Surface:
    path: str          # POSIX, repo-relative
    tier: str
    text: str
    lines: List[str] = field(default_factory=list)
    line_starts: List[int] = field(default_factory=list)  # char offset of each line

    @staticmethod
    def make(path: str, tier: str, text: str) -> "Surface":
        lines = text.splitlines()
        starts, off = [], 0
        for ln in lines:
            starts.append(off)
            off += len(ln) + 1
        return Surface(path, tier, text, lines, starts)

    def line_of(self, offset: int) -> int:
        """0-based line index containing ``offset``."""
        import bisect
        return max(0, bisect.bisect_right(self.line_starts, offset) - 1)


def _tier(rel: str) -> str:
    if rel in _CANONICAL:
        return "canonical"
    if rel.startswith("entrega-api/"):
        return "fork"
    low = rel.lower()
    if rel.endswith(".original.md") or any(
        seg in low for seg in ("/archive/", "/arquivado/", "/handoffs/", "/plans/", "/analysis/",
                               "docs/handoffs", "-plan.md", "benchmark", "pipeline-")
    ):
        return "historical"
    if rel.startswith("tests/") or "/tests/" in rel or low.endswith(".test.ts") or low.endswith(".test.tsx"):
        return "test"
    if rel.endswith(".md"):
        contract = (
            rel in ("README.md", "CLAUDE.md")
            or rel.endswith("/CLAUDE.md")
            or "/docs/regras/" in rel
            or "/docs/specs/" in rel
            or "/docs/runbooks/" in rel
            or rel.startswith("docs/")
        )
        return "contract" if contract else "historical"
    return "code"


def iter_surfaces(root: Path = ROOT) -> Iterator[Surface]:
    for p in _walk(root):
        rel = p.relative_to(root).as_posix()
        if p.suffix.lower() not in _CODE_EXT | _DOC_EXT:
            continue
        if rel.startswith("scripts/drift/") or _is_meta_doc(rel):
            continue
        if rel == "tests/test_drift_sweep.py":       # its fixtures are deliberately wrong
            continue
        if rel.startswith("docs/audits/") and rel.endswith(".md"):
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        yield Surface.make(rel, _tier(rel), text)


def _walk(root: Path) -> Iterator[Path]:
    stack = [root]
    while stack:
        d = stack.pop()
        try:
            entries = list(d.iterdir())
        except OSError:
            continue
        for e in entries:
            if e.is_dir():
                if e.name not in _SKIP_DIRS:
                    stack.append(e)
            elif e.is_file():
                yield e
