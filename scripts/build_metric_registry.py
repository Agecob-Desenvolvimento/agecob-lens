"""
Gera dominios/agente/metric_registry.json a partir de config/settings.py.

Fonte de verdade única (D2/D9 do handoff agente-tools-handoff.md): números
NUNCA são copiados à mão para o registry — vêm sempre da leitura em runtime
das constantes STATUS_* de settings.py. Prosa (caveats/kpis) fica hardcoded
aqui porque não existe em settings.py, mas todo file:line citado foi
verificado contra o código real (não copiar sem checar de novo se um desses
arquivos mudar de linha).

Uso:
    python scripts/build_metric_registry.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import (  # noqa: E402
    RISK_LEVEL_LOW_MAX,
    RISK_LEVEL_MID_MAX,
    STATUS_APROVADOS,
    STATUS_EXCECAO,
    STATUS_GERADOS,
    STATUS_QUEBRADO,
    STATUS_QUEBRA_AUTOMATICA,
    STATUS_REJEITADO,
    STATUS_UNIVERSO_ACORDOS,
)

_OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "dominios", "agente", "metric_registry.json",
)


def build_registry() -> dict:
    return {
        "status": {
            "aprovados": sorted(STATUS_APROVADOS),
            "excecao": sorted(STATUS_EXCECAO),
            "rejeitado": sorted(STATUS_REJEITADO),
            "quebrado": sorted(STATUS_QUEBRADO),
            "quebra_automatica": sorted(STATUS_QUEBRA_AUTOMATICA),
            "gerados": sorted(STATUS_GERADOS),
            "universo_acordos": sorted(STATUS_UNIVERSO_ACORDOS),
        },
        "caveats": {
            "excecao": "Enum literal 11=EXCEÇÃO NÃO é a exceção de negócio. Negócio usa 5=PENDENTE.",
            "gerados": "Quebrar é desfecho posterior, não apaga a geração. Boleto de quebra entra no denominador de emitidos, nunca no de pagos.",
            "parcela_zero": "PARCELA=0 é a primeira parcela. Não normalizar.",
            "portfolio": "Nome do portfólio vem de DIV_AUX.CAMPO010, não de CART_MASTER.",
            "agent_key": "Identificador do agente = USU_MASTER.CHAVE em minúsculas.",
            "cross_db": "Mesmo agente nos dois bancos = entidades separadas por padrão; consolidação só via /produtividade-agentes.",
            "granularidade_intencional": "qtd_acordos_por_contrato (Home global) usa COUNT(DISTINCT ...) via REC_DIVIDAS (CTE_Contratos_Agente, use_distinct_esforco=True); todo o resto (rankings, comparação, ticket médio) usa qtd_acordos por acordo. Nunca usar qtd_acordos_por_contrato como denominador — ver data-layer.md 'Two grains for acordos count'.",
            "taxa_contato_vs_cpc": "CPC = Σ qtd_contatos (contagem, nunca %). Taxa de contato = qtd_alo / qtd_acionamentos. Taxa de CPC = qtd_contatos / qtd_alo. As três são diferentes — não confundir nome de coluna SQL com definição de negócio: queries.py:511 tem uma coluna ALIASED 'avg_taxa_contato' que na verdade calcula Taxa de CPC (qtd_contatos/qtd_alo), não Taxa de contato. Fonte correta de taxa_contato_pct é dominios/agente/agentes.py:75 (_ratio_pct(qtd_alo, qtd_acionamentos)).",
            "agent_filter_divergence": "Existem DUAS listas de agentes excluídos, diferentes de propósito: FILTRO_AGENTES_EXCLUIDOS_SQL (geral) e FILTRO_AGENTES_EFETIVIDADE_SQL (só efetividade) — ver settings.py:212-216. Cada tool nova reusa a constante do endpoint que ela envelopa. NUNCA construir uma terceira lista 'unificada'.",
            # Migradas de BUSINESS_RULES (tools.py, dict removido no P1 — explain_business_rule
            # retirada, explicar_metrica lê daqui). Texto copiado verbatim, não reescrito (§2.6).
            "status_5": (
                "Status 5 = PENDENTE no enum do COBweb (aguardando validação interna). "
                "Na visão de risco do negócio é tratado como 'Exceção': valor parado que "
                "ainda não virou boleto firme."
            ),
            "denominador": (
                "Todos os percentuais usam o mesmo denominador: o universo de 1ª parcela "
                "(PARCELA = 0) do período — valor GERADO (status 1, 2, 3, 10, 12) + exceções "
                "(status 5) + rejeitados (status 7). Cada dimensão é uma fatia 0–100% desse "
                "universo, comparável entre si e entre carteiras."
            ),
            "status_gerados": (
                "GERADOS = status (1, 2, 3, 10, 12): ATIVO, QUEBRA, BAIXA POR PAGAMENTO, "
                "QUEBRA AUTOMÁTICA e BAIXA POR PAGAMENTO AVULSO. É o universo de boletos "
                "efetivamente emitidos — inclui os que quebraram depois."
            ),
            "thresholds": (
                f"Níveis de risco pelo risco_composto: baixo <= {RISK_LEVEL_LOW_MAX}%, "
                f"medio <= {RISK_LEVEL_MID_MAX}%, alto > {RISK_LEVEL_MID_MAX}%. "
                "Qualquer dimensão acima de 100% é anomalia de dados e deve ser alertada."
            ),
        },
        "kpis": {
            "cpc": {
                "formula": "Σ qtd_contatos — contagem, nunca %",
                "source": "dominios/agente/agentes.py (bucket qtd_contatos)",
            },
            "taxa_contato_pct": {
                "formula": "qtd_alo / qtd_acionamentos — rotular sempre \"taxa de contato\"",
                "source": "dominios/agente/agentes.py:75 _ratio_pct(qtd_alo, qtd_acionamentos)",
                "note": "Não usar a coluna avg_taxa_contato de queries.py:511 como fonte — apesar do nome, ela calcula Taxa de CPC (qtd_contatos/qtd_alo), não isto.",
            },
            "taxa_cpc_pct": {
                "formula": "qtd_contatos / qtd_alo",
                "source": "dominios/produtividade/queries.py:199,391,511 (colunas cpc_percentual/avg_taxa_contato — nomes enganosos, fórmula é esta)",
            },
            "taxa_conversao_pct": {
                "formula": "qtd_acordos / qtd_contatos × 100",
                "source": "dominios/agente/agentes.py (conversao_pct, renomeado de conversao_pct genérico 2026-08-03, ver data-layer.md)",
            },
            "desconto_medio_percentual": {
                "formula": "VALOR_TOTAL_ACORDO / VR_ORIGINAL × 100, guarda VR_ORIGINAL > 0",
                "source": "dominios/produtividade/queries.py:104-105",
            },
            "valor_primeira_parcela": {
                "formula": "SUM em produtividade (CTE_Financeiro_Agente, todo endpoint de agente)",
                "source": "dominios/produtividade/queries.py:106 SUM(...VALOR_P1...)",
                "note": "Granularidade em /comparacao-agentes ainda não confirmada — ver pendência §10-3 do handoff antes de fechar o schema de comparar_agentes.",
            },
            "qtd_acionamentos": {
                "formula": "DISTINCT vs não-DISTINCT por endpoint",
                "source": "docs/data-layer.md 'Two grains for acordos count'",
            },
            "qtd_acordos": {
                "formula": "Grão de acordo (não de contrato)",
                "source": "docs/data-layer.md 'Two grains for acordos count'",
            },
            "valor_acordos_gerados": {
                "formula": "Base STATUS_GERADOS",
                "source": "config/settings.py:54-56",
            },
            "ritmo_dia": {
                "formula": "Sempre HOJE real (date.today()), independente do período da sessão",
                "source": "dominios/agente/tools.py:132-141 (descrição da tool get_ritmo_acordos_dia)",
            },
            "risco_composto_formula": {
                "formula": "MAX(excecoes_pct, quebrados_pct, rejeitados_pct) — nunca a soma: as "
                           "dimensões não são aditivas (quebrados é subconjunto dos gerados) e somar "
                           "dupla-contaria valor, exagerando o risco. O risco da carteira é o seu pior eixo.",
                "source": "dominios/agente/risco.py (migrado de BUSINESS_RULES, tools.py)",
            },
        },
    }


def main() -> None:
    registry = build_registry()
    with open(_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write("\n")
    print(f"metric_registry.json gerado em {_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
