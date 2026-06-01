import os
from typing import Any, Dict, List, Tuple

# ─────────────────────────────────────────────────────────────────
# LOAD .env FILE FIRST
# ─────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE_PATH = os.path.join(BASE_DIR, ".env")


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


APP_ENV: str = (os.getenv("APP_ENV") or "local").strip()
ENV_SPECIFIC_FILE_PATH = os.path.join(BASE_DIR, f".env.{APP_ENV}")
_load_env_file(ENV_SPECIFIC_FILE_PATH)
_load_env_file(ENV_FILE_PATH)

# ─────────────────────────────────────────────────────────────────
# CONSTANTES DE CONFIGURAÇÃO E REGRAS DE NEGÓCIO
# ─────────────────────────────────────────────────────────────────
ALLOWED_DATABASES: List[str] = [
    "COBwebRCBAUTOS",
    "COBwebRCBCONSUMER",
]
ALLOWED_DATABASES_MAP: Dict[str, str] = {name.lower(): name for name in ALLOWED_DATABASES}
EXCLUDED_AGENT_EXACT_NAMES: Tuple[str, ...] = ("COBDESANTOS", "NEMBUSUSER")
EXCLUDED_AGENT_PREFIXES: Tuple[str, ...] = ("ANTLIA", "INTERNA")

STATUS_APROVADOS: Tuple[int, ...] = (1, 3, 12)
STATUS_EXCECAO: Tuple[int, ...] = (5,)
STATUS_REJEITADO: Tuple[int, ...] = (7,)
STATUS_QUEBRADO: Tuple[int, ...] = (2,)
STATUS_UNIVERSO_ACORDOS: Tuple[int, ...] = STATUS_APROVADOS + STATUS_EXCECAO  # (1, 3, 5, 12)

PRIMEIRA_PARCELA: int = 0
PORTFOLIO_COLUMN: str = "CAMPO010"

# IDs de complementos que contam como CPC / RPC (Contato com a Pessoa Certa).
# ADR-006: gerenciado manualmente pelo cientista de dados.
# Curado a partir do catálogo CTO_COMPLEMENTO: apenas desfechos de voz onde o
# agente efetivamente falou com o titular (CONTATO=1, RECADO=0). Exclui
# automáticos (disparo whatsapp, envio boleto), ligação interrompida/ruim,
# recado com terceiro, transferência e status de workflow/jurídico.
CPC_COMPLEMENTO_IDS: Tuple[int, ...] = (95, 105, 108, 109, 110, 111, 229, 230, 231, 233)

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

INDEX_DEFAULT_OPTIONS: Dict[str, Any] = {"FILLFACTOR": 90, "DATA_COMPRESSION": "PAGE"}


# ── SQL helpers ──
def _sql_in(values: Tuple[int, ...]) -> str:
    return "(" + ", ".join(str(v) for v in values) + ")"


STATUS_APROVADOS_SQL: str = _sql_in(STATUS_APROVADOS)
STATUS_EXCECAO_SQL: str = _sql_in(STATUS_EXCECAO)
STATUS_REJEITADO_SQL: str = _sql_in(STATUS_REJEITADO)
STATUS_QUEBRADO_SQL: str = _sql_in(STATUS_QUEBRADO)
STATUS_UNIVERSO_SQL: str = _sql_in(STATUS_UNIVERSO_ACORDOS)
CPC_IDS_SQL: str = _sql_in(CPC_COMPLEMENTO_IDS)

FILTRO_AGENTES_EXCLUIDOS_SQL: str = """
    AND UPPER(LTRIM(RTRIM(U.NOME))) <> 'COBDESANTOS'
    AND UPPER(LTRIM(RTRIM(U.NOME))) <> 'FT5SYSTEM'
    AND UPPER(LTRIM(RTRIM(U.NOME))) <> 'NEMBUSUSER'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) <> 'NEMBUSUSER'
    AND UPPER(LTRIM(RTRIM(U.NOME))) NOT LIKE 'ANTLIA%'
    AND UPPER(LTRIM(RTRIM(U.NOME))) NOT LIKE 'INTERNA%'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'INTERNA%'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'SUPORTE%'
    AND UPPER(LTRIM(RTRIM(U.CHAVE))) NOT LIKE 'SISTEMA%'
"""

