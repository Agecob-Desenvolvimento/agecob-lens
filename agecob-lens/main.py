import json
import os
import time
import threading
from datetime import date, datetime, timezone
from collections import deque
from typing import Any, Dict, List, Optional, Tuple
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

# ─────────────────────────────────────────────────────────────────
# AUTH / RATE LIMIT / LOGS
# ─────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST_DIR = os.path.join(BASE_DIR, "dist")
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
WITH CTE_Total_Acordo AS (
    -- Soma todas as parcelas para achar o valor total do acordo
    SELECT
        NR_RECEBIMENTO,
        SUM(VALOR) AS VALOR_TOTAL_ACORDO
    FROM REC_MASTER (NOLOCK)
    GROUP BY NR_RECEBIMENTO
),
CTE_Saldo_Divida AS (
    -- Busca o saldo atualizado (VR_SALDO) das dívidas que entraram nessa negociação
    SELECT
        RD.NR_RECEBIMENTO,
        SUM(ISNULL(DM.VR_SALDO, 0)) AS SALDO_ATUALIZADO_DIVIDA
    FROM REC_DIVIDAS RD (NOLOCK)
    JOIN DIV_MASTER DM (NOLOCK) ON RD.ID_DIVIDA = DM.ID_DIVIDA
    GROUP BY RD.NR_RECEBIMENTO
)
SELECT
    -- 1. DADOS DO AGENTE
    U.CHAVE AS agente,

    -- 2. DADOS DO DEVEDOR
    DEV.CPF_CNPJ AS cpf_cnpj,
    DEV.NOME_RAZAO AS nome_razao,

    -- 3. DADOS FINANCEIROS TOTAIS E DESCONTO
    ISNULL(SD.SALDO_ATUALIZADO_DIVIDA, 0) AS valor_atualizado_divida,
    ISNULL(TA.VALOR_TOTAL_ACORDO, 0) AS valor_total_acordo,

    -- Matemática do Desconto: Saldo da Dívida MENOS o Valor Fechado no Acordo
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
WHERE CAST(RM.DT_EMISSAO AS DATE) = ?
  {FILTRO_AGENTES_EXCLUIDOS_SQL}
