"""Append-only run journal — every (surface|definition) pair marked done and every
finding written in full the moment it is confirmed, so a run killed by a crash or
a usage limit resumes without redoing work or losing findings.

Lives under ``graphify-out/drift/`` (gitignored working state). A run without
``--resume`` wipes it first; ``--resume`` rehydrates the findings already found
and only scans the pairs still pending.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, fields
from pathlib import Path
from typing import List, Optional, Set, TextIO

from .canon import ROOT

_DIR = ROOT / "graphify-out" / "drift"


class Journal:
    def __init__(self, path: Path = _DIR):
        self.dir = path
        self.dir.mkdir(parents=True, exist_ok=True)
        self.pairs = self.dir / "pairs.txt"
        self.findings = self.dir / "journal.ndjson"
        self._fh: Optional[TextIO] = None
        self._ph: Optional[TextIO] = None

    # -- resume support --
    def seen_pairs(self) -> Set[str]:
        if not self.pairs.exists():
            return set()
        return set(self.pairs.read_text(encoding="utf-8").split())

    def load_findings(self) -> List["object"]:
        from .detect import Finding
        if not self.findings.exists():
            return []
        keep = {f.name for f in fields(Finding)}
        out, ids = [], set()
        for ln in self.findings.read_text(encoding="utf-8").splitlines():
            if not ln.strip():
                continue
            d = json.loads(ln)
            f = Finding(**{k: v for k, v in d.items() if k in keep})
            if f.id() not in ids:
                ids.add(f.id())
                out.append(f)
        return out

    def reset(self) -> None:
        self.close()
        for f in (self.pairs, self.findings):
            _unlink_retry(f)

    # -- append --
    def mark(self, pair: str) -> None:
        if self._ph is None:
            self._ph = self.pairs.open("a", encoding="utf-8")
        self._ph.write(pair + "\n")
        self._ph.flush()

    def write(self, finding) -> None:
        if self._fh is None:
            self._fh = self.findings.open("a", encoding="utf-8")
        self._fh.write(json.dumps(asdict(finding), ensure_ascii=False) + "\n")
        self._fh.flush()

    def close(self) -> None:
        for h in (self._fh, self._ph):
            if h is not None:
                h.close()
        self._fh = self._ph = None


def _unlink_retry(f: Path, tries: int = 5) -> None:
    for k in range(tries):
        try:
            f.unlink(missing_ok=True)
            return
        except PermissionError:
            if k == tries - 1:
                raise
            time.sleep(0.2)
