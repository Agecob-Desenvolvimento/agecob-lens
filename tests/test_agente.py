"""
Testes do agente de carteiras (/agente/chat) — sem rede e sem banco.

Cobrem as funções puras (risco, tools, parsing) e o loop de tool-calling
completo com SDKs stubados (Anthropic e DeepSeek/OpenAI).
"""
import sys
import types

import config.settings as settings
from dominios.agente import risco as risco_mod
from dominios.agente.agente import _parse_agent_final_text, run_agent
from dominios.agente.risco import _portfolio_entries_from_rollup
from dominios.agente.tools import AGENT_TOOLS, dispatch_tool


def _rollup_row(portfolio, status, qtd, valor):
    return {"portfolio_name": portfolio, "id_rec_status": status, "qtd": qtd, "valor": valor}


def _entries_for(rows):
    return _portfolio_entries_from_rollup(rows, data_referencia="2026-06-10")


def _single_entry(rows):
    entries = _entries_for(rows)
    assert len(entries) == 1
    return entries[0]


# ─── _portfolio_entries_from_rollup ──────────────────────────────


def test_entries_denominador_e_composto_max():
    # GERADOS: 1=600, 2=300, 12=100 → vp=1000 / qtd=10. Status 2 conta nos
    # dois lados (gerado E quebrado), como manda a regra (baldes distintos).
    rows = [
        _rollup_row("ALFA", 1, 6, 600),
        _rollup_row("ALFA", 2, 3, 300),
        _rollup_row("ALFA", 12, 1, 100),
        _rollup_row("ALFA", 5, 1, 100),
        _rollup_row("ALFA", 7, 1, 50),
    ]
    entry = _single_entry(rows)
    assert entry["valor_primeira_parcela"] == 1000.0
    assert entry["qtd_acordos"] == 10
    assert entry["decomposicao"] == {
        "excecoes_pct": 10.0,
        "quebrados_pct": 30.0,
        "rejeitados_pct": 5.0,
    }
    # composto = MAX, nunca soma (10 + 30 + 5 = 45 seria errado)
    assert entry["risco_composto"] == 30.0
    assert entry["nivel_risco"] == "medio"
    assert entry["anomalia"] is False
    assert entry["data_referencia"] == "2026-06-10"


def test_entries_thresholds_baixo_medio_alto():
    def entry_with_quebra(valor_quebrado):
        rows = [
            _rollup_row("X", 1, 10, 1000 - valor_quebrado),
            _rollup_row("X", 2, 1, valor_quebrado),
        ]
        return _single_entry(rows)

    assert entry_with_quebra(250)["nivel_risco"] == "baixo"   # exatamente 25%
    assert entry_with_quebra(500)["nivel_risco"] == "medio"   # exatamente 50%
    assert entry_with_quebra(501)["nivel_risco"] == "alto"    # 50.1%


def test_entries_anomalia_dimensao_acima_de_100_sem_cap():
    rows = [
        _rollup_row("BETA", 1, 2, 200),
        _rollup_row("BETA", 5, 5, 300),  # exceções = 150% do denominador
    ]
    entry = _single_entry(rows)
    assert entry["decomposicao"]["excecoes_pct"] == 150.0  # bruto, sem cap
    assert entry["risco_composto"] == 150.0
    assert entry["nivel_risco"] == "alto"
    assert entry["anomalia"] is True


def test_entries_denominador_zero_marca_anomalia():
    rows = [_rollup_row("GAMA", 5, 2, 500)]  # nenhum gerado
    entry = _single_entry(rows)
    assert entry["valor_primeira_parcela"] == 0.0
    assert entry["decomposicao"]["excecoes_pct"] == 0.0
    assert entry["anomalia"] is True


def test_entries_ordenadas_por_valor_e_sem_nome_vazio():
    rows = [
        _rollup_row("MENOR", 1, 1, 100),
        _rollup_row("MAIOR", 1, 1, 900),
        _rollup_row("", 1, 1, 500),
        _rollup_row(None, 1, 1, 500),
    ]
    entries = _entries_for(rows)
    assert [e["portfolio_name"] for e in entries] == ["MAIOR", "MENOR"]


# ─── dispatch_tool ───────────────────────────────────────────────


SAMPLE_ENTRIES = _portfolio_entries_from_rollup(
    [
        _rollup_row("BANCO ALFA", 1, 10, 1000),
        _rollup_row("BANCO ALFA", 2, 1, 100),
        _rollup_row("BANCO BETA", 1, 5, 500),
        _rollup_row("BANCO BETA", 2, 3, 300),
        _rollup_row("CARTEIRA GAMA", 1, 2, 50),
        _rollup_row("CARTEIRA GAMA", 5, 4, 90),
    ],
    data_referencia="2026-06-10",
)


