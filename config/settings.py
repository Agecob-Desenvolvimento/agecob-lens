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
STATUS_QUEBRA_AUTOMATICA: Tuple[int, ...] = (10,)
# "Valores gerados": um acordo firmado hoje conta no valor gerado mesmo que depois
# quebre (QUEBRA=2) ou seja cancelado por estouro de carência (QUEBRA AUTOMÁTICA=10).
# Base de valor_acordos, 1ª parcela, qtd_acordos, ticket e boletos (conversão/
# efetividade). Derivado — não inferir literais.
STATUS_GERADOS: Tuple[int, ...] = tuple(sorted(set(
    STATUS_APROVADOS + STATUS_QUEBRADO + STATUS_QUEBRA_AUTOMATICA
)))  # (1, 2, 3, 10, 12)
# Pré-filtro das CTEs de agregação: gerados + exceção (quebras precisam sobreviver
# ao pré-filtro p/ entrar nas métricas de geração).
STATUS_UNIVERSO_ACORDOS: Tuple[int, ...] = tuple(sorted(set(
    STATUS_GERADOS + STATUS_EXCECAO
)))  # (1, 2, 3, 5, 10, 12)
# Cluster A (portfolio-rollup): união exata dos conjuntos de status por-portfólio.
# Derivado dos constantes existentes — não inferir literais. Ordenado p/ leitura.
STATUS_PORTFOLIO_ROLLUP: Tuple[int, ...] = tuple(sorted(set(
    STATUS_APROVADOS + STATUS_EXCECAO + STATUS_REJEITADO + STATUS_QUEBRADO + STATUS_QUEBRA_AUTOMATICA
)))  # (1, 2, 3, 5, 7, 10, 12)

PRIMEIRA_PARCELA: int = 0
PORTFOLIO_COLUMN: str = "CAMPO010"

# Códigos de complemento (COD_COMPLEMENTO) que contam como CPC / RPC (Contato
# com a Pessoa Certa). ADR-006: gerenciado manualmente pelo cientista de dados.
# Curado a partir do catálogo CTO_COMPLEMENTO: apenas desfechos de voz onde o
# agente efetivamente falou com o titular (ALO=1, CONTATO=1). Exclui
# automáticos (disparo whatsapp, envio boleto), ligação interrompida/ruim,
# recado com terceiro, transferência e status de workflow/jurídico.
# Chave por COD_COMPLEMENTO (varchar, código de negócio), não por ID_COMPLEMENTO
# (surrogate key): o catálogo CTO_COMPLEMENTO foi resseedado em 2026-07-10,
# renumerando os IDs e órfãos a lista antiga (95,105,108,109,110,111,229,230,
# 231,233) — zerava qtd_contatos em produção. COD_COMPLEMENTO é estável entre
# reloads do catálogo; ID_COMPLEMENTO não é.
CPC_COMPLEMENTO_CODS: Tuple[str, ...] = ("449", "452", "453", "454", "455", "459", "572")

