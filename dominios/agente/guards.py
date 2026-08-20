"""
RunGuard: protocolo de runtime do loop de tools do agente (§3 do handoff
agente-tools-handoff.md) — teto de steps, memoização de chamada idêntica,
detecção de espiral A->B->A->B, wall clock, desabilitação de tool após
falhas consecutivas (P0'), cache entre requests, circuit breaker, retry com
backoff+jitter na falha (§4.2) e teto de tokens por tool result (P3,
§4.2/§5.1). Provider-agnóstico: os dois loops de agente.py (_loop_anthropic
e _loop_deepseek) passam por aqui.

Compaction de contexto (a outra metade do P3, "quando TOOL_BUDGET_TOKENS se
aproxima...") fica em agente.py — mexe na lista de mensagens do provider
(formato Anthropic vs OpenAI diverge), não é algo que este módulo, que é
provider-agnóstico por design, deveria conhecer. `RunState.budget_near_limit()`
é o sinal que os loops consultam pra decidir quando compactar.
"""
from __future__ import annotations

import hashlib
import json
import random
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable, Deque, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from dominios.agente.errors import build_tool_error

RETRY_BASE_DELAY_S = 1.0  # §4.2 do handoff: "1 retry com backoff exponencial + jitter (~1s)"
RETRY_JITTER_S = 0.3


def _retry_delay() -> float:
    return max(0.0, RETRY_BASE_DELAY_S + random.uniform(-RETRY_JITTER_S, RETRY_JITTER_S))


@dataclass(frozen=True)
class RunGuard:
    MAX_STEPS: int = 10                 # tool calls totais por request
    MAX_CHAMADAS_IDENTICAS: int = 2
    WALL_CLOCK_S: int = 90
    TOOL_RESULT_TOKEN_CAP: int = 1800   # por tool result
    TOOL_BUDGET_TOKENS: int = 15000     # soma por request — aciona compaction (agente.py)


def _canonical_args(args: Dict[str, Any]) -> str:
    return json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)


def _call_hash(tool_name: str, args: Dict[str, Any]) -> str:
    """Chave de memoização DENTRO de um request — não inclui db (constante no request para as
    tools antigas; para as novas, db já é um dos args)."""
    return hashlib.sha1(f"{tool_name}|{_canonical_args(args)}".encode("utf-8")).hexdigest()


def _cache_key(tool_name: str, db: str, date_from: str, date_to: str, args: Dict[str, Any]) -> str:
    """
    §5.1: sha1(tool|db|date_from|date_to|args_canônicos) — chave do cache
    ENTRE requests. date_from/date_to entram explícitos pelo mesmo motivo que
    db (ver docstring de _tool_result_json em agente.py): as 11 tools legadas
    não carregam o período nos args — vem do fechamento da sessão. Sem isto,
    sessão A filtrando julho podia servir o resultado de julho pra sessão B
    filtrando agosto dentro do TTL de 60s (achado #2 do review pt4).
    """
    return hashlib.sha1(f"{tool_name}|{db}|{date_from}|{date_to}|{_canonical_args(args)}".encode("utf-8")).hexdigest()


# Heurística de chars/token: 3, não 4. Conteúdo denso em número/pontuação/PT-BR
# acentuado (JSON de tool result) tokeniza mais próximo de 3 chars/token que a
# prosa em inglês — 4 subestimava o cap real (achado #10 do review pt4).
_CHARS_PER_TOKEN_ESTIMATE = 3


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN_ESTIMATE)


def _cap_tool_result(result: Any, cap_tokens: int) -> Tuple[Any, bool]:
    """
    Corta um tool result para caber no teto de tokens (RunGuard.TOOL_RESULT_TOKEN_CAP).
    Nunca corta no meio de uma estrutura: serializa inteiro, e se não coube,
    devolve um envelope de aviso com uma prévia da string — melhor isso que
    um JSON truncado no meio (quebraria o parse do lado do LLM).
    """
    serialized = json.dumps(result, ensure_ascii=False, default=str)
    if _estimate_tokens(serialized) <= cap_tokens:
        return result, False
    cap_chars = cap_tokens * _CHARS_PER_TOKEN_ESTIMATE
    return {
        "_truncado": True,
        "_aviso": f"Resultado grande (~{_estimate_tokens(serialized)} tokens) cortado para caber no orçamento.",
        "_previa": serialized[:cap_chars],
    }, True


def _infer_row_count(result: Any) -> Optional[int]:
    """
    Heurística pro campo row_count do ndjson — não todo tool result tem a
    mesma forma. meta.total_rows/total_points vem primeiro porque `data` só
    tem a página atual (detalhar_portfolio, query_kpi_historico) — len(data)
    subestimaria quando o resultado real está paginado.
    """
    if isinstance(result, dict):
        meta = result.get("meta")
        if isinstance(meta, dict):
            for key in ("total_rows", "total_points"):
                if key in meta:
                    return meta[key]
        data = result.get("data")
        if isinstance(data, list):
            return len(data)
    if isinstance(result, list):
        return len(result)
    return None


# ─── cache entre requests (§5.1) ────────────────────────────────────


