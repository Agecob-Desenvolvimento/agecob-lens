"""
Golden-set eval harness (P2, §6 do handoff agente-tools-handoff.md) — MODO OFFLINE.

Decisão de escopo (confirmada com o usuário ao abrir P2): este harness roda
sem rede e sem custo de API. Ele NÃO chama o DeepSeek real — o SDK openai é
substituído por um "modelo" scriptado (`mock_model.turns` no YAML de cada
caso), mesmo padrão já usado em tests/test_agente.py::test_run_agent_loop_*_offline.
A camada de dados (SQL/pyodbc) também é substituída por fixtures.

O que isso PROVA: RunGuard, dispatch_tool, contrato de erro, sanitização de
saída e as 4 camadas de asserção funcionam corretamente dado um trace
conhecido — testa a MÁQUINA, não o julgamento do modelo real. Com este modo,
`tool_selection_accuracy`/`param_accuracy` medem "o harness detecta uma
violação quando ela existe" (via casos com `esperado.deve_passar: false`),
não "o DeepSeek de verdade escolhe a tool certa". Medir o modelo de verdade
contra estes mesmos casos é um modo "live" (gated por env var, custo real de
tokens) — trabalho futuro, não construído agora por decisão explícita.

Camada 4 (LLM-as-judge) não está implementada nesta versão: precisa de um
modelo juiz ao vivo, incompatível com "offline". Fica para quando o modo
live existir — não usar para nota de qualidade subjetiva até lá.

`respx` foi retirado do requirements.txt frente ao rascunho do handoff: as
tools do agente chamam dominios/*/*.py → run_query (pyodbc) direto, nunca
HTTP interno — não há tráfego httpx para interceptar. Mocka-se diretamente
as funções de builder, no mesmo nível que tests/test_agente.py já usa para
`risco_mod.run_query`.
"""
import json
import re
import sys
import types
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from freezegun import freeze_time

import config.settings as settings
import dominios.agente.agente as agente_mod
from dominios.agente.agente import run_agent
from dominios.agente.tools import AGENT_TOOLS

_HERE = Path(__file__).resolve().parent
GOLDEN_DIR = _HERE / "golden"
FIXTURES_DIR = _HERE / "fixtures"

_SQL_KEYWORDS = ("SELECT", "DROP", "INSERT", "DELETE")
_TOOL_ALLOWLIST = {t["name"] for t in AGENT_TOOLS}


