import json
import os
import queue
import time
import threading
import concurrent.futures
from contextlib import contextmanager
from datetime import date, datetime, timezone
from collections import deque
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple
from uuid import uuid4

import pyodbc
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


app = FastAPI(
    title="Dashboard API",
    description="API local para expor dados de dashboard a partir do SQL Server.",
    version="1.1.0",
)

# ─────────────────────────────────────────────────────────────────
# CONSTANTES DE CONFIGURAÇÃO E REGRAS DE NEGÓCIO
# ─────────────────────────────────────────────────────────────────
ALLOWED_DATABASES = [
    "COBwebRCBAUTOS",
    "COBwebRCBCONSUMER",
]
ALLOWED_DATABASES_MAP = {name.lower(): name for name in ALLOWED_DATABASES}
EXCLUDED_AGENT_EXACT_NAMES = ("COBDESANTOS", "NEMBUSUSER")
EXCLUDED_AGENT_PREFIXES = ("ANTLIA", "INTERNA")

# ── Regras de negócio da COBweb ──
# REC_STATUS:
#   1  = ATIVO
#   2  = QUEBRA
#   3  = BAIXA POR PAGAMENTO
#   4  = A ENVIAR
#   5  = PENDENTE
#   6  = APROVADO
#   7  = REJEITADO
#   8  = PROPOSTA
#   9  = BAIXA MANUAL
#   10 = QUEBRA AUTOMÁTICA
#   11 = EXCEÇÃO (aguardando aprovação do banco)
#   12 = BAIXA POR PAGAMENTO AVULSO
#
# "Acordos aprovados" = ATIVO + BAIXA POR PAGAMENTO + BAIXA POR PAGAMENTO AVULSO
# "Exceções" = EXCEÇÃO (11)
# "Universo de acordos considerados" = aprovados + exceções
STATUS_APROVADOS = (1, 3, 12)
STATUS_EXCECAO = (11,)
STATUS_UNIVERSO_ACORDOS = STATUS_APROVADOS + STATUS_EXCECAO  # (1, 3, 11, 12)

# IDs de complementos que contam como CPC (Contato com a Pessoa Certa).
# Gerenciado manualmente pelo cientista de dados; se a ops criar um novo
# complemento de CPC, atualizar aqui.
CPC_COMPLEMENTO_IDS = (252, 130, 110, 111, 253, 144, 151, 216, 140, 108, 90)

# Primeira parcela no COBweb é PARCELA = 0 (não 1).
PRIMEIRA_PARCELA = 0

# Coluna da DIV_AUX que armazena o nome do portfolio/banco.
# O sistema COBweb não mantém esse dado na CART_MASTER; foi colocado
# pela empresa integradora num campo genérico da DIV_AUX.
PORTFOLIO_COLUMN = "CAMPO010"

# ─────────────────────────────────────────────────────────────────
# ÍNDICES RECOMENDADOS (consulte agecob-lens/docs/sql-indexes-recommendations.sql)
# Lista declarativa consumida pelos endpoints /admin/indexes/*.
# Qualquer alteração aqui deve ser refletida no .sql do DBA para manter
# paridade entre documentação e código.
# ─────────────────────────────────────────────────────────────────
RECOMMENDED_INDEXES: List[Dict[str, Any]] = [
    {
        "name": "IX_REC_MASTER_DT_EMISSAO",
        "schema": "dbo",
        "table": "REC_MASTER",
        "key_columns": ["DT_EMISSAO"],
        "include_columns": [
            "NR_RECEBIMENTO", "ID_USUARIO", "ID_DEV", "ID_REC_STATUS",
            "PARCELA", "PLANO", "VALOR", "DT_VENCIMENTO", "DT_PAGAMENTO",
        ],
        "purpose": "Janela de acordos emitidos no dia (base de todo o dashboard).",
    },
    {
        "name": "IX_REC_MASTER_NR_RECEBIMENTO",
        "schema": "dbo",
        "table": "REC_MASTER",
        "key_columns": ["NR_RECEBIMENTO"],
        "include_columns": ["VALOR", "PARCELA", "ID_REC_STATUS", "DT_EMISSAO"],
        "purpose": "Agregacoes por NR_RECEBIMENTO (CTE_Total_Acordo, Saldo_Original).",
    },
    {
        "name": "IX_REC_DIVIDAS_NR_RECEBIMENTO",
        "schema": "dbo",
        "table": "REC_DIVIDAS",
        "key_columns": ["NR_RECEBIMENTO"],
        "include_columns": ["ID_DIVIDA"],
        "purpose": "Seek em REC_DIVIDAS pelo filtro de dia apos o refactor Change 3.",
    },
    {
        "name": "IX_DIV_AUX_ID_DIVIDA",
        "schema": "dbo",
        "table": "DIV_AUX",
        "key_columns": ["ID_DIVIDA"],
        "include_columns": [PORTFOLIO_COLUMN],
        "purpose": "CROSS APPLY TOP 1 para trazer nome do portfolio.",
    },
    {
        "name": "IX_CTO_MASTER_DT_CONTATO",
        "schema": "dbo",
        "table": "CTO_MASTER",
        "key_columns": ["DT_CONTATO"],
        "include_columns": ["ID_USUARIO", "ID_COMPLEMENTO", "ID_CTO_MASTER"],
        "purpose": "Acionamentos do dia (produtividade).",
    },
    {
        "name": "IX_USU_MASTER_ID_USUARIO",
        "schema": "dbo",
        "table": "USU_MASTER",
        "key_columns": ["ID_USUARIO"],
        "include_columns": ["NOME", "CHAVE"],
        "purpose": "Join por ID_USUARIO + filtro de exclusao em NOME/CHAVE.",
    },
]

INDEX_DEFAULT_OPTIONS = {"FILLFACTOR": 90, "DATA_COMPRESSION": "PAGE"}

# ── Helpers SQL reutilizáveis ──
def _sql_in(values: Tuple[int, ...]) -> str:
    """Retorna string no formato '(1, 3, 12)' para uso em clausula IN."""
    return "(" + ", ".join(str(v) for v in values) + ")"


STATUS_APROVADOS_SQL = _sql_in(STATUS_APROVADOS)
STATUS_EXCECAO_SQL = _sql_in(STATUS_EXCECAO)
STATUS_UNIVERSO_SQL = _sql_in(STATUS_UNIVERSO_ACORDOS)
CPC_IDS_SQL = _sql_in(CPC_COMPLEMENTO_IDS)

# Filtro padrão de exclusão de agentes internos/sistema.
FILTRO_AGENTES_EXCLUIDOS_SQL = """
    AND UPPER(LTRIM(RTRIM(U.NOME))) <> 'COBDESANTOS'
    AND UPPER(LTRIM(RTRIM(U.NOME))) <> 'NEMBUSUSER'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) <> 'NEMBUSUSER'
    AND UPPER(LTRIM(RTRIM(U.NOME))) NOT LIKE 'ANTLIA%'
    AND UPPER(LTRIM(RTRIM(U.NOME))) NOT LIKE 'INTERNA%'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'INTERNA%'
"""

# --- Produtividade Agentes (consolidated) ---
# Cache for /dashboard/produtividade-agentes
_PRODUTIVIDADE_AGENTES_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_PRODUTIVIDADE_AGENTES_TTL_SECONDS = 60  # TTL < frontend auto-refresh (120s) so every auto tick gets fresh data

# ─────────────────────────────────────────────────────────────────
# AUTH / RATE LIMIT / LOGS
# ─────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST_DIR = os.path.join(BASE_DIR, "agecob-lens", "dist")
FRONTEND_ASSETS_DIR = os.path.join(FRONTEND_DIST_DIR, "assets")
ENV_FILE_PATH = os.path.join(BASE_DIR, ".env")
LOG_DIR = os.path.join(BASE_DIR, "logs")


def _load_env_file(path: str) -> None:
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as env_file:
            for line in env_file:
                raw = line.strip()
                if not raw or raw.startswith("#") or "=" not in raw:
                    continue
                key, value = raw.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and (key not in os.environ or not str(os.environ.get(key, "")).strip()):
                    os.environ[key] = value
    except OSError:
        pass


_load_env_file(ENV_FILE_PATH)

def _parse_cors_origins(raw_value: str) -> List[str]:
    origins = [item.strip() for item in (raw_value or "").split(",") if item.strip()]
    return origins or ["http://127.0.0.1:5173", "http://localhost:5173"]


_CORS_ORIGINS = _parse_cors_origins(os.getenv("CORS_ALLOW_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"))
_CORS_ALLOW_CREDENTIALS = (os.getenv("CORS_ALLOW_CREDENTIALS") or "false").strip().lower() == "true"
if "*" in _CORS_ORIGINS:
    _CORS_ALLOW_CREDENTIALS = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=_CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = (os.getenv("API_KEY") or "").strip()
API_TOKEN = (os.getenv("API_TOKEN") or "").strip()
REQUIRE_API_AUTH = (os.getenv("REQUIRE_API_AUTH") or "false").strip().lower() == "true"
RATE_LIMIT_REQUESTS = 75
RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_BUCKETS: Dict[str, deque] = {}
LOG_CLEANUP_INTERVAL_SECONDS = 5 * 60 * 60
ENABLE_VALIDATED_ROUTES = (os.getenv("ENABLE_VALIDATED_ROUTES") or "true").strip().lower() == "true"
ENABLE_AGENT_TELEMETRY = (os.getenv("ENABLE_AGENT_TELEMETRY") or "false").strip().lower() == "true"
# Endpoints /admin/indexes/* ficam desligados por padrao: aplicar indices em tabela
# grande bloqueia escrita e deve ser decisao consciente (janela de manutencao do DBA).
# Para habilitar, setar ENABLE_INDEX_ADMIN=true no .env.
ENABLE_INDEX_ADMIN = (os.getenv("ENABLE_INDEX_ADMIN") or "false").strip().lower() == "true"

# region agent log
_AGENT_LOG_PATH = os.path.join(LOG_DIR, "agent-debug.log")
_LOG_CLEANUP_THREAD_STARTED = False