class ToolCache:
    """
    Cache de tool result compartilhado ENTRE requests — diferente da
    memoização de RunState, que só vale dentro de UM request. TTL curto
    pro erro (evita martelar endpoint quebrado) e mais longo pro sucesso —
    dois TTLs distintos é por isso que isto não reusa
    core/cache/cache_manager.py (TTL único, só guarda sucesso). Sem
    single-flight: a memoização por-request já resolve o caso comum
    (mesma conversa repetindo a mesma chamada); entre requests concorrentes
    um cache miss duplicado custa 1 query a mais, não a complexidade extra.
    """

    def __init__(self) -> None:
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if expires_at < time.time():
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        if ttl_seconds <= 0:
            return
        with self._lock:
            self._store[key] = (time.time() + ttl_seconds, value)

    def reset(self) -> None:
        """Só para teste — `tool_cache` é um singleton de processo (§5.1, "entre requests")."""
        with self._lock:
            self._store.clear()


tool_cache = ToolCache()
CACHE_TTL_SUCCESS_S = 60
CACHE_TTL_ERROR_S = 8


# ─── circuit breaker entre requests (§4.2) ──────────────────────────


class CircuitBreaker:
    """
    Por tool: taxa de erro > 30% nas últimas 20 chamadas -> abre por 60s
    (mesma janela do TTL de sucesso do cache, por design). Amostra mínima
    de 5 chamadas antes de poder abrir — evita abrir com 1 falha isolada
    logo no início do histórico.
    """

    _WINDOW = 20
    _MIN_SAMPLE = 5
    _ERROR_RATE_THRESHOLD = 0.30
    _OPEN_SECONDS = 60

    def __init__(self) -> None:
        self._history: Dict[str, Deque[bool]] = {}
        self._opened_until: Dict[str, float] = {}
        self._lock = threading.Lock()

    def is_open(self, tool_name: str) -> bool:
        with self._lock:
            until = self._opened_until.get(tool_name)
            if until is None:
                return False
            if time.time() >= until:
                self._opened_until.pop(tool_name, None)
                return False
            return True

    def record(self, tool_name: str, ok: bool) -> None:
        with self._lock:
            hist = self._history.setdefault(tool_name, deque(maxlen=self._WINDOW))
            hist.append(ok)
            if len(hist) < self._MIN_SAMPLE:
                return
            error_rate = 1 - (sum(hist) / len(hist))
            if error_rate > self._ERROR_RATE_THRESHOLD:
                self._opened_until[tool_name] = time.time() + self._OPEN_SECONDS

    def reset(self) -> None:
        """Só para teste — `circuit_breaker` é um singleton de processo (§4.2, "entre requests")."""
        with self._lock:
            self._history.clear()
            self._opened_until.clear()


circuit_breaker = CircuitBreaker()


