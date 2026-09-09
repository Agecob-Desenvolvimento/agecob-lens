"""The sweep: every canonical definition against every consumer surface.

Findings are yielded (and journalled) as they are confirmed, so a killed run
resumes from ``graphify-out/drift/journal.ndjson`` without re-scanning.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Dict, List, Optional

import config.settings as settings

from .canon import Definition, ROOT, canonical_defs, excluded_agent_names
from .surfaces import Surface, iter_surfaces

_TUPLE_RE = re.compile(r"[(\[]\s*(\d+(?:\s*,\s*\d+)+)\s*[)\]]")
_PROSE_RE = re.compile(r"(?:status(?:es)?|ID_REC_STATUS)\b[^\d(]{0,24}(\d+(?:\s*,\s*\d+){1,7})", re.I)
_DERIVATION = re.compile(r"\+\s*(QUEBRA|exce|status|\()", re.I)
_NUMERIC_CTX = re.compile(r"DECIMAL\s*\(|NUMERIC\s*\(|\bFLOAT\b|VARCHAR\s*\(|\bCHAR\s*\(|\bCAST\s*\(|DATEADD|VERSION|v\d+\.\d", re.I)

# A line that is *recording history* or *quoting a diff* is not an authoritative
# restatement — it names the wrong form on purpose. Kept deliberately narrow so
# it does not eat definitional "label it X, never Y" sentences.
_EXPLANATORY = re.compile(
    r"substitu[ií]|supersed|deprecat|desatualiz|\bstale\b|\bretired\b|era\s+chamad|"
    r"foi\s+(substitu|renomead|trocad)|changelog|hist[oó]ric|used\s+to\s+be|"
    r"was\s+defined\s+as|corrected\s+to|revert\s+of|antes\s+(virava|devolvia)|"
    r"o\s+erro\s+mais\s+prov|fires\s+on|failure\s+mode|too\s+broad|"
    r"diff\s+--git|^@@ |^[+-]{3}\s|^[+-]\S|até\s+2026-0[1-7]|"
    r"canonical\s+(uses|denominator|is|form|value)|perdeu\s+.\"?\d|remove[u]?\s+c[óo]digo",
    re.I,
)
_COMMENT = re.compile(r"\s*(--|//|#|\*\s|/\*)")


def _is_comment(line: str) -> bool:
    return bool(_COMMENT.match(line))
# Wrong form and the canonical form on the same line ⇒ a "was X, now Y" correction.
_CANON_HINT = {
    "conversao": r"qtd_acordos\s*/\s*qtd_contatos",
    "taxa_contato": r"qtd_alo\s*/\s*qtd_acionamentos",
    "cpc_predicate": r"ALO\s*=\s*1\s+AND\s+CONTATO\s*=\s*1",
}
_STATUS_NAMES = {
    "status_aprovados": "STATUS_APROVADOS", "status_gerados": "STATUS_GERADOS",
    "status_universo": "STATUS_UNIVERSO", "status_portfolio_rollup": "STATUS_PORTFOLIO_ROLLUP",
}
_STATUS_VALUE_NAME: Optional[Dict[frozenset, str]] = None


def _status_value_name() -> Dict[frozenset, str]:
    global _STATUS_VALUE_NAME
    if _STATUS_VALUE_NAME is None:
        _STATUS_VALUE_NAME = {
            frozenset(d.value): _STATUS_NAMES.get(d.key, d.key.upper())
            for d in canonical_defs() if d.kind == "status_set"
        }
    return _STATUS_VALUE_NAME


def _sibling_mention(t: tuple, line: str) -> bool:
    """True when ``t`` is the *correct* value of a different status constant that
    the line names — a labelled sibling in a reference list, not a divergence."""
    name = _status_value_name().get(frozenset(t))
    return bool(name and name.lower() in line.lower())


class _CompiledDef:
    __slots__ = ("d", "ctx", "wrong")

    def __init__(self, d: Definition):
        self.d = d
        self.ctx = re.compile(d.context, re.I)
        self.wrong = [(re.compile(w.pattern, re.I),
                       re.compile(w.absent, re.I) if w.absent else None, w) for w in d.wrong]


def _compiled() -> List["_CompiledDef"]:
    return [_CompiledDef(d) for d in canonical_defs()]


@dataclass
class Finding:
    def_key: str
    path: str
    line: int
    kind: str            # contradiction | near_miss | retired_token | unlinked_literal | superseded_adr | stale_citation | unguarded
    canonical: str
    found: str
    excerpt: str
    why: str
    tier: str
    fix_class: str = "human"
    reach: int = 1
    liveness: int = 1
    guard: float = 2.0

    @property
    def blast(self) -> float:
        return round(self.reach * self.liveness * self.guard, 1)

    def id(self) -> str:
        return "{}::{}::{}".format(self.def_key, self.path, self.line)


# ── per-line checks ────────────────────────────────────────────────────────────

def _int_tuples(line: str) -> List[tuple]:
    out: List[tuple] = []
    for rx in (_TUPLE_RE, _PROSE_RE):
        for m in rx.finditer(line):
            nums = tuple(int(x) for x in re.findall(r"\d+", m.group(1)))
            if nums not in out:
                out.append(nums)
    return out


def _status_setish(t: tuple) -> bool:
    return 2 <= len(t) <= 8 and len(set(t)) == len(t) and all(1 <= n <= 12 for n in t)


def scan(surf: Surface, cd: "_CompiledDef") -> List[Finding]:
    """Every place ``cd``'s context appears on a line in ``surf``, that line
    checked for drift. Context and value must sit on the same line; only a
    markdown heading extends the look-ahead."""
    defn = cd.d
    out: List[Finding] = []
    seen_lines = set()
    for m in cd.ctx.finditer(surf.text):
        for i in _target_lines(surf, m.start()):
            if i in seen_lines:
                continue
            line = surf.lines[i]
            if _EXPLANATORY.search(line):
                continue
            hit = _check(surf, i, line, cd, defn)
            out.extend(hit)
            if hit:
                seen_lines.add(i)
    return out


def _target_lines(surf: Surface, offset: int) -> List[int]:
    base = surf.line_of(offset)
    if not surf.path.endswith(".md"):          # in code, `#` is a comment, not a heading
        return [base]
    line = surf.lines[base] if base < len(surf.lines) else ""
    if re.match(r"\s*#{1,6}\s|\s*\d+\.\s|.*:\s*$", line):   # heading / list intro / "…:"
        nxt = [j for j in range(base + 1, min(base + 5, len(surf.lines)))
               if surf.lines[j].strip() and not surf.lines[j].strip().startswith("```")]
        return [base] + nxt[:2]
    return [base]


def _check(surf: Surface, i: int, line: str, cd: "_CompiledDef", defn: Definition) -> List[Finding]:
    out: List[Finding] = []
    hint = _CANON_HINT.get(defn.key)
    correction_line = bool(hint and re.search(hint, line, re.I))   # wrong + right form together
    for rx, absent_rx, w in cd.wrong:
        if correction_line:
            continue
        if rx.search(line) and not (absent_rx and absent_rx.search(line)):
            kind = "retired_token" if ("retired" in w.why or "allowlist" in w.why) else "contradiction"
            out.append(_mk(surf, i, defn, kind, _first(rx, line), w.why))

    if defn.kind == "status_set" and not _DERIVATION.search(line) and not _NUMERIC_CTX.search(line):
        tuples = [t for t in _int_tuples(line) if len(t) >= 3 and _status_setish(t)]
        if any(set(t) == set(defn.value) for t in tuples):
            return out                                      # line states the canonical value: a reference list
        for t in tuples:
            if set(t) == set(defn.value) or _sibling_mention(t, line):
                continue
            if len(tuples) == 1 or _close(cd.ctx, line):
                out.append(_mk(surf, i, defn, "near_miss", _fmt(t), "status set diverges from canonical"))
    return out


def _close(ctx_rx: "re.Pattern", line: str) -> bool:
    cm = ctx_rx.search(line)
    tm = re.search(r"[(\[]\s*\d", line)
    return bool(cm and tm and 0 <= tm.start() - cm.end() <= 34)


def _first(rx: "re.Pattern", line: str) -> str:
    m = rx.search(line)
    return m.group(0) if m else rx.pattern


def _fmt(t: tuple) -> str:
    return "(" + ", ".join(str(x) for x in t) + ")"


def _mk(surf: Surface, i: int, defn: Definition, kind: str, found: str, why: str) -> Finding:
    canon = defn.value if not isinstance(defn.value, tuple) else _fmt(defn.value)
    return Finding(
        def_key=defn.key, path=surf.path, line=i + 1, kind=kind,
        canonical=str(canon), found=str(found), excerpt=surf.lines[i].strip()[:200],
        why=why, tier=surf.tier,
    )


# ── cross-surface checks (not line-local) ─────────────────────────────────────

def cross_checks(surfaces: List[Surface]) -> List[Finding]:
    out: List[Finding] = []
    out += _excluded_agent_gap()
    out += _adr_supersede(surfaces)
    out += _registry_citations()
    out += _unlinked_frontend_literals(surfaces)
    out += _unguarded_prompt(surfaces)
    return out


def _excluded_agent_gap() -> List[Finding]:
    sql = excluded_agent_names(settings.FILTRO_AGENTES_EXCLUIDOS_SQL)
    py = {n.upper() for n in settings.EXCLUDED_AGENT_EXACT_NAMES} | {p.upper() for p in settings.EXCLUDED_AGENT_PREFIXES}
    missing = sql - py
    if not missing:
        return []
    return [Finding(
        "excluded_agents", "config/settings.py", 42, "contradiction",
        "mirror of FILTRO_AGENTES_EXCLUIDOS_SQL", "missing " + ", ".join(sorted(missing)),
        "EXCLUDED_AGENT_EXACT_NAMES/PREFIXES", "Python tuples used by dominios/agente/tools.py:597 are narrower "
        "than the SQL filter; refactor-main-py.md:111 wrongly says they mirror it",
        tier="code", fix_class="human", reach=2, liveness=3, guard=2.0,
    )]


def _adr_supersede(surfaces: List[Surface]) -> List[Finding]:
    by_path = {s.path: s for s in surfaces}
    dec = by_path.get("agecob-lens/docs/regras/decisoes-tecnicas.md")
    if not dec or "ADR-006" not in dec.text or "SUPERSEDED" not in dec.text.upper():
        return []
    out: List[Finding] = []
    for path in ("agecob-lens/docs/data-layer.md", "docs/data-dictionary.md"):
        s = by_path.get(path)
        if not s:
            continue
        for i, ln in enumerate(s.lines):
            if re.search(r"ADR-006", ln) and not re.search(r"ADR-01[23]", ln):
                out.append(Finding(
                    "adr_ref", path, i + 1, "superseded_adr", "ADR-013 (ADR-006 → ADR-012 → ADR-013)",
                    "ADR-006", ln.strip()[:200],
                    "decisoes-tecnicas.md marks ADR-006 superseded by ADR-012/013", tier=s.tier,
                    fix_class="auto", reach=2, liveness=3, guard=2.0,
                ))
                break
    return out


def _registry_citations() -> List[Finding]:
    reg = json.loads((ROOT / "dominios/agente/metric_registry.json").read_text(encoding="utf-8"))
    out: List[Finding] = []
    for name, kpi in reg.get("kpis", {}).items():
        src = kpi.get("source", "")
        m = re.match(r"([\w/\.]+\.py):(\d+)", src)
        if not m:
            continue
        f = ROOT / m.group(1)
        n = int(m.group(2))
        if not f.exists():
            continue
        body = f.read_text(encoding="utf-8", errors="replace").splitlines()
        if n > len(body):
            out.append(_citation_finding(name, src, "line past EOF"))
            continue
        near = " ".join(body[max(0, n - 3): n + 2]).lower()
        token = _expected_token(name)
        if token and token not in near:
            out.append(_citation_finding(name, src, "expected '%s' near line %d" % (token, n)))
    return out


def _expected_token(kpi_name: str) -> Optional[str]:
    return {
        "taxa_contato_pct": "_ratio_pct", "taxa_cpc_pct": "_ratio_pct",
        "desconto_medio_percentual": "vr_original", "valor_primeira_parcela": "valor_p1",
    }.get(kpi_name)


def _citation_finding(name: str, src: str, why: str) -> Finding:
    return Finding(
        "registry_citation", "dominios/agente/metric_registry.json", 1, "stale_citation",
        "symbol-anchored citation", src, "kpis.%s.source" % name,
        "build_metric_registry.py admits file:line citations drift; " + why,
        tier="canonical", fix_class="auto", reach=1, liveness=1, guard=1.5,
    )


def _unlinked_frontend_literals(surfaces: List[Surface]) -> List[Finding]:
    out: List[Finding] = []
    status_defs = [d for d in canonical_defs() if d.kind == "status_set"]
    rx = re.compile(r"(?:const|let)\s+STATUS_\w+\s*=\s*\[([\d,\s]+)\]")
    for s in surfaces:
        if not s.path.endswith((".ts", ".tsx")) or "STATUS_" not in s.text:
            continue
        for i, ln in enumerate(s.lines):
            m = rx.search(ln)
            if not m:
                continue
            nums = tuple(int(x) for x in re.findall(r"\d+", m.group(1)))
            match_key = next((d.key for d in status_defs if set(d.value) == set(nums)), None)
            out.append(Finding(
                match_key or "status_set", s.path, i + 1, "unlinked_literal",
                "shared constant / API meta", _fmt(nums), ln.strip()[:200],
                "backend status set re-typed in frontend with no link to config/settings.py",
                tier="code", fix_class="human", reach=2, liveness=1, guard=1.5,
            ))
    return out


def _unguarded_prompt(surfaces: List[Surface]) -> List[Finding]:
    s = next((x for x in surfaces if x.path == "dominios/agente/system_prompt.md"), None)
    if not s:
        return []
    hits = len(re.findall(r"status\s+\d+(?:,\s*\d+)+|ALO\s*=\s*1|≤\s*\d+%|MAX\(exce", s.text, re.I))
    if hits < 3:
        return []
    return [Finding(
        "system_prompt", s.path, 1, "unguarded", "a drift test (none today)",
        "%d hard-coded constants in prose" % hits, "# Regras de negócio (invioláveis)",
        "8 business constants live as prose here; test_metric_registry.py covers the JSON, not this file; "
        "the prompt shipped the conversão formula backwards until commit 2203e2c",
        tier="contract", fix_class="human", reach=6, liveness=1, guard=2.0,
    )]


# ── scoring ──────────────────────────────────────────────────────────────────

_TIER_REACH = {"contract": 6, "canonical": 5, "code": 4, "fork": 3, "test": 2, "historical": 1}
_LIVE_KINDS = ("contradiction", "near_miss", "retired_token", "superseded_adr")


def score(f: Finding, siblings: int, graph_reach: Optional[int]) -> Finding:
    if f.reach == 1:  # not already set by a cross-check
        base = _TIER_REACH.get(f.tier, 2)
        bonus = min((graph_reach or 0) // 20, 3)
        f.reach = min(base + min(siblings, 3) + bonus, 12)
    if f.liveness == 1:
        if f.kind in _LIVE_KINDS:
            f.liveness = 2 if f.tier in ("historical", "test") else 3
    if _is_comment(f.excerpt) and f.liveness > 2:
        f.liveness = 2                         # a comment is not a live definition
    if f.guard == 2.0 and f.tier == "test":
        f.guard = 1.0
    return f


def classify(f: Finding) -> str:
    """auto = a stale line in a non-canonical `.md` contract doc, where the fix is
    to align the text to config/settings.py / data-layer.md and nothing else.
    Everything with a decision attached (fork, code, prompt, cross-boundary
    constant, ADR renumber in a canonical doc) stays human."""
    doc = f.path.endswith(".md")
    safe_kind = f.kind in ("contradiction", "near_miss", "retired_token")
    if doc and safe_kind and f.tier == "contract":
        return "auto"
    return "human"


# ── orchestration ────────────────────────────────────────────────────────────

def sweep(journal=None, graph: Optional[dict] = None,
          surfaces: Optional[List[Surface]] = None) -> List[Finding]:
    cdefs = _compiled()
    if surfaces is None:
        surfaces = list(iter_surfaces())
    done_pairs = journal.seen_pairs() if journal else set()
    raw: List[Finding] = list(journal.load_findings()) if journal else []

    for surf in surfaces:
        if surf.tier == "canonical":
            continue
        for cd in cdefs:
            pair = surf.path + "|" + cd.d.key
            if pair in done_pairs:
                continue
            for f in scan(surf, cd):
                raw.append(f)
                if journal:
                    journal.write(f)
            if journal:
                journal.mark(pair)

    if "__cross__" not in done_pairs:
        for f in cross_checks(surfaces):
            raw.append(f)
            if journal:
                journal.write(f)
        if journal:
            journal.mark("__cross__")

    raw = _dedupe(raw)
    counts: Dict[str, int] = {}
    for f in raw:
        counts[f.def_key] = counts.get(f.def_key, 0) + 1
    graph_reach = _graph_reach(graph) if graph else {}
    for f in raw:
        f.fix_class = classify(score(f, counts.get(f.def_key, 1), graph_reach.get(f.def_key)))
    raw.sort(key=lambda f: (f.blast, f.path, f.line), reverse=True)
    return raw


def _dedupe(findings: List[Finding]) -> List[Finding]:
    best: Dict[str, Finding] = {}
    for f in findings:
        key = "{}|{}|{}".format(f.def_key, f.path, f.line)
        if key not in best:
            best[key] = f
    return list(best.values())


def _graph_reach(graph: dict) -> Dict[str, int]:
    reach: Dict[str, int] = {}
    links = graph.get("links", graph.get("edges", []))
    for e in links:
        tgt = str(e.get("target", "")).lower()
        for key in ("universo", "gerados", "aprovados", "cpc", "conversao", "contato", "dedup"):
            if key in tgt:
                reach[_canon_key(key)] = reach.get(_canon_key(key), 0) + 1
    return reach


def _canon_key(k: str) -> str:
    return {"universo": "status_universo", "gerados": "status_gerados", "aprovados": "status_aprovados",
            "cpc": "cpc_predicate", "conversao": "conversao", "contato": "taxa_contato",
            "dedup": "dedup_partition"}.get(k, k)
