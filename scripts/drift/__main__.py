"""CLI:

    python -m scripts.drift                     # sweep, write DRIFT_REPORT.md
    python -m scripts.drift --resume            # continue a killed sweep from the journal
    python -m scripts.drift --json              # findings to stdout as JSON, no report
    python -m scripts.drift --fix-vault-filenames [--apply]   # repair graphify-out/ names
"""
from __future__ import annotations

import argparse
import json
import sys
import time

for _stream in (sys.stdout, sys.stderr):          # Windows console is cp1252
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass

from .canon import ROOT
from .detect import sweep
from .fsnames import fix_vault_filenames
from .journal import Journal
from .report import write_report
from .surfaces import iter_surfaces


def _load_graph():
    p = ROOT / "graphify-out" / "graph.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m scripts.drift")
    ap.add_argument("--resume", action="store_true", help="continue from graphify-out/drift/ journal")
    ap.add_argument("--json", action="store_true", help="print findings as JSON, skip DRIFT_REPORT.md")
    ap.add_argument("--top", type=int, default=0, help="print only the top N findings")
    ap.add_argument("--fix-vault-filenames", action="store_true", help="repair Windows-unsafe names in graphify-out/")
    ap.add_argument("--apply", action="store_true", help="with --fix-vault-filenames: actually rename (default dry-run)")
    ap.add_argument("--timing", action="store_true", help="print phase timings to stderr")
    args = ap.parse_args(argv)

    if args.fix_vault_filenames:
        res = fix_vault_filenames(str(ROOT / "graphify-out"), apply=args.apply)
        print(json.dumps({k: v for k, v in res.items() if k != "pairs"}, indent=2))
        for old, new in res["pairs"][:40]:
            print("  {}  ->  {}".format(old, new))
        return 0

    t0 = time.time()
    surfaces = list(iter_surfaces())
    if args.timing:
        print("surfaces: {} in {:.1f}s".format(len(surfaces), time.time() - t0), file=sys.stderr)
    journal = Journal()
    if not args.resume:
        journal.reset()
    t1 = time.time()
    try:
        findings = sweep(journal=journal, graph=_load_graph(), surfaces=surfaces)
    finally:
        journal.close()
    if args.timing:
        print("sweep: {:.1f}s".format(time.time() - t1), file=sys.stderr)

    if args.top:
        findings = findings[: args.top]

    if args.json:
        json.dump([_as_dict(f) for f in findings], sys.stdout, ensure_ascii=False, indent=2)
        print()
        return 0

    path = write_report(findings, len(surfaces))
    auto = sum(1 for f in findings if f.fix_class == "auto")
    print("{} findings ({} auto-fixable) -> {}".format(len(findings), auto, path.relative_to(ROOT)))
    for i, f in enumerate(findings[:10], 1):
        print("  {:2}. [{:>5}] {:<22} {}:{}  ({})".format(
            i, f.blast, f.def_key, f.path, f.line, f.fix_class))
    return 0


def _as_dict(f) -> dict:
    return {"def": f.def_key, "path": f.path, "line": f.line, "kind": f.kind,
            "class": f.fix_class, "blast": f.blast, "canonical": f.canonical,
            "found": f.found, "why": f.why, "excerpt": f.excerpt}


if __name__ == "__main__":
    raise SystemExit(main())
