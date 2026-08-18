import json
import os
import threading
import time
from typing import Any, Dict, Optional

import config.settings as settings

_LOG_CLEANUP_THREAD_STARTED = False
_SENTRY_INITIALIZED = False


def _init_sentry() -> None:
    """Liga captura de erros/perf no Sentry. Sem SENTRY_DSN, vira no-op."""
    global _SENTRY_INITIALIZED
    if not settings.SENTRY_DSN or _SENTRY_INITIALIZED:
        return
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.APP_ENV,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        enable_logs=settings.SENTRY_ENABLE_LOGS,
    )
    _SENTRY_INITIALIZED = True


def _sentry_log(level: str, message: str, **attributes: Any) -> None:
    """Log estruturado no Sentry (se ligado). level: debug/info/warning/error/fatal."""
    if not _SENTRY_INITIALIZED:
        return
    import sentry_sdk

    getattr(sentry_sdk.logger, level)(message, attributes=attributes)


def _sentry_metric(kind: str, name: str, value: float, unit: str = "none", **attributes: Any) -> None:
    """Metrica trace-connected no Sentry (se ligado). kind: count/gauge/distribution."""
    if not _SENTRY_INITIALIZED:
        return
    import sentry_sdk

    getattr(sentry_sdk.metrics, kind)(name, value, unit=unit, attributes=attributes)


def _capture_exception(exc: BaseException, run_id: Optional[str] = None) -> None:
    """Envia excecao ao Sentry (se ligado) e registra no NDJSON de agente."""
    if _SENTRY_INITIALIZED:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            if run_id:
                scope.set_tag("run_id", run_id)
            sentry_sdk.capture_exception(exc)
    _agent_ndjson(
        "OBS",
        "agent_logger.py:_capture_exception",
        "unhandled_exception",
        {"exc_type": type(exc).__name__, "exc_message": str(exc)},
        run_id=run_id,
    )


def _agent_ndjson(
    hypothesis_id: str,
    location: str,
    message: str,
    data: Dict[str, Any],
    run_id: Optional[str] = None,
) -> None:
    if not settings.ENABLE_AGENT_TELEMETRY:
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
        os.makedirs(settings.LOG_DIR, exist_ok=True)
        with open(settings._AGENT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _truncate_agent_log_file() -> None:
    if not settings.ENABLE_AGENT_TELEMETRY:
        return
    try:
        os.makedirs(settings.LOG_DIR, exist_ok=True)
        with open(settings._AGENT_LOG_PATH, "w", encoding="utf-8"):
            pass
    except OSError:
        pass


def _agent_log_cleanup_loop() -> None:
    while True:
        time.sleep(settings.LOG_CLEANUP_INTERVAL_SECONDS)
        _truncate_agent_log_file()


def _start_agent_log_cleanup_worker() -> None:
    if not settings.ENABLE_AGENT_TELEMETRY:
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