def _agent_ndjson(
    hypothesis_id: str,
    location: str,
    message: str,
    data: Dict[str, Any],
    run_id: Optional[str] = None,
) -> None:
    if not ENABLE_AGENT_TELEMETRY:
        return
    line = {
        "timestamp": int(time.time() * 1000),
        "location": location,
        "message": message,
        "data": {**data, "pid": os.getpid()},
        "hypothesisId": hypothesis_id,
        "runId": run_id or "runtime",
    }
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(_AGENT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception:
        pass


# endregion


def _truncate_agent_log_file() -> None:
    if not ENABLE_AGENT_TELEMETRY:
        return
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(_AGENT_LOG_PATH, "w", encoding="utf-8"):
            pass
    except OSError:
        pass


def _agent_log_cleanup_loop() -> None:
    while True:
        time.sleep(LOG_CLEANUP_INTERVAL_SECONDS)
        _truncate_agent_log_file()


def _start_agent_log_cleanup_worker() -> None:
    if not ENABLE_AGENT_TELEMETRY:
        return
    global _LOG_CLEANUP_THREAD_STARTED
    if _LOG_CLEANUP_THREAD_STARTED:
        return
    worker = threading.Thread(
        target=_agent_log_cleanup_loop,
        name="agent-log-cleanup",
        daemon=True,
    )
    worker.start()
    _LOG_CLEANUP_THREAD_STARTED = True


def _extract_run_id(request: Request) -> str:
    provided = (
        request.headers.get("x-run-id")
        or request.headers.get("x-debug-run-id")
        or request.headers.get("x-request-id")
        or ""
    ).strip()
    return provided or f"srv-{uuid4().hex[:12]}"


def _normalize_api_path(path: str) -> str:
    if path == "/api":
        return "/"
    if path.startswith("/api/"):
        return path[4:] or "/"
    return path


# ─────────────────────────────────────────────────────────────────
# QUERIES PRINCIPAIS
# ─────────────────────────────────────────────────────────────────
QUERY_ACORDOS_HOJE = f"""
DECLARE @Hoje DATE = CAST(? AS DATE);
DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
DECLARE @Offset INT = ?;
DECLARE @Limit INT = ?;

WITH CTE_Hoje_Acordos AS (
    -- Subconjunto dos NR_RECEBIMENTO emitidos hoje; base de redução para as CTEs abaixo.
    SELECT DISTINCT NR_RECEBIMENTO
    FROM REC_MASTER (NOLOCK)
    WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
),
CTE_Total_Acordo AS (
    -- Soma todas as parcelas para achar o valor total do acordo (restrito ao dia).
    SELECT
        RM.NR_RECEBIMENTO,
        SUM(RM.VALOR) AS VALOR_TOTAL_ACORDO
    FROM REC_MASTER RM (NOLOCK)
    WHERE RM.NR_RECEBIMENTO IN (SELECT NR_RECEBIMENTO FROM CTE_Hoje_Acordos)
    GROUP BY RM.NR_RECEBIMENTO
),
CTE_Saldo_Divida AS (
    -- Saldo atualizado (VR_SALDO) das dívidas dos acordos de hoje.
    SELECT
        RD.NR_RECEBIMENTO,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS SALDO_ATUALIZADO_DIVIDA
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_MASTER DM (NOLOCK) ON RD.ID_DIVIDA = DM.ID_DIVIDA
    WHERE RD.NR_RECEBIMENTO IN (SELECT NR_RECEBIMENTO FROM CTE_Hoje_Acordos)
    GROUP BY RD.NR_RECEBIMENTO
)
SELECT
    COUNT(*) OVER() AS _total_rows,

    -- 1. DADOS DO AGENTE
    U.CHAVE AS agente,

    -- 2. DADOS DO DEVEDOR
    DEV.CPF_CNPJ AS cpf_cnpj,
    DEV.NOME_RAZAO AS nome_razao,

    -- 3. DADOS FINANCEIROS TOTAIS E DESCONTO
    ISNULL(SD.SALDO_ATUALIZADO_DIVIDA, 0) AS valor_atualizado_divida,
    ISNULL(TA.VALOR_TOTAL_ACORDO, 0) AS valor_total_acordo,
    ISNULL(SD.SALDO_ATUALIZADO_DIVIDA, 0) - ISNULL(TA.VALOR_TOTAL_ACORDO, 0) AS desconto_concedido,

    -- 4. DADOS DAS PARCELAS
    RM.NR_RECEBIMENTO AS acordo,
    RM.PLANO AS qtd_parcelas,
    RM.PARCELA AS numero_parcela,
    RM.DT_EMISSAO AS data_emissao,
    RM.DT_VENCIMENTO AS data_vencimento,
    RM.VALOR AS valor_parcela,
    RS.DESCR AS status_parcela,

    -- 5. PAGAMENTO E BAIXA
    RM.DT_PAGAMENTO AS dt_pagamento,
    CASE
        WHEN RM.DT_PAGAMENTO IS NOT NULL THEN 'PAGO'
        ELSE 'EM ABERTO'
    END AS situacao_pagamento

FROM REC_MASTER RM (NOLOCK)
JOIN USU_MASTER U (NOLOCK) ON RM.ID_USUARIO = U.ID_USUARIO
JOIN DEV_MASTER DEV (NOLOCK) ON RM.ID_DEV = DEV.ID_DEV
LEFT JOIN REC_STATUS RS (NOLOCK) ON RM.ID_REC_STATUS = RS.ID_REC_STATUS
LEFT JOIN CTE_Total_Acordo TA ON RM.NR_RECEBIMENTO = TA.NR_RECEBIMENTO
LEFT JOIN CTE_Saldo_Divida SD ON RM.NR_RECEBIMENTO = SD.NR_RECEBIMENTO
WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
  {FILTRO_AGENTES_EXCLUIDOS_SQL}
ORDER BY RM.DT_EMISSAO DESC, RM.NR_RECEBIMENTO, RM.PARCELA
OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
"""


# Paginação em /dashboard/acordos-hoje*
ACORDOS_HOJE_DEFAULT_LIMIT = 500
ACORDOS_HOJE_MAX_LIMIT = 5000


def _normalize_pagination(limit: Optional[int], offset: Optional[int]) -> Tuple[int, int]:
    lim = ACORDOS_HOJE_DEFAULT_LIMIT if limit is None else int(limit)
    off = 0 if offset is None else int(offset)
    if lim <= 0:
        lim = ACORDOS_HOJE_DEFAULT_LIMIT
    if lim > ACORDOS_HOJE_MAX_LIMIT:
        lim = ACORDOS_HOJE_MAX_LIMIT
    if off < 0:
        off = 0
    return lim, off


def _extract_total_rows(rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    if not rows:
        return rows, 0
    total = int(rows[0].get("_total_rows") or 0)
    cleaned = [{k: v for k, v in r.items() if k != "_total_rows"} for r in rows]
    return cleaned, total


def _build_produtividade_query(db: str, *, use_distinct_esforco: bool) -> str:
    """
    Single source of truth para produtividade-por-agente de hoje.

    Parameters
    ----------
    db : str
        'COBwebRCBAUTOS', 'COBwebRCBCONSUMER' ou 'todos'.
        Quando use_distinct_esforco=True o caller sempre passa um single-db
        (o endpoint /produtividade-hoje não aceita 'todos').
    use_distinct_esforco : bool
        True  -> comportamento do antigo QUERY_PRODUTIVIDADE_HOJE:
                 esforço com COUNT(DISTINCT ID_CTO_MASTER), single-DB, colunas
                 valor_acordos / acordos_percentual, hint MAXDOP.
                 Usado por /produtividade-hoje e /status-carga.
        False -> comportamento do antigo QUERY_AGENTES_UNIFICADO_BASE /
                 get_query_comparacao_agentes: esforço com COUNT sem DISTINCT,
                 suporta 'todos' com coluna origem, colunas
                 valor_total_acordos / taxa_conversao e filtros extras
                 U.CHAVE NOT LIKE 'suporte%'/'SISTEMA%'.
                 Usado por /comparacao-agentes, /detalhamento-agentes e
                 /produtividade.
    """
    if use_distinct_esforco:
        return f"""
DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);

WITH CTE_Acordos AS (
    SELECT
        RM.ID_USUARIO,
        RM.NR_RECEBIMENTO,
        RM.ID_REC_STATUS,
        SUM(RM.VALOR) AS VALOR_TOTAL_ACORDO,
        MAX(CASE WHEN RM.PARCELA = {PRIMEIRA_PARCELA} THEN RM.VALOR ELSE 0 END) AS VALOR_P1,
        MAX(RM.PLANO) AS PLANO
    FROM REC_MASTER RM (NOLOCK)
    WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
      AND RM.ID_REC_STATUS IN {STATUS_UNIVERSO_SQL}
    GROUP BY RM.ID_USUARIO, RM.NR_RECEBIMENTO, RM.ID_REC_STATUS
),
CTE_Saldo_Original AS (
    SELECT
        RD.NR_RECEBIMENTO,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS VR_ORIGINAL
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_MASTER DM (NOLOCK) ON RD.ID_DIVIDA = DM.ID_DIVIDA
    WHERE RD.NR_RECEBIMENTO IN (
        SELECT NR_RECEBIMENTO
        FROM REC_MASTER (NOLOCK)
        WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
    )
    GROUP BY RD.NR_RECEBIMENTO
),
-- Pré-agrega valores financeiros por agente para evitar multiplicação de linhas
-- causada pelo JOIN entre CTO_MASTER (N acionamentos) e CTE_Acordos (M acordos).
CTE_Financeiro_Agente AS (
    SELECT
        A.ID_USUARIO,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN 1 END)                                   AS qtd_acordos,
        SUM(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END)           AS valor_acordos,
        AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO END)                  AS acordo_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN CAST(A.PLANO AS DECIMAL(10,2)) END)        AS parcelamento_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} AND S.VR_ORIGINAL > 0
            THEN A.VALOR_TOTAL_ACORDO / S.VR_ORIGINAL * 100 END)                                                AS desconto_medio_percentual,
        SUM(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_P1 ELSE 0 END)                    AS valor_primeira_parcela,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {STATUS_EXCECAO_SQL} THEN 1 END)                                     AS qtd_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {STATUS_EXCECAO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END)             AS valor_excecoes
    FROM CTE_Acordos A
    LEFT JOIN CTE_Saldo_Original S ON A.NR_RECEBIMENTO = S.NR_RECEBIMENTO
    GROUP BY A.ID_USUARIO
)
SELECT
    U.CHAVE,
    U.NOME,
    COUNT(DISTINCT CM.ID_CTO_MASTER) AS qtd_acionamentos,
    COUNT(DISTINCT CASE WHEN CM.ID_COMPLEMENTO IN {CPC_IDS_SQL} THEN CM.ID_CTO_MASTER END) AS qtd_contatos,
    CAST(
        CEILING(
            COUNT(DISTINCT CASE WHEN CM.ID_COMPLEMENTO IN {CPC_IDS_SQL} THEN CM.ID_CTO_MASTER END) * 100.0
        / NULLIF(COUNT(DISTINCT CM.ID_CTO_MASTER), 0)
        )
    AS INT) AS cpc_percentual,
    ISNULL(MAX(F.qtd_acordos), 0) AS qtd_acordos,
    CAST(
        ISNULL(MAX(F.qtd_acordos), 0) * 100.0
        / NULLIF(COUNT(DISTINCT CM.ID_CTO_MASTER), 0)
    AS DECIMAL(5,2)) AS acordos_percentual,
    CAST(ISNULL(MAX(F.valor_acordos), 0) AS DECIMAL(18,2)) AS valor_acordos,
    CAST(ISNULL(MAX(F.acordo_medio), 0) AS DECIMAL(18,2)) AS acordo_medio,
    CAST(ISNULL(MAX(F.parcelamento_medio), 0) AS DECIMAL(10,2)) AS parcelamento_medio,
    CAST(ISNULL(MAX(F.desconto_medio_percentual), 0) AS DECIMAL(10,2)) AS desconto_medio_percentual,
    CAST(ISNULL(MAX(F.valor_primeira_parcela), 0) AS DECIMAL(18,2)) AS valor_primeira_parcela,
    ISNULL(MAX(F.qtd_excecoes), 0) AS qtd_excecoes,
    CAST(ISNULL(MAX(F.valor_excecoes), 0) AS DECIMAL(18,2)) AS valor_excecoes
FROM CTO_MASTER CM (NOLOCK)
JOIN USU_MASTER U (NOLOCK)
    ON CM.ID_USUARIO = U.ID_USUARIO
LEFT JOIN CTE_Financeiro_Agente F
    ON U.ID_USUARIO = F.ID_USUARIO
WHERE
    CM.DATA >= @Hoje AND CM.DATA < @Amanha
    {FILTRO_AGENTES_EXCLUIDOS_SQL}
GROUP BY
    U.CHAVE,
    U.NOME
ORDER BY
    qtd_acionamentos DESC
OPTION (USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE'), MAXDOP 0);
"""

    normalized = (db or "").strip().lower()
    if normalized == "cobwebrcbconsumer":
        usu_master = "SELECT ID_USUARIO, CHAVE, NOME, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.USU_MASTER (NOLOCK)"
        cto_master = "SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha"
        rec_master = "SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha"
        rec_dividas = "SELECT NR_RECEBIMENTO, ID_DIVIDA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_DIVIDAS (NOLOCK)"
        div_master = "SELECT ID_DIVIDA, VR_SALDO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.DIV_MASTER (NOLOCK)"
    elif normalized == "cobwebrcbautos":
        usu_master = "SELECT ID_USUARIO, CHAVE, NOME, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.USU_MASTER (NOLOCK)"
        cto_master = "SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha"
        rec_master = "SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha"
        rec_dividas = "SELECT NR_RECEBIMENTO, ID_DIVIDA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_DIVIDAS (NOLOCK)"
        div_master = "SELECT ID_DIVIDA, VR_SALDO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.DIV_MASTER (NOLOCK)"
    else:
        usu_master = """
            SELECT ID_USUARIO, CHAVE, NOME, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.USU_MASTER (NOLOCK)
            UNION ALL
            SELECT ID_USUARIO, CHAVE, NOME, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.USU_MASTER (NOLOCK)
        """
        cto_master = """
            SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha
            UNION ALL
            SELECT ID_USUARIO, ID_CTO_MASTER, ID_COMPLEMENTO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.CTO_MASTER (NOLOCK) WHERE DATA >= @Hoje AND DATA < @Amanha
        """
        rec_master = """
            SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
            UNION ALL
            SELECT ID_USUARIO, NR_RECEBIMENTO, VALOR, PARCELA, ID_REC_STATUS, PLANO, ID_CARTEIRA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_MASTER (NOLOCK) WHERE DT_EMISSAO >= @Hoje AND DT_EMISSAO < @Amanha
        """
        rec_dividas = """
            SELECT NR_RECEBIMENTO, ID_DIVIDA, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.REC_DIVIDAS (NOLOCK)
            UNION ALL
            SELECT NR_RECEBIMENTO, ID_DIVIDA, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.REC_DIVIDAS (NOLOCK)
        """
        div_master = """
            SELECT ID_DIVIDA, VR_SALDO, 'CONSUMER' AS origem FROM COBwebRCBCONSUMER.dbo.DIV_MASTER (NOLOCK)
            UNION ALL
            SELECT ID_DIVIDA, VR_SALDO, 'AUTOS' AS origem FROM COBwebRCBAUTOS.dbo.DIV_MASTER (NOLOCK)
        """

    return f"""
DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);

WITH CTE_Usuarios AS ({usu_master}),

CTE_Esforco AS (
    SELECT
        CM.ID_USUARIO,
        CM.origem,
        COUNT(CM.ID_CTO_MASTER) AS qtd_acionamentos,
        COUNT(CASE WHEN CM.ID_COMPLEMENTO IN {CPC_IDS_SQL} THEN 1 END) AS qtd_contatos
    FROM ({cto_master}) CM
    GROUP BY CM.ID_USUARIO, CM.origem
),

CTE_Acordos_Unicos AS (
    SELECT
        R.ID_USUARIO, R.origem, R.NR_RECEBIMENTO, R.ID_REC_STATUS,
        SUM(R.VALOR) AS VALOR_TOTAL_ACORDO,
        MAX(CASE WHEN R.PARCELA = {PRIMEIRA_PARCELA} THEN R.VALOR ELSE 0 END) AS VALOR_P1,
        MAX(R.PLANO) AS PLANO
    FROM ({rec_master}) R
    WHERE R.ID_REC_STATUS IN {STATUS_UNIVERSO_SQL}
    GROUP BY R.ID_USUARIO, R.origem, R.NR_RECEBIMENTO, R.ID_REC_STATUS
),

CTE_Saldo_Original AS (
    SELECT
        RD.NR_RECEBIMENTO, RD.origem,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS VR_ORIGINAL
    FROM ({rec_dividas}) RD
    JOIN ({div_master}) DM ON RD.ID_DIVIDA = DM.ID_DIVIDA AND RD.origem = DM.origem
    WHERE EXISTS (
        SELECT 1 FROM CTE_Acordos_Unicos A
        WHERE A.NR_RECEBIMENTO = RD.NR_RECEBIMENTO
          AND A.origem = RD.origem
    )
    GROUP BY RD.NR_RECEBIMENTO, RD.origem
),

CTE_Financeiro_Final AS (
    SELECT
        A.ID_USUARIO, A.origem,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_acordos,
        SUM(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_total_acordos,
        AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO END) AS acordo_medio,
        SUM(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_P1 ELSE 0 END) AS valor_total_p1,
        AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN CAST(A.PLANO AS DECIMAL(10,2)) END) AS parcelamento_medio,
        AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} AND S.VR_ORIGINAL > 0
            THEN A.VALOR_TOTAL_ACORDO / S.VR_ORIGINAL * 100
        END) AS desconto_medio,
        COUNT(CASE WHEN A.ID_REC_STATUS IN {STATUS_EXCECAO_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_excecoes,
        SUM(CASE WHEN A.ID_REC_STATUS IN {STATUS_EXCECAO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_excecoes
    FROM CTE_Acordos_Unicos A
    LEFT JOIN CTE_Saldo_Original S ON A.NR_RECEBIMENTO = S.NR_RECEBIMENTO AND A.origem = S.origem
    GROUP BY A.ID_USUARIO, A.origem
)

SELECT
    U.origem,
    U.NOME,
    U.CHAVE,
    E.qtd_acionamentos,
    E.qtd_contatos,
    ISNULL(F.qtd_acordos, 0) AS qtd_acordos,
    CAST(ISNULL(F.valor_total_acordos, 0) AS DECIMAL(18,2)) AS valor_total_acordos,
    CAST(ISNULL(F.acordo_medio, 0) AS DECIMAL(18,2)) AS acordo_medio,
    CAST(ISNULL(F.parcelamento_medio, 0) AS DECIMAL(10,2)) AS parcelamento_medio,
    CAST(ISNULL(F.valor_total_p1, 0) AS DECIMAL(18,2)) AS valor_primeira_parcela,
    CAST(ISNULL(F.qtd_acordos, 0) * 100.0 / NULLIF(E.qtd_acionamentos, 0) AS DECIMAL(18,2)) AS taxa_conversao,
    CAST(CEILING(ISNULL(E.qtd_contatos, 0) * 100.0 / NULLIF(E.qtd_acionamentos, 0)) AS INT) AS cpc_percentual,
    CAST(ISNULL(F.desconto_medio, 0) AS DECIMAL(10,2)) AS desconto_medio_percentual,
    ISNULL(F.qtd_excecoes, 0) AS qtd_excecoes,
    CAST(ISNULL(F.valor_excecoes, 0) AS DECIMAL(18,2)) AS valor_excecoes
FROM CTE_Esforco E
JOIN CTE_Usuarios U ON E.ID_USUARIO = U.ID_USUARIO AND E.origem = U.origem
LEFT JOIN CTE_Financeiro_Final F ON E.ID_USUARIO = F.ID_USUARIO AND E.origem = F.origem
WHERE
    E.qtd_acionamentos > 0
    {FILTRO_AGENTES_EXCLUIDOS_SQL}
    AND U.CHAVE NOT LIKE 'suporte%'
    AND U.CHAVE NOT LIKE 'SISTEMA%'
ORDER BY E.qtd_acionamentos DESC;
"""


PRODUCTIVITY_REQUIRED_FIELDS = [
    "CHAVE",
    "NOME",
    "qtd_acionamentos",
    "qtd_contatos",
    "cpc_percentual",
    "qtd_acordos",
    "acordos_percentual",
    "valor_acordos",
    "acordo_medio",
    "parcelamento_medio",
    "desconto_medio_percentual",
    "valor_primeira_parcela",
    "qtd_excecoes",
    "valor_excecoes",
]


# ─────────────────────────────────────────────────────────────────
# MIDDLEWARES E AUTH
# ─────────────────────────────────────────────────────────────────
def _require_auth(request: Request) -> None:
    if not REQUIRE_API_AUTH:
        return
    if not API_KEY or not API_TOKEN:
        raise HTTPException(status_code=500, detail="API auth está habilitada, mas API_KEY/API_TOKEN não foram configurados.")
    api_key = request.headers.get("x-api-key", "")
    auth_header = request.headers.get("authorization", "")
    expected_auth = f"Bearer {API_TOKEN}"
    if api_key != API_KEY or auth_header != expected_auth:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _rate_limit_dashboard(request: Request, path: str) -> Optional[JSONResponse]:
    if not path.startswith("/dashboard/"):
        return None

    client_ip = request.client.host if request.client else "unknown"
    api_key = request.headers.get("x-api-key", "missing")
    bucket_key = f"{client_ip}:{api_key}"
    now = datetime.now(timezone.utc).timestamp()
    bucket = _RATE_LIMIT_BUCKETS.setdefault(bucket_key, deque())

    while bucket and (now - bucket[0]) > RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()

    if len(bucket) >= RATE_LIMIT_REQUESTS:
        retry_after = max(1, int(RATE_LIMIT_WINDOW_SECONDS - (now - bucket[0])))
        return JSONResponse(
            status_code=429,
            content={"detail": "Too Many Requests"},
            headers={"Retry-After": str(retry_after)},
        )

    bucket.append(now)
    return None


@app.middleware("http")
async def api_prefix_middleware(request: Request, call_next):
    # Permite usar /api em produção e dev sem alterar os endpoints internos.
    request.scope["path"] = _normalize_api_path(request.scope.get("path", ""))
    return await call_next(request)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    open_paths = {"/", "/docs", "/openapi.json", "/redoc"}
    raw_path = request.scope.get("path", request.url.path)
    path = _normalize_api_path(raw_path)
    in_open = path in open_paths
    requires_auth = (
        path.startswith("/dashboard/")
        or path.startswith("/health/")
        or path.startswith("/admin/")
    )
    run_id = _extract_run_id(request)
    request.state.run_id = run_id
    request.state.req_started_at = time.perf_counter()
    # region agent log
    _agent_ndjson(
        "OBS",
        "main.py:security_middleware:request_entry",
        "request_entry",
        {
            "path": path,
            "path_repr": repr(path),
            "raw_path": raw_path,
            "in_open_paths": in_open,
            "requires_auth": requires_auth,
            "method": request.method,
            "has_api_key": bool(request.headers.get("x-api-key", "")),
            "has_authorization": bool(request.headers.get("authorization", "")),
        },
        run_id=run_id,
    )
    # endregion
    if requires_auth:
        try:
            _require_auth(request)
            _ensure_validated_execution(path)
        except HTTPException as exc:
            # region agent log
            _agent_ndjson(
                "OBS",
                "main.py:security_middleware:auth_result",
                "auth_reject",
                {"path": path, "status": exc.status_code, "entrada_ok": False},
                run_id=run_id,
            )
            # endregion
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        limited = _rate_limit_dashboard(request, path)
        if limited is not None:
            # region agent log
            _agent_ndjson(
                "OBS",
                "main.py:security_middleware:rate_limit_result",
                "rate_limited",
                {"path": path, "status": 429, "entrada_ok": False},
                run_id=run_id,
            )
            # endregion
            return limited
        # region agent log
        _agent_ndjson(
            "OBS",
            "main.py:security_middleware:auth_result",
            "auth_accept",
            {"path": path, "entrada_ok": True},
            run_id=run_id,
        )
        # endregion
    else:
        # region agent log
        _agent_ndjson(
            "OBS",
            "main.py:security_middleware:open_path",
            "bypass_auth",
            {"path": path, "requires_auth": requires_auth},
            run_id=run_id,
        )
        # endregion
    response = await call_next(request)
    total_elapsed_ms = round((time.perf_counter() - request.state.req_started_at) * 1000, 2)
    # region agent log
    _agent_ndjson(
        "OBS",
        "main.py:security_middleware:exit",
        "response",
        {
            "path": path,
            "status_code": getattr(response, "status_code", None),
            "endpoint_total_elapsed_ms": total_elapsed_ms,
        },
        run_id=run_id,
    )
    # endregion
    response.headers["X-Run-Id"] = run_id
    return response


# ─────────────────────────────────────────────────────────────────
# VALIDAÇÃO DE BANCOS
# ─────────────────────────────────────────────────────────────────
def validate_database(database_name: str) -> str:
    normalized = database_name.strip().lower()
    if normalized not in ALLOWED_DATABASES_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Banco inválido. Use um destes: {', '.join(ALLOWED_DATABASES)}",
        )
    return ALLOWED_DATABASES_MAP[normalized]


def validate_database_or_todos(database_name: str) -> str:
    normalized = database_name.strip().lower()
    if normalized == "todos":
        return "todos"
    return validate_database(database_name)


# ─────────────────────────────────────────────────────────────────
# HELPERS DE FILTRO E EXECUÇÃO
# ─────────────────────────────────────────────────────────────────
def _ensure_validated_execution(path: str) -> None:
    if not path.startswith("/dashboard/"):
        return
    if not ENABLE_VALIDATED_ROUTES:
        raise HTTPException(
            status_code=503,
            detail="API execution gate is locked. Set ENABLE_VALIDATED_ROUTES=true after full validation.",
        )


# ─────────────────────────────────────────────────────────────────
# POOL DE CONEXÕES pyodbc (homemade, sem dependência externa)
# ─────────────────────────────────────────────────────────────────
# Um pool por database. Cada worker uvicorn mantém seu próprio conjunto.
# Tamanho configurável via DB_POOL_SIZE; timeout de aquisição via DB_POOL_TIMEOUT.
_DB_POOL_SIZE = max(1, int(os.getenv("DB_POOL_SIZE", "6")))
_DB_POOL_ACQUIRE_TIMEOUT = float(os.getenv("DB_POOL_TIMEOUT", "10"))
_DB_POOL_MAX_AGE_SECONDS = float(os.getenv("DB_POOL_MAX_AGE_SECONDS", "1800"))  # 30min
_DB_POOLS: Dict[str, "queue.Queue"] = {}
_DB_POOLS_LOCK = threading.Lock()


def _pool_for(database_name: str) -> "queue.Queue":
    pool = _DB_POOLS.get(database_name)
    if pool is not None:
        return pool
    with _DB_POOLS_LOCK:
        pool = _DB_POOLS.get(database_name)
        if pool is None:
            pool = queue.Queue(maxsize=_DB_POOL_SIZE)
            _DB_POOLS[database_name] = pool
        return pool


def _open_raw_connection(database_name: str) -> pyodbc.Connection:
    driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")
    server = (os.getenv("DB_SERVER") or "").strip()
    username = (os.getenv("DB_USER") or "").strip()
    password = (os.getenv("DB_PASSWORD") or "").strip()
    if not server:
        raise HTTPException(status_code=500, detail="DB_SERVER não configurado.")
    if not username:
        raise HTTPException(status_code=500, detail="DB_USER não configurado.")
    if not password:
        raise HTTPException(
            status_code=500,
            detail="DB_PASSWORD não configurado. Defina no arquivo .env ou nas variáveis de ambiente.",
        )

    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={database_name};"
        f"UID={username};"
        f"PWD={password};"
        "TrustServerCertificate=yes;"
    )

    try:
        return pyodbc.connect(conn_str, timeout=10)
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "main.py:_open_raw_connection:error",
            "db_connect_error",
            {"database": database_name, "error": str(exc)},
        )
        raise HTTPException(
            status_code=500,
            detail="Erro ao conectar no banco de dados.",
        ) from exc


