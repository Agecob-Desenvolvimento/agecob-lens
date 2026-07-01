"""
Variante do relatório de /carteiras com CPF COMPLETO (sem máscara).
Autorizado pelo dono dos dados. Reusa a infra sancionada do projeto
(build_acordos_detalhe_global_query + run_query), trocando só a expressão de
máscara por CPF_CNPJ cheio. Metas/real vêm da API ao vivo (sem PII).
Uso único / ad-hoc — não faz parte do build.
"""
import os
import re
import sys
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config.settings as settings
from core.database.query_executor import run_query
from dominios.graficos.queries import build_acordos_detalhe_global_query

BASE = "http://192.168.0.20:8000"
DB = "todos"
MES = "202606"
MES_FROM, MES_TO_EXCL = "2026-06-01", "2026-07-01"  # to_exclusive (igual _parse_period)
HOJE = "2026-06-25"
DIAS_UTEIS_MES = 18
OUT = r"C:\Users\Edson Vitor TI\Documents\dash relatorio\relatorio-carteiras-202606-cpf.csv"
DELIM = ";"


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fmt_cell(v):
    if v is None or v == "":
        return ""
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, (int, float)):
        if float(v).is_integer():
            return str(int(v))
        return f"{v:.2f}".replace(".", ",")
    s = str(v)
    if any(c in s for c in '";\n\r'):
        return '"' + s.replace('"', '""') + '"'
    return s


def build_csv(meta, sections):
    lines = []
    for k, val in meta.items():
        lines.append(f"{fmt_cell(k)}{DELIM}{fmt_cell(val)}")
    lines.append("")
    for s in sections:
        lines.append(fmt_cell(f"## {s['label']}"))
        lines.append(DELIM.join(fmt_cell(c) for c in s["columns"]))
        for row in s["rows"]:
            lines.append(DELIM.join(fmt_cell(c) for c in row))
        lines.append("")
    return "﻿" + "\r\n".join(lines)


# ── Acordos individuais com CPF cheio (via DB sancionado) ─────────────────────
sql = build_acordos_detalhe_global_query(DB, MES_FROM, MES_TO_EXCL)
sql_unmasked, n = re.subn(
    r"CASE\s+WHEN LEN\(D\.CPF_CNPJ\) >= 5.*?END AS cpf_mask",
    "D.CPF_CNPJ AS cpf_mask",
    sql,
    flags=re.DOTALL,
)
print("máscaras removidas:", n)
conn_db = settings.ALLOWED_DATABASES[0]
acordos_rows = run_query(sql_unmasked, conn_db, context="adhoc/relatorio-carteiras-cpf")
acordos_rows.sort(key=lambda a: ((a.get("portfolio_name") or ""), -(a.get("valor_primeira_parcela") or 0)))

# ── Metas + real via API (sem PII) ────────────────────────────────────────────
metas_env = get("/dashboard/metas")
real_mes = get(f"/dashboard/real-por-portfolio/{DB}?dateFrom=2026-06-01&dateTo=2026-06-30")
real_hoje = get(f"/dashboard/real-por-portfolio/{DB}?dateFrom={HOJE}&dateTo={HOJE}")

metas_filtradas = []
for m in metas_env.get("metas", []):
    mc = (m.get("meta_caixa") or {}).get(MES, 0) or 0
    if mc > 0:
        metas_filtradas.append({
            "portfolio": m["portfolio"], "grupo": m.get("grupo"),
            "qtd_negociadores": m.get("qtd_negociadores", 0) or 0, "meta_caixa": mc,
        })
metas_filtradas.sort(key=lambda x: x["meta_caixa"], reverse=True)

real_map = {r["portfolio_name"]: r for r in real_mes.get("data", [])}
hoje_map = {r["portfolio_name"]: r for r in real_hoje.get("data", [])}
total_meta_caixa = sum(m["meta_caixa"] for m in metas_filtradas)
meta_dia = total_meta_caixa / DIAS_UTEIS_MES if total_meta_caixa > 0 else 0
geracao_hoje = sum((hoje_map.get(m["portfolio"], {}).get("valor_primeira_parcela", 0) or 0)
                   for m in metas_filtradas)

# ── Seções ────────────────────────────────────────────────────────────────────
sec_meta_real = {
    "label": "Meta vs Real por Carteira (mês)",
    "columns": ["Portfólio", "Grupo", "Negociadores", "Meta Caixa (R$)",
                "Caixa Recebido Mês (R$)", "1ª Parcela Mês (R$)", "Qtd Acordos", "Atingimento (%)"],
    "rows": [],
}
for m in metas_filtradas:
    r = real_map.get(m["portfolio"])
    ating = (r["valor_recebido"] / m["meta_caixa"] * 100) if (m["meta_caixa"] > 0 and r) else ""
    sec_meta_real["rows"].append([
        m["portfolio"], m.get("grupo") or "", m["qtd_negociadores"], m["meta_caixa"],
        (r or {}).get("valor_recebido", ""), (r or {}).get("valor_primeira_parcela", ""),
        (r or {}).get("qtd_acordos", ""), ating,
    ])

sec_meta_dia = {
    "label": "Meta do Dia (agregado)",
    "columns": ["Métrica", "Valor"],
    "rows": [
        ["Total Meta Caixa do mês (R$)", total_meta_caixa],
        [f"Meta do dia (R$) — Meta Caixa ÷ {DIAS_UTEIS_MES}", meta_dia],
        ["1ª Parcela gerada hoje (R$)", geracao_hoje],
        ["Atingimento do dia (%)", (geracao_hoje / meta_dia * 100) if meta_dia > 0 else ""],
    ],
}

sec_acordos = {
    "label": "Acordos por Carteira (individual, mês) — CPF completo",
    "columns": ["Carteira", "Nº Recebimento", "Devedor", "CPF", "Agente", "Matrícula",
                "Valor 1ª Parcela (R$)", "Valor Total Acordo (R$)", "Parcelas", "Data Acordo", "Vencimento"],
    "rows": [[
        a.get("portfolio_name") or "—", a.get("NR_RECEBIMENTO"), a.get("nome_devedor"),
        a.get("cpf_mask"), a.get("agente"), a.get("matricula"),
        a.get("valor_primeira_parcela"), a.get("valor_total"), a.get("total_parcelas"),
        a.get("data_acordo") or "", a.get("data_vencimento") or "",
    ] for a in acordos_rows],
}

meta_block = {
    "Relatório": "Carteiras — Meta vs Real (CPF completo)",
    "Mês": "Junho 2026", "Banco": DB, "Carteira": "Todas",
    "Trimestre metas": metas_env.get("meta", {}).get("periodo", "—"),
    "Gerado em": "2026-06-25",
}

csv = build_csv(meta_block, [sec_meta_real, sec_meta_dia, sec_acordos])
with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write(csv)

print("OK ->", OUT)
print("carteiras:", len(metas_filtradas), "| acordos:", len(acordos_rows))
