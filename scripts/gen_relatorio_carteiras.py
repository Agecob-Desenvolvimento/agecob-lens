"""
Gera o CSV do relatório de /carteiras batendo na API ao vivo, replicando
fielmente lib/csvReport.ts (buildReportCsv/fmtCell) e a lógica de Carteiras.tsx.
Uso único / ad-hoc — não faz parte do build.
"""
import json
import urllib.request

BASE = "http://192.168.0.20:8000"
DB = "todos"
MES = "202606"
MES_FROM, MES_TO = "2026-06-01", "2026-06-30"
HOJE = "2026-06-25"
DIAS_UTEIS_MES = 18
OUT = r"C:\Users\Edson Vitor TI\Documents\dash relatorio\relatorio-carteiras-202606.csv"

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
        cols, rows = s["columns"], s["rows"]
        lines.append(fmt_cell(f"## {s['label']}"))
        lines.append(DELIM.join(fmt_cell(c) for c in cols))
        for row in rows:
            lines.append(DELIM.join(fmt_cell(c) for c in row))
        lines.append("")
    return "﻿" + "\r\n".join(lines)


# ── Fetch ─────────────────────────────────────────────────────────────────────
metas_env = get("/dashboard/metas")
real_mes = get(f"/dashboard/real-por-portfolio/{DB}?dateFrom={MES_FROM}&dateTo={MES_TO}")
real_hoje = get(f"/dashboard/real-por-portfolio/{DB}?dateFrom={HOJE}&dateTo={HOJE}")
acordos = get(f"/dashboard/acordos-detalhe-todos/{DB}?dateFrom={MES_FROM}&dateTo={MES_TO}")

# ── metasFiltradas (modo "todos"): meta_caixa>0, ordenado desc ────────────────
metas_filtradas = []
for m in metas_env.get("metas", []):
    mc = (m.get("meta_caixa") or {}).get(MES, 0) or 0
    if mc > 0:
        metas_filtradas.append({
            "portfolio": m["portfolio"],
            "grupo": m.get("grupo"),
            "qtd_negociadores": m.get("qtd_negociadores", 0) or 0,
            "meta_caixa": mc,
        })
metas_filtradas.sort(key=lambda x: x["meta_caixa"], reverse=True)

real_map = {r["portfolio_name"]: r for r in real_mes.get("data", [])}
hoje_map = {r["portfolio_name"]: r for r in real_hoje.get("data", [])}

total_meta_caixa = sum(m["meta_caixa"] for m in metas_filtradas)
meta_dia = total_meta_caixa / DIAS_UTEIS_MES if total_meta_caixa > 0 else 0
geracao_hoje = sum(
    (hoje_map.get(m["portfolio"], {}).get("valor_primeira_parcela", 0) or 0)
    for m in metas_filtradas
)

# ── Acordos individuais: ordena por carteira, depois valor desc ───────────────
acordos_rows = list(acordos.get("data", []))
acordos_rows.sort(key=lambda a: ((a.get("portfolio_name") or ""), -(a.get("valor_primeira_parcela") or 0)))

# ── Seções (espelha reportSections de Carteiras.tsx) ──────────────────────────
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
    "label": "Acordos por Carteira (individual, mês)",
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
    "Relatório": "Carteiras — Meta vs Real",
    "Mês": "Junho 2026",
    "Banco": DB,
    "Carteira": "Todas",
    "Trimestre metas": metas_env.get("meta", {}).get("periodo", "—"),
    "Gerado em": "2026-06-25",
}

csv = build_csv(meta_block, [sec_meta_real, sec_meta_dia, sec_acordos])
with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write(csv)

print("OK ->", OUT)
print("carteiras com meta:", len(metas_filtradas))
print("acordos individuais:", len(acordos_rows))
print("total_meta_caixa:", total_meta_caixa, "| meta_dia:", round(meta_dia, 2),
      "| geracao_hoje:", geracao_hoje)
