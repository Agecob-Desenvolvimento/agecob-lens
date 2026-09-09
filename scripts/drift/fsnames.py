"""Windows-safe filenames for the per-finding artifacts, plus a one-shot repair
pass for an existing graphify Obsidian/wiki vault.

graphify builds node filenames straight from labels. A label with ``:``, ``/``, a
tab, a trailing ``.``, or a reserved stem (``CON``, ``PRN``…) yields a name
Windows silently mangles or rejects. This is the wrapper's filename gate — the
pip package is left alone.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

_RESERVED_STEMS = {"CON", "PRN", "AUX", "NUL"}
_RESERVED_STEMS |= {"COM{}".format(i) for i in range(1, 10)}
_RESERVED_STEMS |= {"LPT{}".format(i) for i in range(1, 10)}

# Readable swaps first; anything left that is still illegal gets stripped.
_SUBS = {
    ord(":"): " -", ord("/"): "-", ord("\\"): "-", ord("|"): "-",
    ord("<"): "(", ord(">"): ")", ord("*"): "+", ord("?"): "",
    ord('"'): "'", ord("\t"): " ",
}
_ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_TRAILING = re.compile(r"[ .]+$")


def safe_filename(label: str, ext: str = ".md", max_stem: int = 120) -> str:
    """A single label → one valid, readable Windows filename. Not reversible;
    callers keep the real label in the file's own frontmatter."""
    stem = label.translate(_SUBS)
    stem = _ILLEGAL.sub("", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    stem = _TRAILING.sub("", stem)
    if stem.split(".", 1)[0].upper() in _RESERVED_STEMS:
        stem = "_" + stem
    if len(stem) > max_stem:
        stem = _TRAILING.sub("", stem[:max_stem])
    return (stem or "untitled") + ext


def unique_filename(label: str, taken: set, ext: str = ".md") -> str:
    """safe_filename + numeric suffix on collision. Mutates ``taken``."""
    base = safe_filename(label, ext)
    if base.lower() not in taken:
        taken.add(base.lower())
        return base
    stem = base[: -len(ext)]
    n = 2
    while "{}_{}{}".format(stem, n, ext).lower() in taken:
        n += 1
    out = "{}_{}{}".format(stem, n, ext)
    taken.add(out.lower())
    return out


def _needs_fix(name: str) -> bool:
    stem = name[:-3] if name.endswith(".md") else name
    if _ILLEGAL.search(name) or _TRAILING.search(stem):
        return True
    return stem.split(".", 1)[0].upper() in _RESERVED_STEMS


def scan_vault(root: str) -> List[Tuple[str, str]]:
    """(old_name, new_name) for every pathological .md file under ``root``,
    skipping graphify's own working dirs."""
    base = Path(root)
    out: List[Tuple[str, str]] = []
    taken: set = set()
    for p in sorted(base.rglob("*.md")):
        rel = p.relative_to(base)
        if rel.parts and rel.parts[0] in {"cache", ".obsidian"}:
            continue
        if not _needs_fix(p.name):
            taken.add(p.name.lower())
            continue
        new = unique_filename(p.stem, taken)
        out.append((str(rel), str(rel.parent / new)))
    return out


def fix_vault_filenames(root: str, apply: bool = False) -> Dict[str, object]:
    """Rename pathological files and rewrite ``[[wikilinks]]`` that point at
    them. Dry-run unless ``apply=True``."""
    renames = scan_vault(root)
    if not renames:
        return {"renamed": 0, "links_rewritten": 0, "pairs": []}
    stem_map = {Path(o).stem: Path(n).stem for o, n in renames}
    links = 0
    base = Path(root)
    if apply:
        for old, new in renames:
            (base / old).rename(base / new)
        for md in base.rglob("*.md"):
            if md.relative_to(base).parts[:1] == ("cache",):
                continue
            text = md.read_text(encoding="utf-8")
            new_text = _rewrite_links(text, stem_map)
            if new_text != text:
                links += _count_changed(text, new_text)
                md.write_text(new_text, encoding="utf-8")
    return {
        "renamed": len(renames) if apply else 0,
        "would_rename": 0 if apply else len(renames),
        "links_rewritten": links,
        "pairs": renames,
    }


def _rewrite_links(text: str, stem_map: Dict[str, str]) -> str:
    def repl(m: "re.Match") -> str:
        inner = m.group(1)
        target, sep, rest = inner.partition("|")
        target = stem_map.get(target.strip(), target)
        return "[[" + target + sep + rest + "]]"

    return re.sub(r"\[\[([^\]]+)\]\]", repl, text)


def _count_changed(a: str, b: str) -> int:
    la = re.findall(r"\[\[([^\]]+)\]\]", a)
    lb = re.findall(r"\[\[([^\]]+)\]\]", b)
    return sum(1 for x, y in zip(la, lb) if x != y)


def write_namemap(path: str, renames: List[Tuple[str, str]]) -> None:
    Path(path).write_text(json.dumps(dict(renames), ensure_ascii=False, indent=2), encoding="utf-8")
