"""Sentry init hardening — audit 2026-09-03, ranks 1/5/6.

Regression guard for the CRITICAL leak: `sentry_sdk.init` must disable frame
locals and request bodies, so a captured exception never carries the DB
password, debtor CPF or the API token. Also rank 6: a malformed DSN must not
propagate out of `_init_sentry` and abort API boot.

conftest.py stubs `_init_sentry` to a no-op for the whole suite, so this reloads
the module to exercise the real function against a fake `sentry_sdk`, then
restores the stub so later tests stay offline.
"""
import importlib
import sys
import types

import pytest

import config.settings as settings
import core.telemetry.agent_logger as agent_logger


@pytest.fixture
def real_init(monkeypatch):
    """Real `_init_sentry` with a fake `sentry_sdk`; `captured` holds init kwargs."""
    captured = {}

    fake = types.ModuleType("sentry_sdk")
    fake.init = lambda **kwargs: captured.update(kwargs)

    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)
    monkeypatch.setattr(settings, "SENTRY_DSN", "https://k@o1.ingest.us.sentry.io/1")

    mod = importlib.reload(agent_logger)
    mod._SENTRY_INITIALIZED = False
    try:
        yield mod, captured, fake
    finally:
        importlib.reload(agent_logger)._init_sentry = lambda: None


def test_frame_locals_and_request_body_are_disabled(real_init):
    mod, captured, _ = real_init

    mod._init_sentry()

    assert captured["include_local_variables"] is False
    assert captured["max_request_body_size"] == "never"


def test_malformed_dsn_does_not_propagate(real_init):
    mod, _, fake = real_init

    def _boom(**_kwargs):
        raise ValueError("BadDsn: Invalid project in DSN")

    fake.init = _boom

    mod._init_sentry()  # must not raise

    assert mod._SENTRY_INITIALIZED is False