def _conn_is_alive(conn: pyodbc.Connection) -> bool:
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        return True
    except Exception:
        return False


@contextmanager
def get_connection(database_name: str) -> Iterator[pyodbc.Connection]:
    """
    Context manager que entrega uma conexão pyodbc do pool do database.

    - Se o pool tem conexão ociosa, reaproveita (após health-check leve).
    - Se a conexão está expirada ou morta, descarta e abre uma nova.
    - No exit sem exceção, devolve ao pool; com exceção ou pool cheio, fecha.
    """
    pool = _pool_for(database_name)
    conn: Optional[pyodbc.Connection] = None
    opened_at: float = 0.0

    # Tenta reaproveitar uma conexão ociosa.
    try:
        conn, opened_at = pool.get_nowait()
    except queue.Empty:
        conn = None

    if conn is not None:
        expired = (time.time() - opened_at) > _DB_POOL_MAX_AGE_SECONDS
        if expired or not _conn_is_alive(conn):
            try:
                conn.close()
            except Exception:
                pass
            conn = None

    if conn is None:
        conn = _open_raw_connection(database_name)
        opened_at = time.time()

    ok = False
    try:
        yield conn
        ok = True
    finally:
        if ok:
            try:
                pool.put_nowait((conn, opened_at))
            except queue.Full:
                try:
                    conn.close()
                except Exception:
                    pass
        else:
            try:
                conn.close()
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────
# CACHE TTL EM MEMÓRIA (por worker)
# ─────────────────────────────────────────────────────────────────
# Cache simples por (endpoint, db) com TTL curto. O dashboard atualiza
# automaticamente no minuto; cache de 60s é invisível para o usuário
# mas descarta a maioria das queries repetidas de abas simultâneas.
CACHE_TTL_SECONDS = float(os.getenv("DASHBOARD_CACHE_TTL", "60"))
_CACHE_STORE: Dict[str, Tuple[float, Any]] = {}
_CACHE_LOCK = threading.Lock()