def test_tool_get_portfolio_metrics_exato_e_substring():
    exact = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "banco alfa"}, SAMPLE_ENTRIES)
    assert exact["portfolio_name"] == "BANCO ALFA"

    partial = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "gama"}, SAMPLE_ENTRIES)
    assert partial["portfolio_name"] == "CARTEIRA GAMA"

    missing = dispatch_tool("get_portfolio_metrics", {"portfolio_name": "inexistente"}, SAMPLE_ENTRIES)
    assert "error" in missing
    assert "BANCO ALFA" in missing["available_portfolios"]


def test_tool_filter_by_risk():
    # ALFA: quebrados 100/1100 ≈ 9.09 → baixo; BETA: 300/800 = 37.5 → medio;
    # GAMA: exceções 90/50 = 180 → alto (anomalia).
    baixo = dispatch_tool("filter_portfolios_by_risk", {"level": "baixo"}, SAMPLE_ENTRIES)
    assert [e["portfolio_name"] for e in baixo] == ["BANCO ALFA"]

    medio = dispatch_tool("filter_portfolios_by_risk", {"level": "médio"}, SAMPLE_ENTRIES)
    assert [e["portfolio_name"] for e in medio] == ["BANCO BETA"]

    alto = dispatch_tool("filter_portfolios_by_risk", {"level": "alto"}, SAMPLE_ENTRIES)
    assert [e["portfolio_name"] for e in alto] == ["CARTEIRA GAMA"]

    invalid = dispatch_tool("filter_portfolios_by_risk", {"level": "altissimo"}, SAMPLE_ENTRIES)
    assert "error" in invalid


def test_tool_filter_by_value():
    result = dispatch_tool("filter_portfolios_by_value", {"min_value": 500}, SAMPLE_ENTRIES)
    assert [e["portfolio_name"] for e in result] == ["BANCO ALFA", "BANCO BETA"]

    limited = dispatch_tool("filter_portfolios_by_value", {"min_value": 0, "limit": 1}, SAMPLE_ENTRIES)
    assert len(limited) == 1
    assert limited[0]["portfolio_name"] == "BANCO ALFA"  # ordenado por valor desc


def test_tool_compare_portfolios():
    result = dispatch_tool(
        "compare_portfolios",
        {"names": ["alfa", "beta", "nao-existe"], "metric": "risco_composto"},
        SAMPLE_ENTRIES,
    )
    assert [e["portfolio_name"] for e in result["portfolios"]] == ["BANCO ALFA", "BANCO BETA"]
    assert result["metric"] == "risco_composto"
    assert result["not_found"] == ["nao-existe"]

    empty = dispatch_tool("compare_portfolios", {"names": []}, SAMPLE_ENTRIES)
    assert "error" in empty


def test_tool_explain_business_rule():
    known = dispatch_tool("explain_business_rule", {"rule_name": "risco_composto_formula"}, SAMPLE_ENTRIES)
    assert "MAX" in known["explanation"]

    unknown = dispatch_tool("explain_business_rule", {"rule_name": "nao-existe"}, SAMPLE_ENTRIES)
    assert "error" in unknown
    assert "denominador" in unknown["available_rules"]


def test_tool_desconhecida():
    result = dispatch_tool("tool_que_nao_existe", {}, SAMPLE_ENTRIES)
    assert "error" in result


# ─── parsing / normalização da resposta final ────────────────────


def test_parse_final_json_valido():
    raw = (
        '{"text": "ok", "highlights": [{"type": "anomaly", "label": "GAMA", "value": "180%"}],'
        ' "suggested_actions": [{"label": "Ver alto risco", "prompt": "carteiras de alto risco"}],'
        ' "data_sources": ["filter_portfolios_by_risk"], "confidence": "high"}'
    )
    parsed = _parse_agent_final_text(raw)
    assert parsed["text"] == "ok"
    assert parsed["highlights"] == [{"type": "anomaly", "label": "GAMA", "value": "180%"}]
    assert parsed["suggested_actions"] == [{"label": "Ver alto risco", "prompt": "carteiras de alto risco"}]
    assert parsed["confidence"] == "high"


def test_parse_final_json_com_cerca_de_codigo():
    raw = '```json\n{"text": "cercado", "confidence": "medium"}\n```'
    parsed = _parse_agent_final_text(raw)
    assert parsed["text"] == "cercado"
    assert parsed["confidence"] == "medium"


def test_parse_final_texto_invalido_degrada_para_low():
    parsed = _parse_agent_final_text("resposta solta sem json")
    assert parsed["text"] == "resposta solta sem json"
    assert parsed["confidence"] == "low"
    assert parsed["highlights"] == []


def test_parse_final_normaliza_tipos_invalidos():
    raw = (
        '{"text": "x", "highlights": [{"type": "estranho", "label": "L"}, {"label": ""}],'
        ' "suggested_actions": [{"label": "Sem prompt"}], "confidence": "talvez"}'
    )
    parsed = _parse_agent_final_text(raw)
    assert parsed["highlights"] == [{"type": "metric", "label": "L"}]
    assert parsed["suggested_actions"] == [{"label": "Sem prompt"}]
    assert parsed["confidence"] == "low"


