"""Autonomous business-definition drift detector.

Cross-checks every canonical constant (status sets, CPC, dedup, date window, KPI
formulas, risk thresholds) against every consumer surface — code, SQL, docs,
ADRs, the agent system prompt, the tracked `entrega-api/` fork — and reports each
place a definition diverges from `config/settings.py` / `data-layer.md`.

Wrapper layer around graphify: consumes `graphify-out/graph.json` for blast-radius
reach when present, writes findings incrementally so a killed run resumes, and
leaves the pip package untouched.
"""