class RunState:
    """Estado mutável de UM request (1 instância por chamada a run_agent)."""

    def __init__(self, guard: RunGuard = RunGuard()) -> None:
        self.guard = guard
        self._started_at = time.monotonic()
        self.steps = 0
        self.loop_declared = False
        self.tool_budget_used = 0
        self.last_call_meta: Dict[str, Any] = {}
        self._call_counts: Dict[str, int] = {}
        self._call_cache: Dict[str, Any] = {}
        self._fail_counts: Dict[str, int] = {}
        self._disabled_tools: Set[str] = set()
        self._recent_tool_names: List[str] = []

    def wall_clock_exceeded(self) -> bool:
        return (time.monotonic() - self._started_at) >= self.guard.WALL_CLOCK_S

    def steps_exceeded(self) -> bool:
        return self.steps >= self.guard.MAX_STEPS

    def budget_near_limit(self) -> bool:
        """P3: acima de 80% do orçamento de tokens de tool results — sinal pros loops compactarem."""
        return self.tool_budget_used >= 0.8 * self.guard.TOOL_BUDGET_TOKENS

    def force_final(self) -> bool:
        """True quando o loop deve parar de chamar tools e sintetizar a resposta final."""
        return self.loop_declared or self.steps_exceeded() or self.wall_clock_exceeded()

    def _record_spiral(self, tool_name: str) -> None:
        self._recent_tool_names.append(tool_name)
        recent = self._recent_tool_names[-4:]
        if (
            len(recent) == 4
            and recent[0] == recent[2]
            and recent[1] == recent[3]
            and recent[0] != recent[1]
        ):
            self.loop_declared = True

    def dispatch(
        self,
        tool_name: str,
        args: Dict[str, Any],
        run_fn: Callable[[], Any],
        db: str = "",
        date_from: str = "",
        date_to: str = "",
    ) -> Any:
        """
        Executa (ou memoiza/cacheia) uma tool call sob o protocolo do
        RunGuard. Ordem: desabilitada (3 falhas seguidas) > breaker aberto
        (erro alto entre requests) > memoizada nesta conversa > cache entre
        requests > execução real. `db`/`date_from`/`date_to` são opcionais
        (default "") — só afetam a chave do cache entre requests; chamadas
        de teste sem eles continuam funcionando (é o mesmo em toda a
        chamada, então não muda o resultado, só o namespace do cache).
        """
        self.steps += 1
        self._record_spiral(tool_name)
        self.last_call_meta = {"step_index": self.steps, "cache_hit": False, "error_type": None, "truncated": False, "row_count": None}

        if tool_name in self._disabled_tools:
            self.last_call_meta["error_type"] = "tool_disabled"
            return build_tool_error(
                "tool_disabled",
                hint="Esta tool falhou 3 vezes seguidas nesta sessão e foi desabilitada para o restante do request.",
                user_facing="Uma das fontes de dados está indisponível no momento.",
            )

        if circuit_breaker.is_open(tool_name):
            self.last_call_meta["error_type"] = "upstream_5xx"
            return build_tool_error(
                "upstream_5xx",
                hint="Esta fonte de dados teve muitos erros recentes e está em pausa por 60s.",
                user_facing="O serviço de dados está instável no momento.",
                retryable=True,
            )

        call_hash = _call_hash(tool_name, args)
        count = self._call_counts.get(call_hash, 0) + 1
        self._call_counts[call_hash] = count

        if count > 1:
            if count >= self.guard.MAX_CHAMADAS_IDENTICAS + 1:
                self.loop_declared = True
            self.last_call_meta["cache_hit"] = True
            memoizado = self._call_cache.get(call_hash)
            self.last_call_meta["row_count"] = _infer_row_count(memoizado)
            return {
                "resultado_memoizado": memoizado,
                "nota": "Você já fez esta chamada com estes mesmos argumentos; use este resultado, não repita a chamada.",
            }

        cache_key = _cache_key(tool_name, db, date_from, date_to, args)
        cached = tool_cache.get(cache_key)
        if cached is not None:
            self.last_call_meta["cache_hit"] = True
            self.last_call_meta["row_count"] = _infer_row_count(cached)
            self._call_cache[call_hash] = cached
            self.tool_budget_used += _estimate_tokens(json.dumps(cached, ensure_ascii=False, default=str))
            return cached

        try:
            result = run_fn()
        except HTTPException:
            # §4.2 do handoff: 1 retry com backoff+jitter antes de desistir — cobre falha
            # transiente de conexão/timeout do pyodbc. run_query() (core/database/
            # query_executor.py) normaliza toda falha de rede/DB pra HTTPException
            # (504=timeout, 500=erro de driver) — é o único tipo que faz sentido
            # retentar aqui. Sucesso na retentativa não conta como falha (nem pro
            # breaker, nem pro contador de 3x seguidas).
            time.sleep(_retry_delay())
            try:
                result = run_fn()
            except Exception as exc:  # 2ª falha seguida — desiste, provider (SQL) explodiu
                self._fail_counts[tool_name] = self._fail_counts.get(tool_name, 0) + 1
                if self._fail_counts[tool_name] >= 3:
                    self._disabled_tools.add(tool_name)
                circuit_breaker.record(tool_name, ok=False)
                error_result = build_tool_error(
                    "upstream_5xx",
                    hint="janelas grandes costumam estourar; tente uma janela menor",
                    user_facing="O serviço de dados está instável no momento.",
                    error_detail=str(exc),
                )
                self.last_call_meta["error_type"] = "upstream_5xx"
                self._call_cache[call_hash] = error_result
                tool_cache.set(cache_key, error_result, CACHE_TTL_ERROR_S)
                return error_result
        except Exception as exc:
            # Erro determinístico (bug de código — KeyError/TypeError/etc. fora de
            # run_query, que já normaliza suas próprias falhas pra HTTPException
            # acima). Retentar não ajuda: vai falhar do mesmo jeito de novo, só
            # come ~1s de wall clock à toa. Taxonomia própria (não upstream_5xx)
            # pro LLM não receber a dica "tente janela menor", que não faz
            # sentido pra um bug de código (achado #9 do review pt4).
            self._fail_counts[tool_name] = self._fail_counts.get(tool_name, 0) + 1
            if self._fail_counts[tool_name] >= 3:
                self._disabled_tools.add(tool_name)
            circuit_breaker.record(tool_name, ok=False)
            error_result = build_tool_error(
                "internal_error",
                hint="Erro interno ao processar esta consulta.",
                user_facing="Não foi possível concluir esta consulta agora.",
                error_detail=str(exc),
                retryable=False,
            )
            self.last_call_meta["error_type"] = "internal_error"
            self._call_cache[call_hash] = error_result
            tool_cache.set(cache_key, error_result, CACHE_TTL_ERROR_S)
            return error_result

        circuit_breaker.record(tool_name, ok=True)
        result, truncated = _cap_tool_result(result, self.guard.TOOL_RESULT_TOKEN_CAP)
        self.last_call_meta["truncated"] = truncated
        self.last_call_meta["row_count"] = _infer_row_count(result)
        self.tool_budget_used += _estimate_tokens(json.dumps(result, ensure_ascii=False, default=str))
        self._fail_counts[tool_name] = 0
        self._call_cache[call_hash] = result
        tool_cache.set(cache_key, result, CACHE_TTL_SUCCESS_S)
        return result