def cache_get(key: str) -> Optional[Any]:
    if CACHE_TTL_SECONDS <= 0:
        return None
    with _CACHE_LOCK:
        entry = _CACHE_STORE.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.time():
            _CACHE_STORE.pop(key, None)
            return None
        return value


def cache_set(key: str, value: Any) -> None:
    if CACHE_TTL_SECONDS <= 0:
        return
    with _CACHE_LOCK:
        _CACHE_STORE[key] = (time.time() + CACHE_TTL_SECONDS, value)


def cache_get_or_compute(key: str, fetcher: Callable[[], Any]) -> Any:
    hit = cache_get(key)
    if hit is not None:
        return hit
    value = fetcher()
    cache_set(key, value)
    return value


def run_query(
    sql: str,
    database_name: str,
    params: Optional[Tuple[Any, ...]] = None,
    run_id: Optional[str] = None,
    context: str = "unknown",
) -> List[Dict[str, Any]]:
    """
    Executa query e retorna lista de dicionários (linhas).
    """
    try:
        started_at = time.perf_counter()
        _agent_ndjson(
            "OBS",
            "main.py:run_query:start",
            "query_start",
            {"database": database_name, "context": context},
            run_id=run_id,
        )
        with get_connection(database_name) as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)

            columns = [column[0] for column in cursor.description]
            rows = cursor.fetchall()
            result = [dict(zip(columns, row)) for row in rows]
            _agent_ndjson(
                "OBS",
                "main.py:run_query:end",
                "query_end",
                {
                    "database": database_name,
                    "context": context,
                    "rows_count": len(result),
                    "query_elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
                },
                run_id=run_id,
            )
            return jsonable_encoder(result)
    except HTTPException:
        raise
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "main.py:run_query:error",
            "query_error",
            {
                "database": database_name,
                "context": context,
                "error": str(exc),
            },
            run_id=run_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Erro ao executar consulta no banco de dados.",
        ) from exc


# ─────────────────────────────────────────────────────────────────
# GESTAO DE INDICES RECOMENDADOS (idempotente, read-only por padrao)
# ─────────────────────────────────────────────────────────────────
def _quote_ident(identifier: str) -> str:
    """Escapa um identificador SQL (schema/tabela/coluna) com colchetes."""
    return "[" + identifier.replace("]", "]]") + "]"


def _build_create_index_sql(idx: Dict[str, Any], *, online: bool) -> str:
    """
    Monta o CREATE NONCLUSTERED INDEX ... com as opcoes padrao.

    A flag online=True adiciona ONLINE = ON (requer SQL Server Enterprise);
    em Standard/Express deve ficar False para nao quebrar o comando.
    """
    schema = _quote_ident(idx["schema"])
    table = _quote_ident(idx["table"])
    index_name = _quote_ident(idx["name"])
    key_cols = ", ".join(_quote_ident(col) for col in idx["key_columns"])
    include_cols = ", ".join(_quote_ident(col) for col in idx.get("include_columns", []))

    options = [
        f"FILLFACTOR = {INDEX_DEFAULT_OPTIONS['FILLFACTOR']}",
        f"DATA_COMPRESSION = {INDEX_DEFAULT_OPTIONS['DATA_COMPRESSION']}",
        f"ONLINE = {'ON' if online else 'OFF'}",
    ]
    options_sql = ", ".join(options)

    include_clause = f"\n    INCLUDE ({include_cols})" if include_cols else ""
    return (
        f"CREATE NONCLUSTERED INDEX {index_name}\n"
        f"    ON {schema}.{table} ({key_cols}){include_clause}\n"
        f"    WITH ({options_sql})"
    )


def _build_update_statistics_sql(idx: Dict[str, Any]) -> str:
    schema = _quote_ident(idx["schema"])
    table = _quote_ident(idx["table"])
    return f"UPDATE STATISTICS {schema}.{table} WITH FULLSCAN"


def _index_exists(
    cursor: pyodbc.Cursor,
    schema: str,
    table: str,
    index_name: str,
) -> bool:
    """Consulta sys.indexes para decidir se o indice ja esta criado."""
    cursor.execute(
        """
        SELECT 1
        FROM sys.indexes i
        JOIN sys.objects o ON i.object_id = o.object_id
        JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE s.name = ? AND o.name = ? AND i.name = ?
        """,
        (schema, table, index_name),
    )
    return cursor.fetchone() is not None


def _list_index_status(database_name: str) -> List[Dict[str, Any]]:
    """Retorna, para cada indice recomendado, se ele ja existe no banco."""
    results: List[Dict[str, Any]] = []
    with get_connection(database_name) as conn:
        cursor = conn.cursor()
        for idx in RECOMMENDED_INDEXES:
            exists = _index_exists(cursor, idx["schema"], idx["table"], idx["name"])
            results.append({
                "name": idx["name"],
                "table": f"{idx['schema']}.{idx['table']}",
                "key_columns": list(idx["key_columns"]),
                "include_columns": list(idx.get("include_columns", [])),
                "purpose": idx.get("purpose", ""),
                "exists": bool(exists),
            })
        cursor.close()
    return results


def _apply_indexes_on_database(
    database_name: str,
    *,
    online: bool,
    dry_run: bool,
    update_statistics: bool,
) -> Dict[str, Any]:
    """
    Cria apenas os indices que ainda nao existem em ``database_name``.

    - ``dry_run=True`` (padrao) nao executa nada; apenas retorna o SQL gerado.
    - ``online=True`` tenta ONLINE = ON (so funciona em Enterprise).
    - ``update_statistics=True`` roda UPDATE STATISTICS ... WITH FULLSCAN
      para cada tabela cujo indice foi efetivamente criado (ignorado em dry_run).
    """
    started_at = time.perf_counter()
    steps: List[Dict[str, Any]] = []
    tables_to_refresh: set[str] = set()
    connection_ctx = None

    if not dry_run:
        connection_ctx = get_connection(database_name)
        conn = connection_ctx.__enter__()
        cursor = conn.cursor()
    else:
        conn = None
        cursor = None

    try:
        # Em dry_run ainda precisamos saber quais existem, mas sem abrir transacao longa.
        if dry_run:
            status_map = {row["name"]: row["exists"] for row in _list_index_status(database_name)}
        else:
            status_map = {}
            for idx in RECOMMENDED_INDEXES:
                status_map[idx["name"]] = _index_exists(
                    cursor, idx["schema"], idx["table"], idx["name"]
                )

        for idx in RECOMMENDED_INDEXES:
            already_exists = status_map.get(idx["name"], False)
            create_sql = _build_create_index_sql(idx, online=online)
            entry: Dict[str, Any] = {
                "name": idx["name"],
                "table": f"{idx['schema']}.{idx['table']}",
                "sql": create_sql,
                "action": "skipped_existing" if already_exists else (
                    "would_create" if dry_run else "created"
                ),
                "error": None,
            }

            if not already_exists and not dry_run:
                try:
                    cursor.execute(create_sql)
                    conn.commit()
                    tables_to_refresh.add(f"{idx['schema']}.{idx['table']}")
                except pyodbc.Error as exc:
                    entry["action"] = "failed"
                    entry["error"] = str(exc)
                    # Abortar em erro de permissao e deixar os demais registrados.

            steps.append(entry)

        statistics_steps: List[Dict[str, Any]] = []
        if update_statistics:
            targets = set()
            if dry_run:
                targets = {f"{idx['schema']}.{idx['table']}" for idx in RECOMMENDED_INDEXES}
            else:
                targets = tables_to_refresh
            for target in sorted(targets):
                schema, table = target.split(".", 1)
                idx_shell = {"schema": schema, "table": table}
                stats_sql = _build_update_statistics_sql(idx_shell)
                stats_entry: Dict[str, Any] = {
                    "target": target,
                    "sql": stats_sql,
                    "action": "would_update" if dry_run else "updated",
                    "error": None,
                }
                if not dry_run:
                    try:
                        cursor.execute(stats_sql)
                        conn.commit()
                    except pyodbc.Error as exc:
                        stats_entry["action"] = "failed"
                        stats_entry["error"] = str(exc)
                statistics_steps.append(stats_entry)
    finally:
        if cursor is not None:
            cursor.close()
        if connection_ctx is not None:
            connection_ctx.__exit__(None, None, None)

    return {
        "database": database_name,
        "dry_run": dry_run,
        "online": online,
        "update_statistics": update_statistics,
        "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
        "indexes": steps,
        "statistics": statistics_steps if update_statistics else [],
    }


def _ensure_index_admin_allowed() -> None:
    if not ENABLE_INDEX_ADMIN:
        raise HTTPException(
            status_code=403,
            detail=(
                "Endpoints de administracao de indices desabilitados. "
                "Habilite com ENABLE_INDEX_ADMIN=true no .env e rode em janela de manutencao."
            ),
        )


def print_rows_preview(rows: List[Dict[str, Any]], database_name: str, max_rows: int = 5) -> None:
    """
    Imprime no terminal os nomes das colunas e no máximo N linhas.
    """
    print(f"\n=== PREVIEW QUERY [{database_name}] (max 5 linhas) ===")
    if not rows:
        print("Nenhum registro retornado para hoje.")
        print("=== FIM PREVIEW ===\n")
        return

    columns = list(rows[0].keys())
    print("Colunas:", ", ".join(columns))

    for index, row in enumerate(rows[:max_rows], start=1):
        print("---- Linha", index, "----")
        for col in columns:
            print(f"{col}: {row.get(col)}")

    print(f"Total retornado pela query: {len(rows)}")
    print("=== FIM PREVIEW ===\n")