def load_case(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_fixture(name: str) -> Dict[str, Any]:
    with open(FIXTURES_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def all_case_paths() -> List[Path]:
    return sorted(GOLDEN_DIR.glob("*.yaml"))


# ─── mock do provedor DeepSeek (scriptado, offline) ────────────────


def _tool_call_stub(call_id: str, name: str, args: Dict[str, Any]) -> types.SimpleNamespace:
    return types.SimpleNamespace(
        id=call_id,
        function=types.SimpleNamespace(name=name, arguments=json.dumps(args, ensure_ascii=False)),
    )


def _build_fake_deepseek_module(turns: List[Dict[str, Any]]):
    """
    Módulo `openai` falso que reproduz `turns` em sequência: cada item é
    {"tool_call": {"name","args"}} (1 por rodada — D6, sem tool calls
    paralelos) ou {"final": {...AgentResponse json...}}.
    """
    responses = []
    for i, turn in enumerate(turns):
        if "tool_call" in turn:
            tc = _tool_call_stub(f"call_{i}", turn["tool_call"]["name"], turn["tool_call"].get("args", {}))
            message = types.SimpleNamespace(content=None, tool_calls=[tc])
        else:
            message = types.SimpleNamespace(content=json.dumps(turn["final"], ensure_ascii=False), tool_calls=None)
        responses.append(types.SimpleNamespace(choices=[types.SimpleNamespace(message=message)]))

    seen_requests: List[Dict[str, Any]] = []

    class _FakeCompletions:
        def create(self, **kwargs):
            seen_requests.append(kwargs)
            idx = len(seen_requests) - 1
            if idx >= len(responses):
                raise AssertionError(
                    f"mock_model esgotado: run_agent pediu uma {idx + 1}ª rodada de LLM, "
                    f"o script do caso só tem {len(responses)} turno(s) — RunGuard/loop "
                    f"não convergiu com o script fornecido."
                )
            return responses[idx]

    class _FakeOpenAIClient:
        def __init__(self, api_key, base_url, **kwargs):
            self.chat = types.SimpleNamespace(completions=_FakeCompletions())

    fake_sdk = types.ModuleType("openai")
    fake_sdk.OpenAI = _FakeOpenAIClient
    fake_sdk.OpenAIError = type("OpenAIError", (Exception,), {})
    return fake_sdk, seen_requests


# ─── mock da camada de dados (fixture → builders) ──────────────────


def apply_fixture(monkeypatch, fixture: Dict[str, Any]) -> None:
    """Substitui a camada de dados real (pyodbc) pela fixture do caso."""
    entries = fixture.get("entries", [])
    agents = fixture.get("agents", [])
    tool_results = fixture.get("tool_results", {})

    monkeypatch.setattr(agente_mod, "build_portfolio_entries", lambda *a, **k: entries)
    monkeypatch.setattr(agente_mod, "build_agent_entries", lambda *a, **k: agents)

    def _canned(tool_name: str):
        def _fn(*args, **kwargs):
            if tool_name not in tool_results:
                return {"error": f"fixture sem tool_results para {tool_name!r}."}
            value = tool_results[tool_name]
            if isinstance(value, dict) and "__raise__" in value:
                # GS-012 (resiliência): simula upstream explodindo — RunGuard
                # (guards.py) captura e devolve build_tool_error("upstream_5xx", ...).
                raise RuntimeError(value["__raise__"])
            return value
        return _fn

    monkeypatch.setattr(agente_mod, "build_status_breakdown", _canned("get_acordo_status_breakdown"))
    monkeypatch.setattr(agente_mod, "build_fase_negociacao", _canned("get_fase_negociacao"))
    monkeypatch.setattr(agente_mod, "build_cruzamento", _canned("get_cruzamento_agente_carteira"))
    monkeypatch.setattr(agente_mod, "build_ranking_agentes", _canned("get_ranking_agentes_por_dimensao"))
    monkeypatch.setattr(agente_mod, "build_kpi_historico", _canned("query_kpi_historico"))
    monkeypatch.setattr(agente_mod, "build_detalhe_portfolio", _canned("detalhar_portfolio"))

    def _fake_ritmo(db):
        return {"data": tool_results.get("get_ritmo_acordos_dia", {}), "meta": {}}

    monkeypatch.setattr("api.routers.ritmo_dia.ritmo_dia", _fake_ritmo)


# ─── execução de um caso ────────────────────────────────────────────


def run_case(monkeypatch, case: Dict[str, Any]) -> Dict[str, Any]:
    """
    Roda `case` fim a fim contra o `run_agent` REAL (RunGuard, dispatch_tool,
    contrato de erro, sanitização de saída — tudo de verdade), com LLM e
    dados mocados. `trace` vem do próprio script (é exatamente o que o
    "modelo" foi instruído a chamar) — não precisa reconstrução.
    """
    fixture = load_fixture(case["fixture"])
    apply_fixture(monkeypatch, fixture)

    fake_sdk, seen_requests = _build_fake_deepseek_module(case["mock_model"]["turns"])
    monkeypatch.setitem(sys.modules, "openai", fake_sdk)
    monkeypatch.setattr(settings, "AGENT_PROVIDER", "deepseek")

    sessao = case["sessao"]
    frozen_today = case.get("frozen_today", sessao["date_to"])
    with freeze_time(frozen_today):
        response = run_agent(
            [{"role": "user", "content": case["pergunta"]}],
            sessao["db"], sessao["date_from"], sessao["date_to"],
        )

    trace = [t["tool_call"] for t in case["mock_model"]["turns"] if "tool_call" in t]
    return {"response": response, "trace": trace, "requests": seen_requests, "fixture": fixture}


# ─── camada 1 — seleção de tool ─────────────────────────────────────


def assert_tool_selection(trace: List[Dict[str, Any]], esperado: Dict[str, Any]) -> Optional[str]:
    chamadas = {t["name"] for t in trace}
    any_of = esperado.get("tools_chamadas_any_of")
    if any_of and not (chamadas & set(any_of)):
        return f"nenhuma tool esperada {any_of} foi chamada (chamadas: {sorted(chamadas)})"
    for proibida in esperado.get("tools_proibidas", []):
        if proibida in chamadas:
            return f"tool proibida {proibida!r} foi chamada"
    if esperado.get("zero_tool_calls") and trace:
        return f"esperava zero tool calls, mas houve {len(trace)}"
    return None


def assert_no_sql_channel(trace: List[Dict[str, Any]]) -> Optional[str]:
    """Regra de ouro (D1): só tools da allowlist, nunca palavra-chave SQL nos args."""
    for call in trace:
        if call["name"] not in _TOOL_ALLOWLIST:
            return f"tool fora da allowlist: {call['name']!r}"
        args_str = json.dumps(call.get("args", {}), ensure_ascii=False).upper()
        for kw in _SQL_KEYWORDS:
            if kw in args_str:
                return f"palavra-chave SQL {kw!r} nos args de {call['name']!r}"
    return None


def assert_params(trace: List[Dict[str, Any]], esperado: Dict[str, Any]) -> Optional[str]:
    contem = esperado.get("params_contem")
    if not contem:
        return None
    for call in trace:
        args = call.get("args", {})
        if all(args.get(k) == v for k, v in contem.items()):
            for k, v in esperado.get("params_nao_contem", {}).items():
                if args.get(k) == v:
                    return f"tool {call['name']!r} tinha {k}={v!r}, que deveria estar ausente"
            return None
    return f"nenhuma chamada teve os params esperados {contem}"


# ─── camada 2 — fidelidade numérica (anti-fórmula-inventada) ───────

# Ordem importa: a 1ª alternativa exige pelo menos um grupo de milhar (+, não
# *) — sem isso "2026" batia parcial em "202" (3 dígitos) e deixava "6" solto,
# por causa de como o Python resolve alternância (primeira que casa, não a
# mais longa). Datas ISO/BR são removidas antes de escanear (não são métrica).
_NUM_RE = re.compile(r"-?\d{1,3}(?:\.\d{3})+(?:,\d+)?%?|-?\d+(?:,\d+)?%?")
_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}")


def _achatar_numeros(obj: Any, out: List[float]) -> None:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        out.append(float(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            _achatar_numeros(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _achatar_numeros(v, out)


def _parse_num_ptbr(token: str) -> Optional[float]:
    t = token.rstrip("%").strip().replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def assert_numbers_traceable(resposta_text: str, fixture: Dict[str, Any], tol: float = 0.01) -> Optional[str]:
    """
    Todo número >= 1 do texto tem que casar (com tolerância) um valor
    numérico presente na fixture, ou a soma de dois deles. Rede de segurança
    contra número claramente inventado — não substitui a camada 3 para os
    poucos casos que precisam de precisão exata.
    """
    disponiveis: List[float] = []
    _achatar_numeros(fixture, disponiveis)
    somas = {round(a + b, 2) for a in disponiveis for b in disponiveis}
    texto_sem_datas = _DATE_RE.sub(" ", resposta_text)
    for match in _NUM_RE.finditer(texto_sem_datas):
        valor = _parse_num_ptbr(match.group())
        if valor is None:
            continue
        # Números de 1 dígito quase sempre são código de status ("status 5"),
        # ordinal ("1ª parcela") ou contagem pequena citada em prosa — não
        # dá pra distinguir de fabricado só pela magnitude. Camada 3
        # (ground_truth) cobre esses quando precisam de garantia exata.
        if abs(valor) < 10:
            continue
        if any(abs(valor - d) <= max(tol * abs(d), 0.5) for d in disponiveis):
            continue
        if any(abs(valor - s) <= max(tol * abs(s), 0.5) for s in somas if s):
            continue
        return f"{match.group()!r} não rastreável na fixture — possível número inventado"
    return None


# ─── camada 3 — ground truth (poucos casos-chave, tolerância 0.5%) ─


def assert_ground_truth(fixture: Dict[str, Any], ground_truth: Dict[str, Any]) -> Optional[str]:
    """
    `ground_truth`: {"tool_results.<tool>.<campo dotted>": valor_esperado}.
    Sem SQL real neste modo offline: valida que a fixture (hand-verificada
    contra a fórmula oficial) bate com o valor esperado — a garantia de
    "fixture correta" desloca para quem autora o caso, documentado no YAML.
    """
    for path, esperado_valor in ground_truth.items():
        node: Any = fixture
        for part in path.split("."):
            if isinstance(node, list):
                node = node[int(part)]
            else:
                node = node[part]
        if abs(float(node) - float(esperado_valor)) / max(abs(float(esperado_valor)), 1e-9) > 0.005:
            return f"{path} = {node} diverge do ground truth {esperado_valor} (tol 0.5%)"
    return None


# ─── camada 4 — LLM-as-judge (não implementada, offline) ───────────


def assert_llm_judge(*_args, **_kwargs) -> Optional[str]:
    raise NotImplementedError(
        "Camada 4 (LLM-as-judge) precisa de um modelo juiz ao vivo — fora de "
        "escopo do harness offline. Não chamar até o modo live existir."
    )


# ─── avaliação de 1 caso (todas as camadas aplicáveis) ─────────────


def evaluate_case(monkeypatch, case: Dict[str, Any]) -> List[str]:
    """Roda o caso e devolve a lista de violações encontradas (vazia = passou)."""
    return evaluate_case_verbose(monkeypatch, case)["violacoes"]


def evaluate_case_verbose(monkeypatch, case: Dict[str, Any]) -> Dict[str, Any]:
    """Como evaluate_case, mas devolve trace/esperado também — usado por compute_metrics."""
    result = run_case(monkeypatch, case)
    esperado = case.get("esperado", {})
    violacoes: List[str] = []

    for check in (
        assert_tool_selection(result["trace"], esperado),
        assert_no_sql_channel(result["trace"]),
        assert_params(result["trace"], esperado),
    ):
        if check:
            violacoes.append(check)

    resposta = esperado.get("resposta", {})
    texto = result["response"]["text"]
    if resposta.get("numeros_rastreaveis"):
        check = assert_numbers_traceable(texto, result["fixture"])
        if check:
            violacoes.append(check)
    for proibido in resposta.get("proibido", []):
        if proibido.lower() in texto.lower():
            violacoes.append(f"resposta contém termo proibido {proibido!r}")
    for esperado_texto in resposta.get("contem_texto", []):
        if esperado_texto.lower() not in texto.lower():
            violacoes.append(f"resposta não contém o texto esperado {esperado_texto!r}")
    contem_data_real = resposta.get("contem_data_real")
    if contem_data_real and contem_data_real not in texto:
        violacoes.append(f"resposta não contém a data real esperada {contem_data_real!r}")

    ground_truth = esperado.get("ground_truth")
    if ground_truth:
        check = assert_ground_truth(result["fixture"], ground_truth)
        if check:
            violacoes.append(check)

    return {"violacoes": violacoes, "trace": result["trace"], "esperado": esperado}


# ─── métricas agregadas e gates de CI (§6.4) ────────────────────────


def compute_metrics(per_case: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    """
    `per_case`: {case_id: {"trace": [...], "esperado": {...}, "violacoes": [...]}}.
    No modo offline todo caso deve_passar=true passa por construção (o
    script representa o comportamento correto) — os gates ficam
    estruturalmente triviais até o modo live existir, mas a função é a
    mesma que vai medir o modelo de verdade quando ele for ligado.
    """
    tool_ok = param_ok = faith_ok = 0
    total_steps = 0
    n = len(per_case) or 1
    for data in per_case.values():
        trace, esperado, violacoes = data["trace"], data["esperado"], data["violacoes"]
        total_steps += len(trace)
        if not any("não foi chamada" in v or "tool proibida" in v or "esperava zero" in v for v in violacoes):
            tool_ok += 1
        if not any("params" in v for v in violacoes):
            param_ok += 1
        if not any("rastreável" in v or "diverge do ground truth" in v for v in violacoes):
            faith_ok += 1
    return {
        "tool_selection_accuracy": round(100.0 * tool_ok / n, 2),
        "param_accuracy": round(100.0 * param_ok / n, 2),
        "faithfulness": round(100.0 * faith_ok / n, 2),
        "steps_por_pergunta": round(total_steps / n, 2),
    }