# ─── run_agent: loop de tool-calling com SDK e SQL stubados ──────


class _Block:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class _FakeResponse:
    def __init__(self, stop_reason, content):
        self.stop_reason = stop_reason
        self.content = content


def _stub_dataset(monkeypatch):
    rollup_rows = [
        _rollup_row("BANCO BETA", 1, 5, 500),
        _rollup_row("BANCO BETA", 2, 3, 300),
    ]
    monkeypatch.setattr(risco_mod, "run_query", lambda *a, **k: rollup_rows)
    monkeypatch.setattr(risco_mod.cache_manager, "_ttl", 0)  # sem cache entre testes


def test_run_agent_loop_anthropic_offline(monkeypatch):
    """user → modelo pede tool → dispatch → modelo responde JSON final."""
    final_json = (
        '{"text": "BANCO BETA é a de maior risco.",'
        ' "highlights": [{"type": "portfolio", "label": "BANCO BETA"}],'
        ' "suggested_actions": [], "data_sources": ["filter_portfolios_by_risk"],'
        ' "confidence": "high"}'
    )
    responses = [
        _FakeResponse("tool_use", [
            _Block(type="tool_use", id="tu_1", name="filter_portfolios_by_risk", input={"level": "medio"}),
        ]),
        _FakeResponse("end_turn", [_Block(type="text", text=final_json)]),
    ]
    seen_requests = []

    class _FakeMessages:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return responses[len(seen_requests) - 1]

    class _FakeAnthropic:
        def __init__(self, api_key):
            self.messages = _FakeMessages()

    fake_sdk = types.ModuleType("anthropic")
    fake_sdk.Anthropic = _FakeAnthropic
    fake_sdk.APIError = type("APIError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "anthropic", fake_sdk)
    monkeypatch.setattr(settings, "AGENT_PROVIDER", "anthropic")
    _stub_dataset(monkeypatch)

    result = run_agent(
        [{"role": "user", "content": "qual a carteira de maior risco?"}],
        "todos", "2026-06-10", "2026-06-10",
    )

    assert result["text"] == "BANCO BETA é a de maior risco."
    assert result["confidence"] == "high"
    assert result["data_referencia"] == "2026-06-10"

    # segunda chamada carrega o tool_result do dispatch real
    second = seen_requests[1]["messages"]
    assert second[-1]["role"] == "user"
    tool_result = second[-1]["content"][0]
    assert tool_result["type"] == "tool_result"
    assert tool_result["tool_use_id"] == "tu_1"
    assert "BANCO BETA" in tool_result["content"]

    # contrato da chamada: tools e system prompt com data de referência
    assert seen_requests[0]["tools"] is AGENT_TOOLS
    assert "2026-06-10" in seen_requests[0]["system"]


def test_run_agent_loop_deepseek_offline(monkeypatch):
    """Mesmo fluxo no formato OpenAI-compatível usado pelo DeepSeek."""
    final_json = '{"text": "Apenas BANCO BETA está em risco médio.", "confidence": "high"}'

    class _ToolFn:
        name = "filter_portfolios_by_risk"
        arguments = '{"level": "medio"}'

    class _ToolCall:
        id = "call_1"
        function = _ToolFn()

    fake_responses = [
        _Block(choices=[_Block(message=_Block(content=None, tool_calls=[_ToolCall()]))]),
        _Block(choices=[_Block(message=_Block(content=final_json, tool_calls=None))]),
    ]
    seen_requests = []

    class _FakeCompletions:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            return fake_responses[len(seen_requests) - 1]

    class _FakeOpenAIClient:
        def __init__(self, api_key, base_url):
            self.chat = _Block(completions=_FakeCompletions())

    fake_sdk = types.ModuleType("openai")
    fake_sdk.OpenAI = _FakeOpenAIClient
    fake_sdk.OpenAIError = type("OpenAIError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "openai", fake_sdk)
    monkeypatch.setattr(settings, "AGENT_PROVIDER", "deepseek")
    monkeypatch.setattr(settings, "AGENT_MODEL", "deepseek-chat")
    _stub_dataset(monkeypatch)

    result = run_agent(
        [{"role": "user", "content": "alguma carteira em risco médio?"}],
        "todos", "2026-06-10", "2026-06-10",
    )

    assert result["text"] == "Apenas BANCO BETA está em risco médio."
    assert result["confidence"] == "high"

    # primeira chamada: system como primeira mensagem + tools no formato OpenAI
    first = seen_requests[0]
    assert first["messages"][0]["role"] == "system"
    assert "2026-06-10" in first["messages"][0]["content"]
    assert first["tools"][0]["type"] == "function"
    assert first["tools"][0]["function"]["name"] == "get_portfolio_metrics"

    # segunda chamada: tool_result no formato role=tool com o dispatch real
    second = seen_requests[1]["messages"]
    assert second[-1]["role"] == "tool"
    assert second[-1]["tool_call_id"] == "call_1"
    assert "BANCO BETA" in second[-1]["content"]