RECOMMENDED_INDEXES: List[Dict[str, Any]] = [
    {
        "name": "IX_REC_MASTER_DT_EMISSAO",
        "schema": "dbo",
        "table": "REC_MASTER",
        "key_columns": ["DT_EMISSAO"],
        "include_columns": [
            "NR_RECEBIMENTO", "ID_USUARIO", "ID_DEV", "ID_REC_STATUS",
            "PARCELA", "PLANO", "VALOR", "DT_VENCIMENTO", "DT_PAGAMENTO",
            "VR_PAGO",
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
        # Todas as queries filtram CTO_MASTER.DATA — o antigo IX_CTO_MASTER_DT_CONTATO
        # (key DT_CONTATO) nunca era usado e deixava todo KPI de esforço em table scan.
        # Se o antigo existir em prod, DBA deve dropar. ID_DEV no INCLUDE: dedupe
        # COUNT(DISTINCT ID_DEV) sem key lookup.
        "name": "IX_CTO_MASTER_DATA",
        "schema": "dbo",
        "table": "CTO_MASTER",
        "key_columns": ["DATA"],
        "include_columns": ["ID_USUARIO", "ID_COMPLEMENTO", "ID_DEV", "ID_CTO_MASTER"],
        "purpose": "Acionamentos do dia (produtividade, comparacao, benchmarks).",
    },
    {
        "name": "IX_USU_MASTER_ID_USUARIO",
        "schema": "dbo",
        "table": "USU_MASTER",
        "key_columns": ["ID_USUARIO"],
        "include_columns": ["NOME", "CHAVE"],
        "purpose": "Join por ID_USUARIO + filtro de exclusao em NOME/CHAVE.",
    },
    {
        "name": "IX_REC_MASTER_DT_VENCIMENTO_COV",
        "schema": "dbo",
        "table": "REC_MASTER",
        "key_columns": ["DT_VENCIMENTO"],
        "include_columns": [
            "ID_REC_STATUS", "PARCELA", "VALOR", "VR_PAGO",
            "DT_PAGAMENTO", "ID_USUARIO", "NR_RECEBIMENTO", "ID_CARTEIRA",
            "DT_EMISSAO",
        ],
        "purpose": "Efetividade/conversao: boleto pago no prazo, curva de quebra, boletos-detalhe.",
    },
    {
        "name": "IX_REC_MASTER_DT_PAGAMENTO_COV",
        "schema": "dbo",
        "table": "REC_MASTER",
        "key_columns": ["DT_PAGAMENTO"],
        "include_columns": [
            "ID_REC_STATUS", "PARCELA", "VALOR", "VR_PAGO",
            "DT_VENCIMENTO", "ID_USUARIO", "NR_RECEBIMENTO", "ID_CARTEIRA",
        ],
        "purpose": "Valor recebido no dia / colchao.",
    },
    {
        "name": "IX_DIV_MASTER_ID_DIVIDA",
        "schema": "dbo",
        "table": "DIV_MASTER",
        "key_columns": ["ID_DIVIDA"],
        "include_columns": ["VR_SALDO", "DT_VENCIMENTO"],
        "purpose": "Saldo original / calculo de desconto via REC_DIVIDAS.",
    },
    {
        "name": "IX_REC_DIVIDAS_NR_CARTEIRA",
        "schema": "dbo",
        "table": "REC_DIVIDAS",
        "key_columns": ["NR_RECEBIMENTO", "ID_CARTEIRA"],
        "include_columns": ["ID_DIVIDA"],
        "purpose": "Join com portfolio (chave composta usada no CROSS APPLY real).",
    },
]

INDEX_DEFAULT_OPTIONS: Dict[str, Any] = {"FILLFACTOR": 90, "DATA_COMPRESSION": "PAGE"}


# ── SQL helpers ──
def _sql_in(values: Tuple[int, ...]) -> str:
    return "(" + ", ".join(str(v) for v in values) + ")"


def _sql_in_str(values: Tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


STATUS_APROVADOS_SQL: str = _sql_in(STATUS_APROVADOS)
STATUS_EXCECAO_SQL: str = _sql_in(STATUS_EXCECAO)
STATUS_REJEITADO_SQL: str = _sql_in(STATUS_REJEITADO)
STATUS_QUEBRADO_SQL: str = _sql_in(STATUS_QUEBRADO)
STATUS_GERADOS_SQL: str = _sql_in(STATUS_GERADOS)
STATUS_UNIVERSO_SQL: str = _sql_in(STATUS_UNIVERSO_ACORDOS)
STATUS_PORTFOLIO_ROLLUP_SQL: str = _sql_in(STATUS_PORTFOLIO_ROLLUP)
CPC_CODS_SQL: str = _sql_in_str(CPC_COMPLEMENTO_CODS)

# Boleto pago no prazo (5 dias após vencimento) — base da Conversão (pagos/emitidos)
BOLETO_PAGO_PRAZO_SQL: str = (
    "CASE WHEN VR_PAGO > 0 "
    "AND DT_PAGAMENTO <= DATEADD(DAY, 5, DT_VENCIMENTO) "
    "THEN 1 ELSE 0 END"
)

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

# Piso histórico das séries de efetividade (formato YYYYMMDD, comparação
# sargável — nunca envolver a coluna em YEAR()).
EFETIVIDADE_DATA_MINIMA: str = "20260101"

# Filtro de agentes da EFETIVIDADE — diverge do FILTRO_AGENTES_EXCLUIDOS_SQL de
# propósito: match por substring (não prefixo/exato) e exclui também SERASA e
# NEMBUS. Unificar os dois muda os números da página Efetividade — decisão de
# negócio pendente.
FILTRO_AGENTES_EFETIVIDADE_SQL: str = (
    "AND UPPER(U.CHAVE) NOT LIKE '%SERASA%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%COBDESANTOS%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%NEMBUS%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%ANTLIA%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%SUPORTE%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%INTERNA%' "
    "AND UPPER(U.CHAVE) NOT LIKE '%SISTEMA%' "
    "AND UPPER(U.NOME) NOT LIKE '%COBDESANTOS%' "
    "AND UPPER(U.NOME) NOT LIKE '%NEMBUSUSER%'"
)

# Curva de quebra: aprovados + quebra manual. Status 10 (QUEBRA AUTOMÁTICA) fora
# por decisão pendente — incluir mudaria taxa_quebra (hoje subconta auto-quebras).
STATUS_CURVA_QUEBRA_SQL: str = _sql_in(tuple(sorted(set(
    STATUS_APROVADOS + STATUS_QUEBRADO
))))  # (1, 2, 3, 12)

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

# Sentry (erros + performance) — vazio desliga
SENTRY_DSN: str = (os.getenv("SENTRY_DSN") or "").strip()
SENTRY_TRACES_SAMPLE_RATE: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE") or "0.1")
SENTRY_ENABLE_LOGS: bool = (os.getenv("SENTRY_ENABLE_LOGS") or "true").strip().lower() == "true"

# ─────────────────────────────────────────────────────────────────
# AGENTE DE CHAT (/agente/chat)
# ─────────────────────────────────────────────────────────────────
# Provedores: "anthropic" (Claude) ou "deepseek" (API compatível com OpenAI).
# Requer a chave do provedor ativo e saída HTTPS para a API correspondente.
ENABLE_AGENT_CHAT: bool = (os.getenv("ENABLE_AGENT_CHAT") or "false").strip().lower() == "true"
AGENT_PROVIDER: str = (os.getenv("AGENT_PROVIDER") or "anthropic").strip().lower()
ANTHROPIC_API_KEY: str = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
DEEPSEEK_API_KEY: str = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
DEEPSEEK_BASE_URL: str = (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").strip()
_AGENT_DEFAULT_MODELS: Dict[str, str] = {"anthropic": "claude-sonnet-4-6", "deepseek": "deepseek-chat"}
AGENT_MODEL: str = (os.getenv("AGENT_MODEL") or _AGENT_DEFAULT_MODELS.get(AGENT_PROVIDER, "claude-sonnet-4-6")).strip()
AGENT_MAX_TOOL_ITERS: int = max(1, int(os.getenv("AGENT_MAX_TOOL_ITERS", "4")))

# Limiares do risco composto da visão de carteiras (% sobre 1ª parcela dos
# gerados) — espelham os thresholds do frontend (PortfolioSection/Handoff).
RISK_LEVEL_LOW_MAX: float = 25.0   # <= 25 → baixo
RISK_LEVEL_MID_MAX: float = 50.0   # <= 50 → medio; acima → alto

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
