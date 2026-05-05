import json
import os
import threading
import time
from typing import Any, Dict, Optional

import config.settings as settings

_LOG_CLEANUP_THREAD_STARTED = False


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