ORDER BY RM.DT_EMISSAO DESC, RM.NR_RECEBIMENTO, RM.PARCELA
"""


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
)
SELECT
    U.CHAVE,
    U.NOME,
    COUNT(DISTINCT CM.ID_CTO_MASTER) AS qtd_acionamentos,
    COUNT(DISTINCT CASE WHEN CM.ID_COMPLEMENTO IN {CPC_IDS_SQL} THEN CM.ID_CTO_MASTER END) AS qtd_contatos,
    CAST(
        CEILING(
            COUNT(DISTINCT CASE WHEN CM.ID_COMPLEMENTO IN {CPC_IDS_SQL} THEN CM.ID_CTO_MASTER END) * 10000.0
        / NULLIF(COUNT(DISTINCT CM.ID_CTO_MASTER), 0)
        ) / 100.0
    AS DECIMAL(5,2)) AS cpc_percentual,
    COUNT(DISTINCT CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_acordos,
    CAST(
        COUNT(DISTINCT CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.NR_RECEBIMENTO END) * 100.0
        / NULLIF(COUNT(DISTINCT CM.ID_CTO_MASTER), 0)
    AS DECIMAL(5,2)) AS acordos_percentual,
    SUM(DISTINCT CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_acordos,
    AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_TOTAL_ACORDO END) AS acordo_medio,
    AVG(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN CAST(A.PLANO AS DECIMAL(10,2)) END) AS parcelamento_medio,
    AVG(CASE
        WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} AND S.VR_ORIGINAL > 0
        THEN A.VALOR_TOTAL_ACORDO / S.VR_ORIGINAL * 100
    END) AS desconto_medio_percentual,
    SUM(CASE WHEN A.ID_REC_STATUS IN {STATUS_APROVADOS_SQL} THEN A.VALOR_P1 ELSE 0 END) AS valor_primeira_parcela,
    COUNT(DISTINCT CASE WHEN A.ID_REC_STATUS IN {STATUS_EXCECAO_SQL} THEN A.NR_RECEBIMENTO END) AS qtd_excecoes,
    SUM(DISTINCT CASE WHEN A.ID_REC_STATUS IN {STATUS_EXCECAO_SQL} THEN A.VALOR_TOTAL_ACORDO ELSE 0 END) AS valor_excecoes
FROM CTO_MASTER CM (NOLOCK)
JOIN USU_MASTER U (NOLOCK)
    ON CM.ID_USUARIO = U.ID_USUARIO
LEFT JOIN CTE_Acordos A
    ON CM.ID_USUARIO = A.ID_USUARIO
LEFT JOIN CTE_Saldo_Original S
    ON A.NR_RECEBIMENTO = S.NR_RECEBIMENTO
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
    CAST(CEILING(ISNULL(E.qtd_contatos, 0) * 10000.0 / NULLIF(E.qtd_acionamentos, 0)) / 100.0 AS DECIMAL(18,2)) AS cpc_percentual,
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
    requires_auth = path.startswith("/dashboard/") or path.startswith("/health/")
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


def get_connection(database_name: str) -> pyodbc.Connection:
    """
    Cria conexão com SQL Server usando autenticação SQL (usuário/senha).
    """
    driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")
    server = (os.getenv("DB_SERVER") or "").strip()
    database = database_name
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
        f"DATABASE={database};"
        f"UID={username};"
        f"PWD={password};"
        "TrustServerCertificate=yes;"
    )

    try:
        return pyodbc.connect(conn_str, timeout=10)
    except pyodbc.Error as exc:
        _agent_ndjson(
            "OBS",
            "main.py:get_connection:error",
            "db_connect_error",
            {"database": database_name, "error": str(exc)},
        )
        raise HTTPException(
            status_code=500,
            detail="Erro ao conectar no banco de dados.",
        ) from exc


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
) -> Dict[str, Any]:
    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_rows": len(rows),
            "sources": sources,
            "filters": filters or {"date": "today"},
            "run_id": run_id,
            "quality": quality or {},
        },
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
                normalized[field] = float(value) if value is not None else 0.0
            except (TypeError, ValueError):
                numeric_cast_failures += 1
                normalized[field] = 0.0
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
def get_dashboard_acordos_hoje() -> Dict[str, Any]:
    database_name = "COBwebRCBAUTOS"
    rows = run_query(QUERY_ACORDOS_HOJE, database_name, (date.today(),))
    print_rows_preview(rows, database_name, max_rows=5)
    return build_response_envelope(rows, [database_name])


@app.get("/dashboard/acordos-hoje/todos")
def get_dashboard_acordos_hoje_todos() -> Dict[str, Any]:
    all_rows: List[Dict[str, Any]] = []
    today = date.today()
    for database_name in ALLOWED_DATABASES:
        rows = run_query(QUERY_ACORDOS_HOJE, database_name, (today,))
        print_rows_preview(rows, database_name, max_rows=5)
        for row in rows:
            row["banco_origem"] = database_name
        all_rows.extend(rows)
    return build_response_envelope(all_rows, ALLOWED_DATABASES)


@app.get("/dashboard/acordos-hoje/{database_name}")
def get_dashboard_acordos_hoje_por_banco(database_name: str) -> Dict[str, Any]:
    database_name = validate_database(database_name)
    rows = run_query(QUERY_ACORDOS_HOJE, database_name, (date.today(),))
    print_rows_preview(rows, database_name, max_rows=5)
    return build_response_envelope(rows, [database_name])


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


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS: GRÁFICOS E CARDS
# ─────────────────────────────────────────────────────────────────
def _run_dashboard_chart(
    db: str,
    query_builder,
    context: str,
    request: Optional[Request],
) -> Dict[str, Any]:
    """Helper central que executa qualquer builder de gráfico/card."""
    run_id = getattr(request.state, "run_id", f"srv-{uuid4().hex[:12]}") if request else f"srv-{uuid4().hex[:12]}"
    validated_db = validate_database_or_todos(db)
    query = query_builder(validated_db)
    conn_db = ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    rows = run_query(query, conn_db, run_id=run_id, context=context)
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
    if full_path.startswith(("dashboard/", "health/", "docs", "redoc", "openapi.json", "api/")):
        raise HTTPException(status_code=404, detail="Not Found")
    static_file = os.path.join(FRONTEND_DIST_DIR, full_path)
    if full_path and os.path.isfile(static_file):
        return FileResponse(static_file)
    return FileResponse(index_path)


@app.on_event("startup")
async def _agent_debug_startup() -> None:
    _start_agent_log_cleanup_worker()
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