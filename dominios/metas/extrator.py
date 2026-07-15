"""
Módulo reutilizável para extração de metas de PDF.

Usado por:
- scripts/extrator.py (CLI)
- api/routers/dashboard.py (POST /dashboard/metas/upload)

O PDF não tem grid de tabela detectável — a extração usa extract_words()
e atribui cada palavra a uma das 16 colunas pela posição x do sub-header
(Escritório, Portfólio, Grupo, 2T26, 202604..202606 ×4). A validação por
checksum (pnt = caixa + retomadas; soma das linhas = TOTAL GERAL) pega
qualquer erro de atribuição de coluna.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

# ── Constantes ────────────────────────────────────────────────────────────────

RE_TOTAL = re.compile(r"^\s*TOTAL\b", re.IGNORECASE)
RE_MES = re.compile(r"^\d{6}$")
GRUPOS = ("Veículos", "CDC / SR")
NUM_COLUNAS = 16  # 3 dimensões + headcount + 4 métricas × 3 meses

# Detecção de formato numérico: PDFs de trimestres diferentes já vieram com
# separador de milhar diferente (2T26: vírgula "1,540,337"; 3T26: ponto
# "1.428.833"). Presença de milhar duplo (≥ 1 milhão) desambigua o formato.
RE_MILHAR_US = re.compile(r"\d{1,3}(,\d{3}){2,}")
RE_MILHAR_BR = re.compile(r"\d{1,3}(\.\d{3}){2,}")

OUTPUT_DIR = Path("dados_metas")
OUTPUT_FILE = OUTPUT_DIR / "ultimas_metas.json"
ERROR_LOG = OUTPUT_DIR / "erro_extracao.log"


# ── Parsing numérico (formato detectado por documento: US = vírgula milhar /
#    ponto decimal, BR = ponto milhar / vírgula decimal) ─────────────────────

def _detectar_formato(data_rows: list[list[str]]) -> str:
    for row in data_rows:
        for cell in row:
            s = cell.replace(" ", "")
            if RE_MILHAR_BR.search(s):
                return "br"
            if RE_MILHAR_US.search(s):
                return "us"
    return "us"


def _parse_num(raw: str | None, formato: str = "us") -> float | None:
    if raw is None:
        return None
    # pdfplumber quebra números com espaço interno ("1 46,411" = 146,411)
    s = str(raw).strip().replace(" ", "")
    if s in ("", "-", "—", "–", "N/A", "n/a"):
        return None
    s = s.replace(".", "").replace(",", ".") if formato == "br" else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(raw: str | None, formato: str = "us") -> int | None:
    val = _parse_num(raw, formato)
    if val is None:
        return None
    return int(val)


# ── Extração posicional ───────────────────────────────────────────────────────

def _agrupar_linhas(words: list[dict]) -> list[list[dict]]:
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(lines[-1][0]["top"] - w["top"]) < 2.5:
            lines[-1].append(w)
        else:
            lines.append([w])
    return lines


def _atribuir_colunas(line: list[dict], centers: list[float]) -> list[str]:
    bounds = [(centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1)]
    cells = [""] * len(centers)
    for w in sorted(line, key=lambda w: w["x0"]):
        c = (w["x0"] + w["x1"]) / 2
        idx = 0
        while idx < len(bounds) and c > bounds[idx]:
            idx += 1
        cells[idx] = (cells[idx] + " " + w["text"]).strip()
    return cells


def _extrair_linhas(pdf_path: str) -> tuple[list[str], list[list[str]]]:
    """Retorna (meses, data_rows) — cada row com 16 células de texto."""
    meses: list[str] = []
    centers: list[float] = []
    data_rows: list[list[str]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for line in _agrupar_linhas(page.extract_words()):
                texts = [w["text"] for w in line]
                if not centers and "Grupo" in texts and len(texts) >= NUM_COLUNAS:
                    centers = [(w["x0"] + w["x1"]) / 2 for w in line[:NUM_COLUNAS]]
                    meses = [t for t in texts if RE_MES.match(t)][:3]
                    continue
                if centers and texts and texts[0] != "Grupo":
                    cells = _atribuir_colunas(line, centers)
                    if cells[1]:  # tem algo na coluna Portfólio
                        data_rows.append(cells)

    if not centers:
        raise ValueError("Cabeçalho de colunas não encontrado no PDF")
    if len(meses) < 3:
        raise ValueError(f"Meses não detectados no cabeçalho: {meses}")
    return meses, data_rows


def _fix_dimensoes(cells: list[str]) -> tuple[str, str | None]:
    """Portfólios longos vazam pro início da célula Grupo — devolve pro portfólio."""
    portfolio, grupo = cells[1], cells[2]
    for g in GRUPOS:
        if grupo == g:
            return portfolio, g
        if grupo.endswith(g):
            prefixo = grupo[: -len(g)].strip()
            return f"{portfolio} {prefixo}".strip(), g
    return portfolio, (grupo or None)


def _parse_row(cells: list[str], meses: list[str], formato: str = "us") -> dict | None:
    if len(cells) < NUM_COLUNAS:
        return None
    portfolio, grupo = _fix_dimensoes(cells)
    if not portfolio:
        return None
    return {
        "escritorio": cells[0] or None,
        "portfolio": portfolio,
        "grupo": grupo,
        "qtd_negociadores": _parse_num(cells[3], formato),
        "meta_caixa": {
            meses[i]: _parse_num(cells[4 + i], formato) or 0.0 for i in range(3)
        },
        "meta_retomadas_qtd": {
            meses[i]: _parse_int(cells[7 + i], formato) or 0 for i in range(3)
        },
        "meta_retomadas_valor": {
            meses[i]: _parse_num(cells[10 + i], formato) or 0.0 for i in range(3)
        },
        "meta_pnt": {
            meses[i]: _parse_num(cells[13 + i], formato) or 0.0 for i in range(3)
        },
    }


# ── Validação ─────────────────────────────────────────────────────────────────

def _validar_linhas(linhas: list[dict], meses: list[str]) -> list[str]:
    erros: list[str] = []
    for linha in linhas:
        for mes in meses:
            caixa = linha["meta_caixa"][mes]
            ret_valor = linha["meta_retomadas_valor"][mes]
            pnt = linha["meta_pnt"][mes]
            esperado = caixa + ret_valor
            if abs(esperado - pnt) > 0.01:
                erros.append(
                    f"{linha['portfolio']} {mes}: "
                    f"caixa({caixa:,.2f}) + retomadas({ret_valor:,.2f}) = "
                    f"{esperado:,.2f} ≠ pnt({pnt:,.2f})"
                )
    return erros


def _validar_total_geral(linhas: list[dict], total_geral: dict, meses: list[str]) -> list[str]:
    erros: list[str] = []
    for mes in meses:
        soma_pnt = sum(linha["meta_pnt"][mes] for linha in linhas)
        tg_pnt = total_geral["meta_pnt"][mes]
        if abs(soma_pnt - tg_pnt) > 0.01:
            erros.append(
                f"{mes}: soma linhas ({soma_pnt:,.2f}) ≠ "
                f"TOTAL GERAL ({tg_pnt:,.2f})"
            )
    return erros


def _extrair_periodo(pdf_path: str) -> str:
    nome = os.path.splitext(os.path.basename(pdf_path))[0]
    # (?!\d) evita casar só os 2 primeiros dígitos de um ano de 4 dígitos
    # (ex: "3T2026" virando "3T20" em vez de "3T26").
    match = re.search(r"(\dT)(\d{2,4})(?!\d)", nome, re.IGNORECASE)
    if match:
        trimestre, ano = match.group(1), match.group(2)
        if len(ano) == 4:
            ano = ano[2:]
        return f"{trimestre.upper()}{ano}"
    now = datetime.now()
    q = (now.month - 1) // 3 + 1
    return f"{q}T{str(now.year)[2:]}"


# ── Função pública principal ──────────────────────────────────────────────────

def processar_pdf(pdf_path: str, nome_origem: str | None = None) -> dict:
    """
    Processa um PDF de metas e retorna o dicionário JSON.

    `nome_origem` (opcional) é o nome usado para metadados e detecção de período
    — útil quando o PDF foi salvo num caminho temporário (upload) e o nome real
    carrega o trimestre (ex: "metas_3T26.pdf"). Default: o próprio pdf_path.

    Levanta ValueError se a validação falhar.
    NÃO salva arquivos — o caller decide o que fazer com o resultado.
    """
    origem = nome_origem or pdf_path
    meses, data_rows = _extrair_linhas(pdf_path)
    formato = _detectar_formato(data_rows)

    linhas_meta: list[dict] = []
    total_geral: dict | None = None

    for cells in data_rows:
        parsed = _parse_row(cells, meses, formato)
        if not parsed:
            continue
        if RE_TOTAL.match(parsed["portfolio"]):
            # A última linha TOTAL é o TOTAL GERAL
            total_geral = parsed
            continue
        # Linhas sem grupo conhecido são texto solto (título, rodapé, assinaturas)
        if parsed["grupo"] not in GRUPOS:
            continue
        linhas_meta.append(parsed)

    if not linhas_meta:
        raise ValueError("Nenhuma linha de dados encontrada")
    if total_geral is None:
        raise ValueError("Linha 'TOTAL GERAL' não encontrada")

    erros = _validar_linhas(linhas_meta, meses)
    erros += _validar_total_geral(linhas_meta, total_geral, meses)
    if erros:
        raise ValueError("Validação falhou:\n" + "\n".join(f"  - {e}" for e in erros))

    periodo = _extrair_periodo(origem)
    primeiro_mes = meses[0]
    return {
        "meta": {
            "periodo": periodo,
            "meses": list(meses),
            "extraido_em": datetime.now(tz=timezone.utc).isoformat(),
            "arquivo_origem": os.path.basename(origem),
            "total_registros": len(linhas_meta),
            "validado": True,
            "checksum_pnt_202604": round(
                sum(linha["meta_pnt"][primeiro_mes] for linha in linhas_meta), 2
            ),
            "checksum_total_geral_202604": round(total_geral["meta_pnt"][primeiro_mes], 2),
        },
        "metas": linhas_meta,
    }


def salvar_resultado(dados: dict, pdf_path: str) -> str:
    """
    Salva o resultado em ultimas_metas.json e snapshot histórico.
    Retorna o período detectado.
    """
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Escrita atômica: grava em tmp e renomeia (os.replace) para nunca deixar
    # ultimas_metas.json parcial se o processo morrer no meio (A-7.7). pid no nome
    # evita colisão de tmp entre uploads concorrentes.
    tmp_file = OUTPUT_DIR / f"_ultimas_metas.{os.getpid()}.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    os.replace(tmp_file, OUTPUT_FILE)

    periodo = dados["meta"]["periodo"]
    snapshot = OUTPUT_DIR / f"metas_{periodo}.json"
    if not snapshot.exists():
        with open(snapshot, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)

    return periodo
