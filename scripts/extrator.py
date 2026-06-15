#!/usr/bin/env python
"""Extrator de metas do PDF para JSON (CLI).

Uso:
    python scripts/extrator.py docs/document_pdf.pdf

Gera:
    dados_metas/ultimas_metas.json   — sempre o último processado com sucesso
    dados_metas/metas_<periodo>.json — snapshot histórico (não sobrescreve se existir)
    dados_metas/erro_extracao.log    — log de falhas (NÃO sobrescreve ultimas_metas)

Toda a lógica de extração/validação vive em dominios/metas/extrator.py
(compartilhada com POST /dashboard/metas/upload).
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dominios.metas.extrator import (
        ERROR_LOG,
        OUTPUT_DIR,
        OUTPUT_FILE,
        processar_pdf,
        salvar_resultado,
    )
except ImportError as e:
    print(f"Erro de import: {e}. Execute: pip install pdfplumber", file=sys.stderr)
    sys.exit(2)


def main():
    if len(sys.argv) < 2:
        print("Uso: python scripts/extrator.py <caminho_do_pdf>", file=sys.stderr)
        sys.exit(2)

    pdf_path = sys.argv[1]
    if not os.path.isfile(pdf_path):
        print(f"Erro: arquivo não encontrado: {pdf_path}", file=sys.stderr)
        sys.exit(2)

    OUTPUT_DIR.mkdir(exist_ok=True)

    try:
        dados = processar_pdf(pdf_path)
        periodo = salvar_resultado(dados, pdf_path)
        # ASCII no separador: console Windows cp1252 não encoda "→"
        print(
            f"Extração concluída: {dados['meta']['total_registros']} registros -> "
            f"{OUTPUT_FILE} ({periodo})"
        )
    except Exception as e:
        # Log do erro — NÃO sobrescreve ultimas_metas.json
        with open(ERROR_LOG, "w", encoding="utf-8") as f:
            f.write(f"[{datetime.now(tz=timezone.utc).isoformat()}] ERRO\n")
            f.write(f"Arquivo: {pdf_path}\n")
            f.write(f"{e}\n")
        print(f"Extração falhou. Log: {ERROR_LOG}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