def build_response_envelope(
    rows: List[Dict[str, Any]],
    sources: List[str],
    errors: Optional[List[Dict[str, str]]] = None,
    filters: Optional[Dict[str, Any]] = None,
    run_id: Optional[str] = None,
    quality: Optional[Dict[str, Any]] = None,
    pagination: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    meta: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_rows": len(rows),
        "sources": sources,
        "filters": filters or {"date": "today"},
        "run_id": run_id,
        "quality": quality or {},
    }
    if pagination is not None:
        meta["pagination"] = pagination
    return {
        "meta": meta,
        "data": rows,
        "errors": errors or [],
    }


def validate_produtividade_rows(
    rows: List[Dict[str, Any]],
    run_id: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    validated_rows: List[Dict[str, Any]] = []
    numeric_fields = [
        "qtd_acionamentos",
        "qtd_contatos",
        "cpc_percentual",
        "qtd_acordos",
        "acordos_percentual",
        "valor_acordos",
        "acordo_medio",
        "parcelamento_medio",
        "desconto_medio_percentual",
        "valor_primeira_parcela",
    ]
    required_fields_missing_count = 0
    numeric_cast_failures = 0
    for row in rows:
        missing = [field for field in PRODUCTIVITY_REQUIRED_FIELDS if field not in row]
        if missing:
            required_fields_missing_count += len(missing)
            _agent_ndjson(
                "OBS",
                "main.py:validate_produtividade_rows:missing",
                "validation_fail",
                {"missing_fields": missing},
                run_id=run_id,
            )
            raise HTTPException(status_code=500, detail=f"Productivity response missing fields: {missing}")
        normalized = {**row}
        for field in numeric_fields:
            value = normalized.get(field)
            try:
                if field == "cpc_percentual":
                    normalized[field] = int(float(value)) if value is not None else 0
                else:
                    normalized[field] = float(value) if value is not None else 0.0
            except (TypeError, ValueError):
                numeric_cast_failures += 1
                normalized[field] = 0 if field == "cpc_percentual" else 0.0
        normalized["CHAVE"] = str(normalized.get("CHAVE") or "")
        normalized["NOME"] = str(normalized.get("NOME") or "")
        validated_rows.append(normalized)
    metrics = {
        "required_fields_missing_count": required_fields_missing_count,
        "numeric_cast_failures": numeric_cast_failures,
        "rows_count": len(validated_rows),
    }
    _agent_ndjson(
        "OBS",
        "main.py:validate_produtividade_rows:ok",
        "validation_ok",
        metrics,
        run_id=run_id,
    )
    return validated_rows, metrics


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: ACORDOS HOJE
# ─────────────────────────────────────────────────────────────────
@app.get("/dashboard/acordos-hoje")
def get_dashboard_acordos_hoje(
    limit: Optional[int] = Query(default=None, ge=1, le=ACORDOS_HOJE_MAX_LIMIT),
    offset: Optional[int] = Query(default=None, ge=0),
) -> Dict[str, Any]:
    database_name = "COBwebRCBAUTOS"
    lim, off = _normalize_pagination(limit, offset)
    raw = run_query(QUERY_ACORDOS_HOJE, database_name, (date.today(), off, lim))
    rows, total = _extract_total_rows(raw)
    print_rows_preview(rows, database_name, max_rows=5)
    return build_response_envelope(
        rows, [database_name],
        pagination={"limit": lim, "offset": off, "total": total, "returned": len(rows)},
    )


@app.get("/dashboard/acordos-hoje/todos")
def get_dashboard_acordos_hoje_todos(
    limit: Optional[int] = Query(default=None, ge=1, le=ACORDOS_HOJE_MAX_LIMIT),
    offset: Optional[int] = Query(default=None, ge=0),
) -> Dict[str, Any]:
    """
    Combina os dois bancos. Paginação aplicada por banco: cada banco recebe a
    mesma janela (limit/offset). Mantém compatibilidade — o frontend só
    pagina a grade detalhada, que naturalmente chega a poucas milhares de linhas.
    """
    all_rows: List[Dict[str, Any]] = []
    today = date.today()
    lim, off = _normalize_pagination(limit, offset)
    totals: Dict[str, int] = {}
    for database_name in ALLOWED_DATABASES:
        raw = run_query(QUERY_ACORDOS_HOJE, database_name, (today, off, lim))
        rows, total = _extract_total_rows(raw)
        totals[database_name] = total
        print_rows_preview(rows, database_name, max_rows=5)
        for row in rows:
            row["banco_origem"] = database_name
        all_rows.extend(rows)
    return build_response_envelope(
        all_rows, ALLOWED_DATABASES,
        pagination={
            "limit": lim, "offset": off,
            "total": sum(totals.values()),
            "total_por_banco": totals,
            "returned": len(all_rows),
        },
    )


@app.get("/dashboard/acordos-hoje/{database_name}")
def get_dashboard_acordos_hoje_por_banco(
    database_name: str,
    limit: Optional[int] = Query(default=None, ge=1, le=ACORDOS_HOJE_MAX_LIMIT),
    offset: Optional[int] = Query(default=None, ge=0),
) -> Dict[str, Any]:
    database_name = validate_database(database_name)
    lim, off = _normalize_pagination(limit, offset)
    raw = run_query(QUERY_ACORDOS_HOJE, database_name, (date.today(), off, lim))
    rows, total = _extract_total_rows(raw)
    print_rows_preview(rows, database_name, max_rows=5)
    return build_response_envelope(
        rows, [database_name],
        pagination={"limit": lim, "offset": off, "total": total, "returned": len(rows)},
    )


def _build_agreements_tabela_query(database_name: str, filter_by_agente: bool) -> str:
    def _single_db_query(db_name: str) -> str:
        return f"""
            SELECT
                U.NOME AS agente,
                DEV.CPF_CNPJ AS cpf_cnpj,
                DEV.NOME_RAZAO AS nome_devedor,
                RM.NR_RECEBIMENTO AS nr_acordo,
                RS.DESCR AS tipo_acordo,
                MAX(CASE WHEN RM.PARCELA = 0 THEN RM.DT_VENCIMENTO END) AS vencimento_primeira_parcela,
                MAX(CASE WHEN RM.PARCELA = 0 THEN RM.VALOR END) AS valor_primeira_parcela,
                MAX(CASE WHEN RM.PARCELA = 1 THEN RM.VALOR END) AS valor_demais_parcelas,
                MAX(RM.PLANO) AS qtd_parcelas,
                SUM(RM.VALOR) AS valor_total_acordo,
                MAX(RM.DT_EMISSAO) AS data_emissao
            FROM {db_name}.dbo.REC_MASTER RM (NOLOCK)
            JOIN {db_name}.dbo.USU_MASTER U (NOLOCK) ON RM.ID_USUARIO = U.ID_USUARIO
            JOIN {db_name}.dbo.DEV_MASTER DEV (NOLOCK) ON RM.ID_DEV = DEV.ID_DEV
            LEFT JOIN {db_name}.dbo.REC_STATUS RS (NOLOCK) ON RM.ID_REC_STATUS = RS.ID_REC_STATUS
            WHERE RM.DT_EMISSAO >= @Hoje AND RM.DT_EMISSAO < @Amanha
              AND RM.ID_REC_STATUS IN {STATUS_UNIVERSO_SQL}
              {FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY U.NOME, DEV.CPF_CNPJ, DEV.NOME_RAZAO, RM.NR_RECEBIMENTO, RS.DESCR
        """

    outer_where = "WHERE base.agente = ?" if filter_by_agente else ""
    if database_name == "todos":
        return f"""
            DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
            DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
            WITH base AS (
                {_single_db_query("COBwebRCBCONSUMER")}
                UNION ALL
                {_single_db_query("COBwebRCBAUTOS")}
            )
            SELECT
                base.agente,
                base.cpf_cnpj,
                base.nome_devedor,
                base.nr_acordo,
                base.tipo_acordo,
                base.vencimento_primeira_parcela,
                base.valor_primeira_parcela,
                base.valor_demais_parcelas,
                base.qtd_parcelas,
                base.valor_total_acordo,
                base.data_emissao
            FROM base
            {outer_where}
            ORDER BY
                base.agente,
                CASE WHEN UPPER(LTRIM(RTRIM(base.tipo_acordo))) = 'EXCEÇÃO' THEN 1 ELSE 0 END,
                base.cpf_cnpj,
                base.nr_acordo
        """

    return f"""
        DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
        DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
        WITH base AS (
            {_single_db_query(database_name)}
        )
        SELECT
            base.agente,
            base.cpf_cnpj,
            base.nome_devedor,
            base.nr_acordo,
            base.tipo_acordo,
            base.vencimento_primeira_parcela,
            base.valor_primeira_parcela,
            base.valor_demais_parcelas,
            base.qtd_parcelas,
            base.valor_total_acordo,
            base.data_emissao
        FROM base
        {outer_where}
        ORDER BY
            CASE WHEN UPPER(LTRIM(RTRIM(base.tipo_acordo))) = 'EXCEÇÃO' THEN 1 ELSE 0 END,
            base.cpf_cnpj,
            base.nr_acordo
    """


@app.get("/dashboard/acordos-hoje-agente/{db}")
def get_dashboard_acordos_hoje_agente(
    db: str,
    agente: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    agente_aplicado = (agente or "").strip()
    filter_by_agente = bool(agente_aplicado and agente_aplicado.lower() != "todos")
    query = _build_agreements_tabela_query(validated_db, filter_by_agente)
    conn_db = ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    params: Optional[Tuple[Any, ...]] = (agente_aplicado,) if filter_by_agente else None
    rows = run_query(
        query,
        conn_db,
        params=params,
        run_id=run_id,
        context="dashboard/acordos-hoje-agente",
    )
    sources = ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    return build_response_envelope(
        rows,
        sources,
        filters={"date": "today", "database": validated_db, "agente": agente_aplicado or "todos"},
        run_id=run_id,
    )


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: PRODUTIVIDADE
# ─────────────────────────────────────────────────────────────────
@app.get("/dashboard/produtividade-hoje/{database_name}")
def get_dashboard_produtividade_hoje(
    database_name: str,
    assessoria: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    endpoint_started_at = time.perf_counter()
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    database_name = validate_database(database_name)
    rows = run_query(
        _build_produtividade_query(database_name, use_distinct_esforco=True),
        database_name,
        run_id=run_id,
        context="dashboard/produtividade-hoje",
    )
    rows, validation_metrics = validate_produtividade_rows(rows, run_id=run_id)
    assessoria_applied = "todos"
    if assessoria and assessoria.strip().lower() != "todos":
        assessoria_applied = assessoria.strip()
        token = assessoria_applied.split(":")[-1].strip().upper()
        rows = [
            row
            for row in rows
            if token in str(row.get("CHAVE", "")).upper()
            or token in str(row.get("NOME", "")).upper()
        ]
    quality = {
        "entrada_ok": True,
        "alimentacao_ok": True,
        "apresentacao_ready": True,
        "endpoint_total_elapsed_ms": round((time.perf_counter() - endpoint_started_at) * 1000, 2),
        **validation_metrics,
    }
    _agent_ndjson(
        "OBS",
        "main.py:get_dashboard_produtividade_hoje:response_envelope",
        "response_envelope",
        {"database": database_name, "assessoria": assessoria_applied, **quality},
        run_id=run_id,
    )
    return build_response_envelope(
        rows,
        [database_name],
        filters={"date": "today", "assessoria": assessoria_applied},
        run_id=run_id,
        quality=quality,
    )


@app.get("/dashboard/status-carga/{db}")
def get_dashboard_status_carga(
    db: str,
    assessoria: Optional[str] = Query(default=None),
    request: Request = None,
) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    targets = ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    summaries: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    assessoria_applied = "todos"
    assessoria_token = ""
    if assessoria and assessoria.strip().lower() != "todos":
        assessoria_applied = assessoria.strip()
        assessoria_token = assessoria_applied.split(":")[-1].strip().upper()

    for source in targets:
        try:
            rows = run_query(
                _build_produtividade_query(source, use_distinct_esforco=True),
                source,
                run_id=run_id,
                context="dashboard/status-carga",
            )
            rows, _ = validate_produtividade_rows(rows, run_id=run_id)
            if assessoria_token:
                rows = [
                    row
                    for row in rows
                    if assessoria_token in str(row.get("CHAVE", "")).upper()
                    or assessoria_token in str(row.get("NOME", "")).upper()
                ]
            summaries.append({
                "database": source,
                "agentes": len(rows),
                "qtd_acionamentos": int(sum(float(r.get("qtd_acionamentos", 0) or 0) for r in rows)),
                "qtd_contatos": int(sum(float(r.get("qtd_contatos", 0) or 0) for r in rows)),
                "qtd_acordos": int(sum(float(r.get("qtd_acordos", 0) or 0) for r in rows)),
                "valor_acordos": round(sum(float(r.get("valor_acordos", 0) or 0) for r in rows), 2),
                "qtd_excecoes": int(sum(float(r.get("qtd_excecoes", 0) or 0) for r in rows)),
                "valor_excecoes": round(sum(float(r.get("valor_excecoes", 0) or 0) for r in rows), 2),
            })
        except HTTPException as exc:
            errors.append({"source": source, "message": str(exc.detail)})

    if not summaries:
        detail = errors[0]["message"] if errors else "Nenhuma fonte disponível para confirmar carga."
        raise HTTPException(status_code=500, detail=detail)

    if validated_db == "todos" and len(summaries) > 1:
        summaries.append({
            "database": "todos",
            "agentes": sum(int(row.get("agentes", 0) or 0) for row in summaries),
            "qtd_acionamentos": sum(int(row.get("qtd_acionamentos", 0) or 0) for row in summaries),
            "qtd_contatos": sum(int(row.get("qtd_contatos", 0) or 0) for row in summaries),
            "qtd_acordos": sum(int(row.get("qtd_acordos", 0) or 0) for row in summaries),
            "valor_acordos": round(sum(float(row.get("valor_acordos", 0) or 0) for row in summaries), 2),
            "qtd_excecoes": sum(int(row.get("qtd_excecoes", 0) or 0) for row in summaries),
            "valor_excecoes": round(sum(float(row.get("valor_excecoes", 0) or 0) for row in summaries), 2),
        })

    quality = {
        "status": "ok" if not errors else "partial",
        "targets": len(targets),
        "sources_ok": len(summaries),
        "sources_error": len(errors),
    }
    return build_response_envelope(
        summaries,
        targets,
        errors=errors,
        filters={"date": "today", "database": validated_db, "assessoria": assessoria_applied},
        run_id=run_id,
        quality=quality,
    )


def _get_dashboard_agentes_unificado(
    database_name: str,
    request: Optional[Request],
    context: str,
) -> Dict[str, Any]:
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_database = validate_database_or_todos(database_name)
    query = _build_produtividade_query(validated_database, use_distinct_esforco=False)
    rows = run_query(
        query,
        ALLOWED_DATABASES[0],
        run_id=run_id,
        context=context,
    )
    sources = ALLOWED_DATABASES if validated_database == "todos" else [validated_database]
    return build_response_envelope(
        rows,
        sources,
        filters={"date": "today", "database": validated_database},
        run_id=run_id,
    )


@app.get("/dashboard/comparacao-agentes/{db}")
@app.get("/dashboard/comparacao-agentes/{database_name}")
def get_dashboard_comparacao_agentes(
    db: Optional[str] = None,
    database_name: Optional[str] = None,
    request: Request = None,
) -> Dict[str, Any]:
    target_db = db if db is not None else (database_name or "")
    return _get_dashboard_agentes_unificado(
        database_name=target_db,
        request=request,
        context="dashboard/comparacao-agentes",
    )


@app.get("/dashboard/detalhamento-agentes/{database_name}")
def get_dashboard_detalhamento_agentes(
    database_name: str,
    request: Request = None,
) -> Dict[str, Any]:
    return _get_dashboard_agentes_unificado(
        database_name=database_name,
        request=request,
        context="dashboard/detalhamento-agentes",
    )


@app.get("/dashboard/produtividade/{database_name}")
def get_dashboard_produtividade(
    database_name: str,
    request: Request = None,
) -> Dict[str, Any]:
    return _get_dashboard_agentes_unificado(
        database_name=database_name,
        request=request,
        context="dashboard/produtividade",
    )


def _fetch_produtividade_agentes_consolidado(force_refresh: bool = False) -> dict:
    cache_key = "produtividade_agentes_consolidado"
    now = time.time()
    cached = _PRODUTIVIDADE_AGENTES_CACHE.get(cache_key)
    if not force_refresh and cached:
        cached_at, cached_payload = cached
        cache_age = now - cached_at
        if cache_age < _PRODUTIVIDADE_AGENTES_TTL_SECONDS:
            payload = jsonable_encoder(cached_payload)
            payload["cache_age_seconds"] = max(1, int(cache_age))
            return payload

    query = _build_produtividade_agentes_query()
    rows_by_db: Dict[str, List[Dict[str, Any]]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(ALLOWED_DATABASES)) as executor:
        futures = {
            executor.submit(
                run_query,
                query,
                db,
                None,
                None,
                "dashboard/produtividade-agentes",
            ): db
            for db in ALLOWED_DATABASES
        }
        for future in concurrent.futures.as_completed(futures):
            db = futures[future]
            rows_by_db[db] = future.result()

    consolidated: Dict[str, Dict[str, Any]] = {}
    for db in ALLOWED_DATABASES:
        short_db = db.replace("COBwebRCB", "")
        for row in rows_by_db.get(db, []):
            login = str(row.get("LOGIN_AGENTE") or "").strip()
            name = str(row.get("NOME_AGENTE") or "").strip()
            key = _normalize_agent_key(login, name)
            if not key:
                continue

            if key not in consolidated:
                consolidated[key] = {
                    "agent_key": key.lower(),
                    "login": login,
                    "name": name,
                    "by_database": {},
                    "total": {"acionamentos": 0, "contatos": 0},
                }

            acionamentos = int(row.get("QTD_ACIONAMENTOS") or 0)
            contatos = int(row.get("QTD_CONTATOS") or 0)
            consolidated[key]["by_database"][short_db] = {
                "acionamentos": acionamentos,
                "contatos": contatos,
            }
            consolidated[key]["total"]["acionamentos"] += acionamentos
            consolidated[key]["total"]["contatos"] += contatos

    agents = sorted(
        consolidated.values(),
        key=lambda item: item["total"]["acionamentos"],
        reverse=True,
    )
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "cache_age_seconds": 0,
        "agents": agents,
    }
    _PRODUTIVIDADE_AGENTES_CACHE[cache_key] = (time.time(), payload)
    return jsonable_encoder(payload)


@app.get("/dashboard/produtividade-agentes")
def get_produtividade_agentes(force_refresh: bool = False) -> dict:
    return _fetch_produtividade_agentes_consolidado(force_refresh=force_refresh)


# ─────────────────────────────────────────────────────────────────
# BUILDERS DE QUERY DOS GRÁFICOS/CARDS
# ─────────────────────────────────────────────────────────────────
#
# Padrão: todos os builders seguem a mesma estrutura — uma função interna
# `_base(database)` gera o SELECT pra um único banco, e o wrapper faz
# UNION ALL + agregação quando o filtro é "todos".
#
# Para os gráficos de portfolio, o nome do banco vem da DIV_AUX.CAMPO010
# (não da CART_MASTER). O CROSS APPLY com TOP 1 pega o CAMPO010 de uma
# dívida vinculada ao acordo, evitando multiplicar linhas quando um mesmo
# acordo cobre múltiplas dívidas (o que é raro, e quando ocorre, todas
# as dívidas do acordo são do mesmo banco).
# ─────────────────────────────────────────────────────────────────

def _wrap_todos_or_single(db: str, base_fn, agg_select: str, order_by: str) -> str:
    """
    Helper central dos builders. Monta o query final a partir de:
      - `base_fn(database)` → SELECT base pra um único banco
      - `agg_select` → SELECT de agregação externa quando db == 'todos'
      - `order_by` → ORDER BY final
    """
    header = """
        DECLARE @Hoje DATE = CAST(GETDATE() AS DATE);
        DECLARE @Amanha DATE = DATEADD(DAY, 1, @Hoje);
    """
    if db == "todos":
        inner = f"{base_fn('COBwebRCBCONSUMER')}\n            UNION ALL\n{base_fn('COBwebRCBAUTOS')}"
        return f"""
            {header}
            {agg_select}
            FROM (
                {inner}
            ) sub
            {order_by}
        """
    return f"""
        {header}
        {base_fn(db)}
        {order_by}
    """


def _build_primeira_parcela_dia_query(db: str) -> str:
    """
    Card de topo: soma da 1ª parcela de hoje e quantidade de acordos.
    Considera acordos aprovados (ATIVO, BAIXA POR PAGAMENTO, BAIXA AVULSA).
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                SUM(R.VALOR) AS total_valor,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS total_acordos
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            WHERE R.PARCELA = {PRIMEIRA_PARCELA}
              AND R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.ID_REC_STATUS IN {STATUS_APROVADOS_SQL}
              {FILTRO_AGENTES_EXCLUIDOS_SQL}
        """

    agg = """
        SELECT
            SUM(sub.total_valor) AS total_valor,
            SUM(sub.total_acordos) AS total_acordos
    """
    return _wrap_todos_or_single(db, _base, agg, order_by="")


def _build_excecoes_por_portfolio_query(db: str) -> str:
    """
    Gráfico: exceções agrupadas por nome do portfolio (CAMPO010 da DIV_AUX).
    Usa CROSS APPLY com TOP 1 para evitar multiplicação de linhas quando
    um acordo tem múltiplas dívidas vinculadas.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                DA.{PORTFOLIO_COLUMN} AS portfolio_name,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_excecoes,
                SUM(R.VALOR) AS valor_excecoes
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            CROSS APPLY (
                SELECT TOP 1 DA2.{PORTFOLIO_COLUMN}
                FROM {database}.dbo.REC_DIVIDAS RD (NOLOCK)
                JOIN {database}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
                WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                  AND RD.ID_CARTEIRA = R.ID_CARTEIRA
                  AND DA2.{PORTFOLIO_COLUMN} IS NOT NULL
            ) DA
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {STATUS_EXCECAO_SQL}
              {FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY DA.{PORTFOLIO_COLUMN}
        """

    agg = """
        SELECT
            portfolio_name,
            SUM(qtd_excecoes) AS qtd_excecoes,
            SUM(valor_excecoes) AS valor_excecoes
    """
    order = "GROUP BY portfolio_name ORDER BY qtd_excecoes DESC" if db == "todos" else "ORDER BY qtd_excecoes DESC"
    return _wrap_todos_or_single(db, _base, agg, order_by=order)


def _build_excecoes_por_agente_query(db: str) -> str:
    """
    Gráfico: exceções agrupadas por agente.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                U.NOME AS agente,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_excecoes,
                SUM(R.VALOR) AS valor_excecoes
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {STATUS_EXCECAO_SQL}
              {FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY U.NOME
        """

    agg = """
        SELECT
            agente,
            SUM(qtd_excecoes) AS qtd_excecoes,
            SUM(valor_excecoes) AS valor_excecoes
    """
    order = "GROUP BY agente ORDER BY qtd_excecoes DESC" if db == "todos" else "ORDER BY qtd_excecoes DESC"
    return _wrap_todos_or_single(db, _base, agg, order_by=order)


def _build_acordos_por_portfolio_query(db: str) -> str:
    """
    Gráfico: acordos aprovados agrupados por portfolio (CAMPO010 da DIV_AUX).
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                DA.{PORTFOLIO_COLUMN} AS portfolio_name,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_acordos,
                SUM(R.VALOR) AS valor_acordos
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            CROSS APPLY (
                SELECT TOP 1 DA2.{PORTFOLIO_COLUMN}
                FROM {database}.dbo.REC_DIVIDAS RD (NOLOCK)
                JOIN {database}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
                WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                  AND RD.ID_CARTEIRA = R.ID_CARTEIRA
                  AND DA2.{PORTFOLIO_COLUMN} IS NOT NULL
            ) DA
            WHERE R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.PARCELA = {PRIMEIRA_PARCELA}
              AND R.ID_REC_STATUS IN {STATUS_APROVADOS_SQL}
              {FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY DA.{PORTFOLIO_COLUMN}
        """

    agg = """
        SELECT
            portfolio_name,
            SUM(qtd_acordos) AS qtd_acordos,
            SUM(valor_acordos) AS valor_acordos
    """
    order = "GROUP BY portfolio_name ORDER BY qtd_acordos DESC" if db == "todos" else "ORDER BY qtd_acordos DESC"
    return _wrap_todos_or_single(db, _base, agg, order_by=order)


def _build_primeira_parcela_por_agente_query(db: str) -> str:
    """
    Gráfico: valor e quantidade da 1ª parcela por agente (acordos aprovados).
    """
    def _base(database: str) -> str:
        return f"""
            SELECT
                U.NOME AS agente,
                COUNT(DISTINCT R.NR_RECEBIMENTO) AS qtd_acordos_primeira_parcela,
                SUM(R.VALOR) AS valor_primeira_parcela
            FROM {database}.dbo.REC_MASTER R (NOLOCK)
            JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
            WHERE R.PARCELA = {PRIMEIRA_PARCELA}
              AND R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
              AND R.ID_REC_STATUS IN {STATUS_APROVADOS_SQL}
              {FILTRO_AGENTES_EXCLUIDOS_SQL}
            GROUP BY U.NOME
        """

    agg = """
        SELECT
            agente,
            SUM(qtd_acordos_primeira_parcela) AS qtd_acordos_primeira_parcela,
            SUM(valor_primeira_parcela) AS valor_primeira_parcela
    """
    order = "GROUP BY agente ORDER BY valor_primeira_parcela DESC" if db == "todos" else "ORDER BY valor_primeira_parcela DESC"
    return _wrap_todos_or_single(db, _base, agg, order_by=order)


def _build_produtividade_agentes_query() -> str:
    return f"""
SELECT
    UM.CHAVE                         AS LOGIN_AGENTE,
    UM.NOME                          AS NOME_AGENTE,
    COUNT(DISTINCT CM.ID_CTO_MASTER) AS QTD_ACIONAMENTOS,
    COUNT(DISTINCT CASE
        WHEN CM.ID_COMPLEMENTO IN {_sql_in(CPC_COMPLEMENTO_IDS)}
        THEN CM.ID_CTO_MASTER
    END)                             AS QTD_CONTATOS
FROM dbo.CTO_MASTER CM
JOIN dbo.USU_MASTER U ON U.ID_USUARIO = CM.ID_USUARIO
JOIN dbo.USU_MASTER UM ON UM.ID_USUARIO = CM.ID_USUARIO
WHERE CM.DATA >= CAST(GETDATE() AS DATE)
  AND CM.DATA <  CAST(DATEADD(DAY, 1, GETDATE()) AS DATE)
  {FILTRO_AGENTES_EXCLUIDOS_SQL}
GROUP BY UM.CHAVE, UM.NOME
"""


def _normalize_agent_key(login: Optional[str], name: Optional[str]) -> str:
    """Unification key across databases. Prefers CHAVE (login) over NOME."""
    base = (login or "").strip().upper()
    if base:
        return base
    return (name or "").strip().upper()


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: GRÁFICOS E CARDS
# ─────────────────────────────────────────────────────────────────
def _run_dashboard_chart(
    db: str,
    query_builder,
    context: str,
    request: Optional[Request],
) -> Dict[str, Any]:
    """Helper central que executa qualquer builder de gráfico/card.

    O resultado (apenas as linhas de dados) é cacheado por CACHE_TTL_SECONDS.
    O envelope continua sendo montado no request para preservar run_id e
    generated_at frescos.
    """
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    conn_db = ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db

    def _compute() -> List[Dict[str, Any]]:
        query = query_builder(validated_db)
        return run_query(query, conn_db, run_id=run_id, context=context)

    cache_key = f"chart|{context}|{validated_db}"
    rows = cache_get_or_compute(cache_key, _compute)
    sources = ALLOWED_DATABASES if validated_db == "todos" else [validated_db]
    return build_response_envelope(
        rows, sources,
        filters={"date": "today", "database": validated_db},
        run_id=run_id,
    )


@app.get("/dashboard/primeira-parcela-dia/{db}")
def get_primeira_parcela_dia(db: str, request: Request = None) -> Dict[str, Any]:
    return _run_dashboard_chart(
        db, _build_primeira_parcela_dia_query,
        "dashboard/primeira-parcela-dia", request,
    )


@app.get("/dashboard/excecoes-por-portfolio/{db}")
def get_excecoes_por_portfolio(db: str, request: Request = None) -> Dict[str, Any]:
    return _run_dashboard_chart(
        db, _build_excecoes_por_portfolio_query,
        "dashboard/excecoes-por-portfolio", request,
    )


@app.get("/dashboard/excecoes-por-agente/{db}")
def get_excecoes_por_agente(db: str, request: Request = None) -> Dict[str, Any]:
    return _run_dashboard_chart(
        db, _build_excecoes_por_agente_query,
        "dashboard/excecoes-por-agente", request,
    )


@app.get("/dashboard/acordos-por-portfolio/{db}")
def get_acordos_por_portfolio(db: str, request: Request = None) -> Dict[str, Any]:
    return _run_dashboard_chart(
        db, _build_acordos_por_portfolio_query,
        "dashboard/acordos-por-portfolio", request,
    )


@app.get("/dashboard/primeira-parcela-por-agente/{db}")
def get_primeira_parcela_por_agente(db: str, request: Request = None) -> Dict[str, Any]:
    return _run_dashboard_chart(
        db, _build_primeira_parcela_por_agente_query,
        "dashboard/primeira-parcela-por-agente", request,
    )


# ─────────────────────────────────────────────────────────────────
# EFETIVIDADE DE ACORDOS — QUERIES, ETL E ENDPOINTS
# ─────────────────────────────────────────────────────────────────

_EF_PAID = (
    "CASE WHEN VR_PAGO > 0 "
    "AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) "
    "THEN 1 ELSE 0 END"
)
_EF_CONV = (
    f"CAST(FLOOR(100.0 * SUM({_EF_PAID}) / NULLIF(COUNT(*), 0) + 0.5) AS INT)"
)
_EF_AGENT_FILTER = (
    "AND U.CHAVE NOT LIKE '%Antlia%' "
    "AND U.CHAVE NOT LIKE '%suporte%' "
    "AND U.CHAVE NOT LIKE '%Interna%' "
    "AND U.CHAVE NOT LIKE '%User%'"
)
_EF_DB_A = "COBwebRCBAUTOS"
_EF_DB_C = "COBwebRCBCONSUMER"
_EF_STATUS = STATUS_APROVADOS_SQL  # (1, 3, 12)

QUERY_EF_DIARIA_PRIMEIRA = f"""
SELECT
    CAST(DT_EMISSAO AS DATE) AS Dia_Emissao,
    COUNT(*) AS Boletos_Gerados,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Prazo_5d
FROM (
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA = 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
    UNION ALL
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA = 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
) AS T
GROUP BY CAST(DT_EMISSAO AS DATE)
ORDER BY Dia_Emissao
"""

QUERY_EF_MENSAL_PRIMEIRA = f"""
SELECT
    YEAR(DT_EMISSAO) AS Ano,
    MONTH(DT_EMISSAO) AS Mes,
    COUNT(*) AS Boletos_Gerados,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Prazo_5d
FROM (
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA = 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
    UNION ALL
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA = 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
) AS T
GROUP BY YEAR(DT_EMISSAO), MONTH(DT_EMISSAO)
ORDER BY Ano, Mes
"""

QUERY_EF_DIARIA_COLCHAO = f"""
SELECT
    CAST(DT_EMISSAO AS DATE) AS Dia_Emissao,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Colchao
FROM (
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
    UNION ALL
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
) AS T
GROUP BY CAST(DT_EMISSAO AS DATE)
ORDER BY Dia_Emissao
"""

QUERY_EF_MENSAL_COLCHAO = f"""
SELECT
    YEAR(DT_EMISSAO) AS Ano,
    MONTH(DT_EMISSAO) AS Mes,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Colchao
FROM (
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
    UNION ALL
    SELECT DT_EMISSAO, VR_PAGO, DT_PAGAMENTO, DT_VENCIMENTO
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_EMISSAO) >= 2026
) AS T
GROUP BY YEAR(DT_EMISSAO), MONTH(DT_EMISSAO)
ORDER BY Ano, Mes
"""

QUERY_EF_MENSAL_AGENTE_PRIMEIRA = f"""
SELECT
    Agente,
    Ano,
    Mes,
    COUNT(*) AS Boletos_Gerados,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Prazo_5d
FROM (
    SELECT R.DT_EMISSAO, R.VR_PAGO, R.DT_PAGAMENTO, R.DT_VENCIMENTO,
           U.CHAVE AS Agente, YEAR(R.DT_EMISSAO) AS Ano, MONTH(R.DT_EMISSAO) AS Mes
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK) R
    INNER JOIN {_EF_DB_A}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO
    WHERE R.PARCELA = 0 AND R.ID_REC_STATUS IN {_EF_STATUS} AND YEAR(R.DT_EMISSAO) >= 2026
      {_EF_AGENT_FILTER}
    UNION ALL
    SELECT R.DT_EMISSAO, R.VR_PAGO, R.DT_PAGAMENTO, R.DT_VENCIMENTO,
           U.CHAVE AS Agente, YEAR(R.DT_EMISSAO) AS Ano, MONTH(R.DT_EMISSAO) AS Mes
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK) R
    INNER JOIN {_EF_DB_C}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO
    WHERE R.PARCELA = 0 AND R.ID_REC_STATUS IN {_EF_STATUS} AND YEAR(R.DT_EMISSAO) >= 2026
      {_EF_AGENT_FILTER}
) AS T
GROUP BY Agente, Ano, Mes
ORDER BY Ano, Mes, Agente
"""

QUERY_EF_MENSAL_AGENTE_COLCHAO = f"""
SELECT
    Agente,
    Ano,
    Mes,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Colchao
FROM (
    SELECT R.DT_EMISSAO, R.VR_PAGO, R.DT_PAGAMENTO, R.DT_VENCIMENTO,
           U.CHAVE AS Agente, YEAR(R.DT_EMISSAO) AS Ano, MONTH(R.DT_EMISSAO) AS Mes
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK) R
    INNER JOIN {_EF_DB_A}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO
    WHERE R.PARCELA > 0 AND R.ID_REC_STATUS IN {_EF_STATUS} AND YEAR(R.DT_EMISSAO) >= 2026
      {_EF_AGENT_FILTER}
    UNION ALL
    SELECT R.DT_EMISSAO, R.VR_PAGO, R.DT_PAGAMENTO, R.DT_VENCIMENTO,
           U.CHAVE AS Agente, YEAR(R.DT_EMISSAO) AS Ano, MONTH(R.DT_EMISSAO) AS Mes
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK) R
    INNER JOIN {_EF_DB_C}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO
    WHERE R.PARCELA > 0 AND R.ID_REC_STATUS IN {_EF_STATUS} AND YEAR(R.DT_EMISSAO) >= 2026
      {_EF_AGENT_FILTER}
) AS T
GROUP BY Agente, Ano, Mes
ORDER BY Ano, Mes, Agente
"""

QUERY_EF_DIARIA_COLCHAO_VENCIMENTO = f"""
SELECT
    CAST(DT_VENCIMENTO AS DATE) AS Dia_Vencimento,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Colchao
FROM (
    SELECT DT_VENCIMENTO, VR_PAGO, DT_PAGAMENTO
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_VENCIMENTO) >= 2026
    UNION ALL
    SELECT DT_VENCIMENTO, VR_PAGO, DT_PAGAMENTO
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_VENCIMENTO) >= 2026
) AS T
GROUP BY CAST(DT_VENCIMENTO AS DATE)
ORDER BY Dia_Vencimento
"""

QUERY_EF_MENSAL_COLCHAO_VENCIMENTO = f"""
SELECT
    YEAR(DT_VENCIMENTO) AS Ano,
    MONTH(DT_VENCIMENTO) AS Mes,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Colchao
FROM (
    SELECT DT_VENCIMENTO, VR_PAGO, DT_PAGAMENTO
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_VENCIMENTO) >= 2026
    UNION ALL
    SELECT DT_VENCIMENTO, VR_PAGO, DT_PAGAMENTO
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK)
    WHERE PARCELA > 0 AND ID_REC_STATUS IN {_EF_STATUS} AND YEAR(DT_VENCIMENTO) >= 2026
) AS T
GROUP BY YEAR(DT_VENCIMENTO), MONTH(DT_VENCIMENTO)
ORDER BY Ano, Mes
"""

QUERY_EF_MENSAL_AGENTE_COLCHAO_VENCIMENTO = f"""
SELECT
    Agente,
    Ano,
    Mes,
    COUNT(*) AS Boletos_Gerados_Colchao,
    SUM({_EF_PAID}) AS Pagos_No_Prazo,
    {_EF_CONV} AS Conversao_Colchao
FROM (
    SELECT R.DT_VENCIMENTO, R.VR_PAGO, R.DT_PAGAMENTO,
           U.CHAVE AS Agente, YEAR(R.DT_VENCIMENTO) AS Ano, MONTH(R.DT_VENCIMENTO) AS Mes
    FROM {_EF_DB_A}.dbo.REC_MASTER (NOLOCK) R
    INNER JOIN {_EF_DB_A}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO
    WHERE R.PARCELA > 0 AND R.ID_REC_STATUS IN {_EF_STATUS} AND YEAR(R.DT_VENCIMENTO) >= 2026
      {_EF_AGENT_FILTER}
    UNION ALL
    SELECT R.DT_VENCIMENTO, R.VR_PAGO, R.DT_PAGAMENTO,
           U.CHAVE AS Agente, YEAR(R.DT_VENCIMENTO) AS Ano, MONTH(R.DT_VENCIMENTO) AS Mes
    FROM {_EF_DB_C}.dbo.REC_MASTER (NOLOCK) R
    INNER JOIN {_EF_DB_C}.dbo.USU_MASTER (NOLOCK) U ON R.ID_USUARIO = U.ID_USUARIO
    WHERE R.PARCELA > 0 AND R.ID_REC_STATUS IN {_EF_STATUS} AND YEAR(R.DT_VENCIMENTO) >= 2026
      {_EF_AGENT_FILTER}
) AS T
GROUP BY Agente, Ano, Mes
HAVING COUNT(*) >= 10
ORDER BY Ano, Mes, Agente
"""

_EF_QUERY_MAP: Dict[str, str] = {
    "diaria-primeira": QUERY_EF_DIARIA_PRIMEIRA,
    "mensal-primeira": QUERY_EF_MENSAL_PRIMEIRA,
    "diaria-colchao": QUERY_EF_DIARIA_COLCHAO,
    "mensal-colchao": QUERY_EF_MENSAL_COLCHAO,
    "diaria-colchao-vencimento": QUERY_EF_DIARIA_COLCHAO_VENCIMENTO,
    "mensal-colchao-vencimento": QUERY_EF_MENSAL_COLCHAO_VENCIMENTO,
    "mensal-agente-primeira": QUERY_EF_MENSAL_AGENTE_PRIMEIRA,
    "mensal-agente-colchao": QUERY_EF_MENSAL_AGENTE_COLCHAO,
    "mensal-agente-colchao-vencimento": QUERY_EF_MENSAL_AGENTE_COLCHAO_VENCIMENTO,
}

_EFETIVIDADE_STORE: Dict[str, List[Dict[str, Any]]] = {}
_EFETIVIDADE_LOCK = threading.Lock()
EFETIVIDADE_ETL_TTL_SECONDS = int(os.getenv("EFETIVIDADE_ETL_TTL", "3600"))
_EFETIVIDADE_LAST_RUN: Optional[float] = None
_EFETIVIDADE_ETL_THREAD_STARTED = False


def _efetividade_etl_run() -> None:
    global _EFETIVIDADE_LAST_RUN
    conn_db = ALLOWED_DATABASES[0]
    results: Dict[str, List[Dict[str, Any]]] = {}
    for key, query in _EF_QUERY_MAP.items():
        try:
            rows = run_query(query, conn_db, context=f"efetividade-etl/{key}")
            results[key] = rows
        except Exception as exc:
            _agent_ndjson("OBS", f"main.py:efetividade_etl:{key}", "etl_error", {"error": str(exc)})
    with _EFETIVIDADE_LOCK:
        _EFETIVIDADE_STORE.update(results)
        _EFETIVIDADE_LAST_RUN = time.time()


def _efetividade_etl_loop() -> None:
    _efetividade_etl_run()
    while True:
        time.sleep(EFETIVIDADE_ETL_TTL_SECONDS)
        _efetividade_etl_run()


def _start_efetividade_etl() -> None:
    global _EFETIVIDADE_ETL_THREAD_STARTED
    if _EFETIVIDADE_ETL_THREAD_STARTED:
        return
    worker = threading.Thread(
        target=_efetividade_etl_loop,
        name="efetividade-etl",
        daemon=True,
    )
    worker.start()
    _EFETIVIDADE_ETL_THREAD_STARTED = True


def _get_efetividade(key: str) -> Dict[str, Any]:
    with _EFETIVIDADE_LOCK:
        rows = _EFETIVIDADE_STORE.get(key)
        last_run = _EFETIVIDADE_LAST_RUN
    if rows is None:
        raise HTTPException(status_code=503, detail="ETL ainda não concluído. Tente novamente em instantes.")
    return build_response_envelope(
        rows,
        ALLOWED_DATABASES,
        filters={"period": "2026+"},
        quality={"last_etl_run": datetime.fromtimestamp(last_run, tz=timezone.utc).isoformat() if last_run else None},
    )


@app.get("/efetividade/diaria-primeira")
def get_ef_diaria_primeira() -> Dict[str, Any]:
    return _get_efetividade("diaria-primeira")


@app.get("/efetividade/mensal-primeira")
def get_ef_mensal_primeira() -> Dict[str, Any]:
    return _get_efetividade("mensal-primeira")


@app.get("/efetividade/diaria-colchao")
def get_ef_diaria_colchao() -> Dict[str, Any]:
    return _get_efetividade("diaria-colchao")


@app.get("/efetividade/mensal-colchao")
def get_ef_mensal_colchao() -> Dict[str, Any]:
    return _get_efetividade("mensal-colchao")


@app.get("/efetividade/mensal-agente-primeira")
def get_ef_mensal_agente_primeira() -> Dict[str, Any]:
    return _get_efetividade("mensal-agente-primeira")


@app.get("/efetividade/mensal-agente-colchao")
def get_ef_mensal_agente_colchao() -> Dict[str, Any]:
    return _get_efetividade("mensal-agente-colchao")


@app.get("/efetividade/mensal-agente-colchao-vencimento")
def get_ef_mensal_agente_colchao_vencimento() -> Dict[str, Any]:
    return _get_efetividade("mensal-agente-colchao-vencimento")


@app.get("/efetividade/diaria-colchao-vencimento")
def get_ef_diaria_colchao_vencimento() -> Dict[str, Any]:
    return _get_efetividade("diaria-colchao-vencimento")


@app.get("/efetividade/mensal-colchao-vencimento")
def get_ef_mensal_colchao_vencimento() -> Dict[str, Any]:
    return _get_efetividade("mensal-colchao-vencimento")


# ─────────────────────────────────────────────────────────────────
# HEALTHCHECKS E SPA FALLBACK
# ─────────────────────────────────────────────────────────────────
@app.get("/health/db")
def healthcheck_db() -> Dict[str, str]:
    database_name = "COBwebRCBAUTOS"
    try:
        rows = run_query("SELECT 1 AS ok", database_name)
        if rows and rows[0].get("ok") == 1:
            return {"status": "ok", "database": database_name, "connection": "connected"}
        raise HTTPException(status_code=500, detail="Conexão com o banco sem retorno esperado.")
    except HTTPException as exc:
        _agent_ndjson(
            "OBS",
            "main.py:healthcheck_db:error",
            "healthcheck_error",
            {"database": database_name, "error": str(exc.detail)},
        )
        raise HTTPException(
            status_code=500,
            detail="Falha no healthcheck do banco.",
        ) from exc


@app.get("/health/db/{database_name}")
def healthcheck_db_por_banco(database_name: str) -> Dict[str, str]:
    database_name = validate_database(database_name)
    try:
        rows = run_query("SELECT 1 AS ok", database_name)
        if rows and rows[0].get("ok") == 1:
            return {"status": "ok", "database": database_name, "connection": "connected"}
        raise HTTPException(status_code=500, detail="Conexão com o banco sem retorno esperado.")
    except HTTPException as exc:
        _agent_ndjson(
            "OBS",
            "main.py:healthcheck_db_por_banco:error",
            "healthcheck_error",
            {"database": database_name, "error": str(exc.detail)},
        )
        raise HTTPException(
            status_code=500,
            detail="Falha no healthcheck do banco.",
        ) from exc


# ─────────────────────────────────────────────────────────────────
# ADMIN: INDICES RECOMENDADOS
# Referencia: agecob-lens/docs/sql-indexes-recommendations.sql
# Os endpoints abaixo so respondem com ENABLE_INDEX_ADMIN=true no .env;
# mesmo assim, /apply continua com dry_run=true por padrao e exige ?dry_run=false
# explicito para efetivamente rodar CREATE INDEX.
# ─────────────────────────────────────────────────────────────────
@app.get("/admin/indexes/status/{database_name}")
def admin_indexes_status(database_name: str, request: Request) -> Dict[str, Any]:
    _require_auth(request)
    _ensure_index_admin_allowed()
    database_name = validate_database(database_name)
    try:
        indexes = _list_index_status(database_name)
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "main.py:admin_indexes_status:error",
            "admin_indexes_status_error",
            {"database": database_name, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="Erro ao inspecionar indices.") from exc

    total = len(indexes)
    existing = sum(1 for i in indexes if i["exists"])
    return {
        "database": database_name,
        "total_recommended": total,
        "existing": existing,
        "missing": total - existing,
        "indexes": indexes,
    }


@app.post("/admin/indexes/apply/{database_name}")
def admin_indexes_apply(
    database_name: str,
    request: Request,
    dry_run: bool = Query(True, description="Quando true (padrao), apenas retorna o SQL que seria executado."),
    online: bool = Query(False, description="Tenta ONLINE = ON (requer SQL Server Enterprise)."),
    update_statistics: bool = Query(False, description="Roda UPDATE STATISTICS WITH FULLSCAN para as tabelas afetadas."),
) -> Dict[str, Any]:
    _require_auth(request)
    _ensure_index_admin_allowed()
    database_name = validate_database(database_name)
    _agent_ndjson(
        "H1",
        "main.py:admin_indexes_apply:start",
        "admin_indexes_apply_start",
        {
            "database": database_name,
            "dry_run": dry_run,
            "online": online,
            "update_statistics": update_statistics,
        },
    )
    try:
        result = _apply_indexes_on_database(
            database_name,
            online=online,
            dry_run=dry_run,
            update_statistics=update_statistics,
        )
    except HTTPException:
        raise
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "main.py:admin_indexes_apply:error",
            "admin_indexes_apply_error",
            {"database": database_name, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="Erro ao aplicar indices.") from exc

    _agent_ndjson(
        "H1",
        "main.py:admin_indexes_apply:end",
        "admin_indexes_apply_end",
        {
            "database": database_name,
            "dry_run": dry_run,
            "online": online,
            "update_statistics": update_statistics,
            "elapsed_ms": result.get("elapsed_ms"),
            "created": sum(1 for s in result.get("indexes", []) if s.get("action") == "created"),
            "failed": sum(1 for s in result.get("indexes", []) if s.get("action") == "failed"),
        },
    )
    return result


@app.get("/")
def healthcheck() -> Dict[str, str]:
    index_path = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "ok", "docs": "/docs"}


if os.path.isdir(FRONTEND_ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS_DIR), name="assets")


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    # Só entrega SPA quando existir build; endpoints de API continuam com suas rotas próprias.
    index_path = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Not Found")
    if full_path.startswith(("dashboard/", "health/", "admin/", "efetividade/", "docs", "redoc", "openapi.json", "api/")):
        raise HTTPException(status_code=404, detail="Not Found")
    static_file = os.path.join(FRONTEND_DIST_DIR, full_path)
    if full_path and os.path.isfile(static_file):
        return FileResponse(static_file)
    return FileResponse(index_path)


@app.on_event("startup")
async def _agent_debug_startup() -> None:
    _start_agent_log_cleanup_worker()
    _start_efetividade_etl()
    # region agent log
    _agent_ndjson(
        "H1",
        "main.py:startup",
        "worker_started",
        {
            "api_key_len": len(API_KEY),
            "token_len": len(API_TOKEN),
            "log_cleanup_interval_seconds": LOG_CLEANUP_INTERVAL_SECONDS,
            "require_api_auth": REQUIRE_API_AUTH,
            "agent_telemetry_enabled": ENABLE_AGENT_TELEMETRY,
        },
    )
    # endregion


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)