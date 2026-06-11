"""
Fase do plano de pagamento por acordo, para o agente de chat (/agente/chat).

Base: acordos APROVADOS (1ª parcela com status 1, 3, 12) emitidos nos últimos
FASE_JANELA_DIAS dias até a data de referência — fase de plano é sobre a base
viva de acordos, não sobre a janela do dashboard. A fase deriva do progresso
de pagamento das parcelas do acordo (VR_PAGO > 0 = parcela paga):

    quitado → todas as parcelas pagas
    inicio  → até 1 parcela paga
    final   → 2 ou menos parcelas restantes
    meio    → demais

`valor_aberto` = soma do VALOR das parcelas ainda não pagas do acordo.
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import config.settings as settings
from core.cache.cache_manager import cache_manager
from core.database.query_executor import run_query
from core.utils.validation import validate_database_or_todos
from dominios.graficos.queries import wrap_todos_or_single

FASE_JANELA_DIAS = 183  # ~6 meses de acordos emitidos
FASES: Tuple[str, ...] = ("inicio", "meio", "final", "quitado")
_TOP_CARTEIRAS_POR_FASE = 15


def build_fases_query(db: str, date_from: str, date_to_exclusive: str) -> str:
    """
    Uma linha por (portfólio, fase): qtd de acordos e valor em aberto. A
    classificação de fase acontece no SQL para não trafegar a base inteira;
    resolução de portfólio e filtros idênticos ao rollup consolidado.
    """
    def _base(database: str) -> str:
        return f"""
            SELECT sub.portfolio_name, sub.fase, COUNT(*) AS qtd, SUM(sub.valor_aberto) AS valor_aberto
            FROM (
                SELECT
                    DA.{settings.PORTFOLIO_COLUMN} AS portfolio_name,
                    CASE
                        WHEN P.parcelas_pagas >= P.total_parcelas THEN 'quitado'
                        WHEN P.parcelas_pagas <= 1 THEN 'inicio'
                        WHEN P.total_parcelas - P.parcelas_pagas <= 2 THEN 'final'
                        ELSE 'meio'
                    END AS fase,
                    P.valor_aberto
                FROM {database}.dbo.REC_MASTER R (NOLOCK)
                JOIN {database}.dbo.USU_MASTER U (NOLOCK) ON R.ID_USUARIO = U.ID_USUARIO
                CROSS APPLY (
                    SELECT TOP 1 DA2.{settings.PORTFOLIO_COLUMN}
                    FROM {database}.dbo.REC_DIVIDAS RD (NOLOCK)
                    JOIN {database}.dbo.DIV_AUX DA2 (NOLOCK) ON RD.ID_DIVIDA = DA2.ID_DIVIDA
                    WHERE RD.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                      AND RD.ID_CARTEIRA = R.ID_CARTEIRA
                      AND DA2.{settings.PORTFOLIO_COLUMN} IS NOT NULL
                ) DA
                CROSS APPLY (
                    SELECT
                        COUNT(*) AS total_parcelas,
                        SUM(CASE WHEN R2.VR_PAGO > 0 THEN 1 ELSE 0 END) AS parcelas_pagas,
                        SUM(CASE WHEN COALESCE(R2.VR_PAGO, 0) <= 0 THEN R2.VALOR ELSE 0 END) AS valor_aberto
                    FROM {database}.dbo.REC_MASTER R2 (NOLOCK)
                    WHERE R2.NR_RECEBIMENTO = R.NR_RECEBIMENTO
                      AND R2.ID_CARTEIRA = R.ID_CARTEIRA
                ) P
                WHERE R.PARCELA = {settings.PRIMEIRA_PARCELA}
                  AND R.DT_EMISSAO >= @Hoje AND R.DT_EMISSAO < @Amanha
                  AND R.ID_REC_STATUS IN {settings.STATUS_APROVADOS_SQL}
                  {settings.FILTRO_AGENTES_EXCLUIDOS_SQL}
            ) sub
            GROUP BY sub.portfolio_name, sub.fase
        """

    agg = """
        SELECT portfolio_name, fase, SUM(qtd) AS qtd, SUM(valor_aberto) AS valor_aberto
    """
    order = (
        "GROUP BY portfolio_name, fase ORDER BY portfolio_name, fase"
        if db == "todos"
        else "ORDER BY portfolio_name, fase"
    )
    return wrap_todos_or_single(db, _base, agg, order_by=order, date_from=date_from, date_to_exclusive=date_to_exclusive)


def _fase_summary(
    rows: List[Dict[str, Any]],
    fase: Optional[str],
    data_referencia: str,
) -> Dict[str, Any]:
    """Totais por fase; com `fase`, também as carteiras com maior valor em aberto nela."""
    por_fase: Dict[str, Dict[str, float]] = {f: {"qtd": 0, "valor_aberto": 0.0} for f in FASES}
    por_carteira: Dict[str, Dict[str, Dict[str, float]]] = {}
    for row in rows:
        f = str(row.get("fase") or "").strip()
        if f not in por_fase:
            continue
        name = str(row.get("portfolio_name") or "").strip()
        qtd = int(row.get("qtd") or 0)
        valor = float(row.get("valor_aberto") or 0)
        por_fase[f]["qtd"] += qtd
        por_fase[f]["valor_aberto"] += valor
        if name:
            carteira = por_carteira.setdefault(name, {f2: {"qtd": 0, "valor_aberto": 0.0} for f2 in FASES})
            carteira[f]["qtd"] += qtd
            carteira[f]["valor_aberto"] += valor

    total = sum(int(b["qtd"]) for b in por_fase.values())
    fases_out: Dict[str, Dict[str, Any]] = {}
    for f in FASES:
        bucket = por_fase[f]
        fases_out[f] = {
            "qtd": int(bucket["qtd"]),
            "valor_aberto": round(bucket["valor_aberto"], 2),
            "percentual": round(bucket["qtd"] * 100.0 / total, 2) if total else 0.0,
        }

    out: Dict[str, Any] = {
        "fases": fases_out,
        "total_acordos": total,
        "criterio": (
            "Acordos aprovados (1ª parcela status 1, 3, 12) emitidos nos últimos ~6 meses. "
            "Fase pelo progresso de pagamento: quitado = tudo pago; inicio = até 1 parcela "
            "paga; final = 2 ou menos parcelas restantes; meio = demais."
        ),
        "data_referencia": data_referencia,
    }
    if fase:
        carteiras: List[Dict[str, Any]] = []
        for name, buckets in por_carteira.items():
            total_carteira = sum(int(b["qtd"]) for b in buckets.values())
            bucket = buckets[fase]
            if bucket["qtd"] <= 0:
                continue
            carteiras.append({
                "portfolio_name": name,
                "qtd": int(bucket["qtd"]),
                "valor_aberto": round(bucket["valor_aberto"], 2),
                "pct_dos_acordos_da_carteira": (
                    round(bucket["qtd"] * 100.0 / total_carteira, 2) if total_carteira else 0.0
                ),
            })
        carteiras.sort(key=lambda c: c["valor_aberto"], reverse=True)
        out["fase"] = fase
        out["carteiras"] = carteiras[:_TOP_CARTEIRAS_POR_FASE]
    return out


def build_fase_negociacao(
    db: str,
    date_to: str,
    fase: Optional[str] = None,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Distribuição por fase de plano dos acordos aprovados dos últimos ~6 meses."""
    validated_db = validate_database_or_todos(db)
    conn_db = settings.ALLOWED_DATABASES[0] if validated_db == "todos" else validated_db
    end = date.fromisoformat(date_to)
    date_from = (end - timedelta(days=FASE_JANELA_DIAS)).isoformat()
    date_to_exclusive = (end + timedelta(days=1)).isoformat()

    def _compute() -> List[Dict[str, Any]]:
        query = build_fases_query(validated_db, date_from, date_to_exclusive)
        return run_query(
            query, conn_db,
            run_id=run_id,
            context="agente/fase-negociacao",
        )

    cache_key = f"agente|fases|{validated_db}|{date_from}|{date_to}"
    rows = cache_manager.get_or_compute(cache_key, _compute)
    return _fase_summary(rows, fase, data_referencia=date_to)