# ─────────────────────────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────────────────────────
FRONTEND_DIST_DIR: str = os.path.join(BASE_DIR, "agecob-lens", "dist")
FRONTEND_ASSETS_DIR: str = os.path.join(FRONTEND_DIST_DIR, "assets")
LOG_DIR: str = os.path.join(BASE_DIR, "logs")
_AGENT_LOG_PATH: str = os.path.join(LOG_DIR, "agent-debug.log")

# ─────────────────────────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────────────────────────


def _parse_cors_origins(raw_value: str) -> List[str]:
    origins = [item.strip() for item in (raw_value or "").split(",") if item.strip()]
    return origins or ["http://127.0.0.1:5173", "http://localhost:5173"]


_CORS_ORIGINS: List[str] = _parse_cors_origins(
    os.getenv("CORS_ALLOW_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")
)
_CORS_ALLOW_CREDENTIALS: bool = (os.getenv("CORS_ALLOW_CREDENTIALS") or "false").strip().lower() == "true"
if "*" in _CORS_ORIGINS:
    _CORS_ALLOW_CREDENTIALS = False

# ─────────────────────────────────────────────────────────────────
# AUTH / RATE LIMIT / FEATURE FLAGS
# ─────────────────────────────────────────────────────────────────
API_KEY: str = (os.getenv("API_KEY") or "").strip()
API_TOKEN: str = (os.getenv("API_TOKEN") or "").strip()
REQUIRE_API_AUTH: bool = (os.getenv("REQUIRE_API_AUTH") or "false").strip().lower() == "true"
RATE_LIMIT_REQUESTS: int = 75
RATE_LIMIT_WINDOW_SECONDS: int = 60
LOG_CLEANUP_INTERVAL_SECONDS: int = 5 * 60 * 60
ENABLE_VALIDATED_ROUTES: bool = (os.getenv("ENABLE_VALIDATED_ROUTES") or "true").strip().lower() == "true"
ENABLE_AGENT_TELEMETRY: bool = (os.getenv("ENABLE_AGENT_TELEMETRY") or "false").strip().lower() == "true"
ENABLE_INDEX_ADMIN: bool = (os.getenv("ENABLE_INDEX_ADMIN") or "false").strip().lower() == "true"

# ─────────────────────────────────────────────────────────────────
# DATABASE POOL
# ─────────────────────────────────────────────────────────────────
CACHE_TTL_SECONDS: float = float(os.getenv("DASHBOARD_CACHE_TTL", "60"))
_DB_POOL_SIZE: int = max(1, int(os.getenv("DB_POOL_SIZE", "6")))
_DB_POOL_ACQUIRE_TIMEOUT: float = float(os.getenv("DB_POOL_TIMEOUT", "10"))
_DB_POOL_MAX_AGE_SECONDS: float = float(os.getenv("DB_POOL_MAX_AGE_SECONDS", "1800"))
EFETIVIDADE_ETL_TTL_SECONDS: int = int(os.getenv("EFETIVIDADE_ETL_TTL", "3600"))

# ─────────────────────────────────────────────────────────────────
# PRODUTIVIDADE / ACORDOS CONSTANTS
# ─────────────────────────────────────────────────────────────────
_PRODUTIVIDADE_AGENTES_TTL_SECONDS: int = 60

ACORDOS_HOJE_DEFAULT_LIMIT: int = 500
ACORDOS_HOJE_MAX_LIMIT: int = 5000

PRODUCTIVITY_REQUIRED_FIELDS: List[str] = [
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
