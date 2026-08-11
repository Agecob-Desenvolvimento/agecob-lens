"""Testes mínimos do branching de bandas em api/routers/ritmo_dia.py."""
from datetime import datetime

import pytest

from api.routers import ritmo_dia as rd


class _FrozenDT:
    def __init__(self, frozen):
        self._frozen = frozen

    def now(self):
        return self._frozen


class _FakeModel:
    def predict(self, X):
        return [5.0] * len(X)


class _FakeScaler:
    def transform(self, X):
        return X


@pytest.fixture(autouse=True)
def _stub_artifacts(monkeypatch):
    monkeypatch.setattr(
        rd,
        "_load_artifacts",
        lambda: rd.Artifacts(model=_FakeModel(), scaler=_FakeScaler()),
    )
    monkeypatch.setattr(
        rd,
        "_load_ticket_lookup",
        lambda: {"por_banco": {"COBwebRCBCONSUMER": {"tickets": 1.0}, "COBwebRCBAUTOS": {"tickets": 1.0}}},
    )
    monkeypatch.setattr(rd, "_coletar_valor_por_banco", lambda db: {})


def _freeze(monkeypatch, y, m, d, hour):
    monkeypatch.setattr(rd, "datetime", _FrozenDT(datetime(y, m, d, hour, 0, 0)))


def test_fora_de_horario(monkeypatch):
    _freeze(monkeypatch, 2026, 5, 11, 7)
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    assert resp["meta"]["em_operacao"] is False
    assert resp["data"]["bandas"] == []


def test_hora_10_classifica_bandas(monkeypatch):
    _freeze(monkeypatch, 2026, 5, 11, 10)
    monkeypatch.setattr(rd, "_coletar_dados_por_banco", lambda db: {db: (3, {8: 7, 9: 5})})
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    bandas = {b["hora"]: b for b in resp["data"]["bandas"]}
    assert bandas[8]["status"] == "acima"
    assert bandas[9]["status"] == "ok"
    assert bandas[10]["status"] == "em_andamento"
    assert bandas[11]["status"] == "futuro"
    assert bandas[19]["status"] == "futuro"
    assert resp["data"]["acumulado_atual"] == 12


def test_bandas_valor_mescladas(monkeypatch):
    _freeze(monkeypatch, 2026, 5, 11, 10)
    monkeypatch.setattr(rd, "_coletar_dados_por_banco", lambda db: {db: (3, {8: 7, 9: 5})})
    monkeypatch.setattr(rd, "_coletar_valor_por_banco", lambda db: {db: {8: 1000.0, 9: 2.0}})
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    bandas = {b["hora"]: b for b in resp["data"]["bandas"]}
    assert bandas[8]["real_valor"] == 1000.0
    assert bandas[8]["esperado_valor"] == 5.0
    assert bandas[8]["status_valor"] == "acima"
    assert bandas[9]["real_valor"] == 2.0
    assert bandas[9]["status_valor"] == "abaixo"
    assert bandas[10]["status_valor"] == "em_andamento"
    assert bandas[11]["status_valor"] == "futuro"
    assert resp["data"]["valor_acumulado_atual"] == 1002.0
    assert resp["meta"]["modelo_valor"] == "ticket_mediano_x_count_esperado"


def test_hora_8_inicio_dia(monkeypatch):
    _freeze(monkeypatch, 2026, 5, 11, 8)
    monkeypatch.setattr(rd, "_coletar_dados_por_banco", lambda db: {db: (3, {7: 0})})
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    bandas = {b["hora"]: b for b in resp["data"]["bandas"]}
    assert bandas[8]["status"] == "em_andamento"
    assert all(bandas[h]["status"] == "futuro" for h in range(9, 20))


def test_hora_19_ultima_banda(monkeypatch):
    _freeze(monkeypatch, 2026, 5, 11, 19)
    reais = {h: 5 for h in range(8, 19)}
    monkeypatch.setattr(rd, "_coletar_dados_por_banco", lambda db: {db: (3, reais)})
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    bandas = {b["hora"]: b for b in resp["data"]["bandas"]}
    assert bandas[19]["status"] == "em_andamento"
    assert all(bandas[h]["status"] == "ok" for h in range(8, 19))


def test_sem_dados_no_horario(monkeypatch):
    # Quirk atual: quando reais={}, o curto-circuito `not reais and h >= hora_atual`
    # marca a hora atual como "futuro" (e não "em_andamento"). Teste fixa esse
    # contrato — alterar exige decisão de produto.
    _freeze(monkeypatch, 2026, 5, 11, 12)
    monkeypatch.setattr(rd, "_coletar_dados_por_banco", lambda db: {db: (3, {})})
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    bandas = {b["hora"]: b for b in resp["data"]["bandas"]}
    assert all(bandas[h]["status"] == "abaixo" for h in range(8, 12))
    assert all(bandas[h]["status"] == "futuro" for h in range(12, 20))


def test_fim_de_semana(monkeypatch):
    _freeze(monkeypatch, 2026, 5, 16, 10)  # Sábado 10h
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    assert resp["meta"]["em_operacao"] is False
    assert resp["data"]["bandas"] == []


def test_domingo(monkeypatch):
    _freeze(monkeypatch, 2026, 5, 17, 10)  # Domingo 10h
    resp = rd.ritmo_dia("COBwebRCBCONSUMER")
    assert resp["meta"]["em_operacao"] is False
    assert resp["data"]["bandas"] == []
