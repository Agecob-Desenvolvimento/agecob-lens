"""
Schemas pydantic das 4 tools novas do agente (P1, agente-tools-handoff.md §2).
`extra="forbid"` em todas — gera `additionalProperties: false` no JSON schema
exposto ao LLM (via `.model_json_schema()`) e valida args em runtime; erro de
validação vira tool result acionável, nunca traceback (dispatch_tool).

kpi de QueryKpiInput é o inventário REAL de endpoints com série diária —
não o rascunho original do handoff. Ver nota em tools.py sobre a divergência
(6 dos 11 kpis propostos não têm fonte diária: qtd_contatos_cpc,
taxa_contato_pct, taxa_cpc_pct, taxa_conversao_pct, qtd_acionamentos e
desconto_medio_percentual só existem como snapshot agregado do período, não
como série por dia/semana/mês — nenhum endpoint os serve assim hoje).
"""
from datetime import date
from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

_DB_LITERAL = Literal["COBwebRCBCONSUMER", "COBwebRCBAUTOS"]

# §2 do handoff: "janela máxima de 92 dias em todas; date_to ≤ hoje" — vale
# para as 3 tools com date_from/date_to (explicar_metrica não tem datas).
_MAX_WINDOW_DAYS = 92


class _DateRangeValidatorMixin:
    """Mixin de validação (não é BaseModel): reusa a regra de janela nas 3
    tools com date_from/date_to sem duplicar a lógica em cada uma."""

    @model_validator(mode="after")
    def _validar_janela(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to não pode ser anterior a date_from.")
        if self.date_to > date.today():
            raise ValueError("date_to não pode ser no futuro.")
        if (self.date_to - self.date_from).days > _MAX_WINDOW_DAYS:
            raise ValueError(
                f"Janela maior que {_MAX_WINDOW_DAYS} dias — reduza o período ou use granularidade maior."
            )
        return self


class QueryKpiInput(_DateRangeValidatorMixin, BaseModel):
    model_config = ConfigDict(extra="forbid")
    db: _DB_LITERAL
    kpi: Literal[
        "valor_acordos_gerados", "qtd_acordos", "risco_composto_pct",
        "efetividade", "ritmo_dia",
    ]
    date_from: date
    date_to: date
    granularidade: Literal["dia", "semana", "mes"] = "dia"
    page: int = Field(1, ge=1, le=20)


class CompararAgentesInput(_DateRangeValidatorMixin, BaseModel):
    model_config = ConfigDict(extra="forbid")
    db: _DB_LITERAL
    agent_keys: List[str] = Field(min_length=2, max_length=5)
    metricas: List[Literal[
        "qtd_acionamentos", "qtd_contatos_cpc", "taxa_contato_pct",
        "qtd_acordos", "taxa_conversao_pct", "valor_primeira_parcela",
    ]] = Field(min_length=1)
    date_from: date
    date_to: date
    consolidar_cross_db: bool = False


class DetalharPortfolioInput(_DateRangeValidatorMixin, BaseModel):
    model_config = ConfigDict(extra="forbid")
    db: _DB_LITERAL
    portfolio: str = Field(max_length=80)
    date_from: date
    date_to: date
    drilldown: Literal["aprovados", "excecao", "rejeitado", "quebrado", "resumo"] = "resumo"
    page: int = Field(1, ge=1, le=10)
    page_size: Literal[10, 25, 50] = 25


class ExplicarMetricaInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    termo: str = Field(min_length=1)
