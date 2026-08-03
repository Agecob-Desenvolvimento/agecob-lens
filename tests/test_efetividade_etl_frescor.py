"""Frescor por chave no ETL de efetividade.

Regressão: `_store.update(results)` só mescla as chaves que deram certo, então uma
série que falha mantém as linhas da rodada anterior — mas `_last_run` era
atualizado incondicionalmente. A página servia número de ontem com carimbo de
agora e `errors: []`, indefinidamente, porque o retry horário falhava igual.
"""
import pytest

from dominios.efetividade import etl as etl_mod
from dominios.efetividade.etl import EfetividadeETL


@pytest.fixture
def etl(monkeypatch):
    monkeypatch.setattr(etl_mod, "_EF_DB_VARIANTS", ["todos"])
    return EfetividadeETL()


def _builders(monkeypatch, chaves):
    monkeypatch.setattr(etl_mod, "_EF_BUILDER_MAP", {k: (lambda _v, _k=k: _k) for k in chaves})


def _relogio(monkeypatch, instante: float):
    """Relógio controlado: no Windows time.time() tem ~15ms de resolução e duas
    rodadas seguidas cairiam no mesmo tick, mascarando o avanço do carimbo."""
    monkeypatch.setattr(etl_mod.time, "time", lambda: instante)


def _run_query(resultado_por_chave):
    def _fn(query, database_name, params=None, run_id=None, context="unknown"):
        valor = resultado_por_chave[query]
        if isinstance(valor, Exception):
            raise valor
        return valor

    return _fn


def test_chave_que_falha_nao_ganha_carimbo_novo(etl, monkeypatch):
    _builders(monkeypatch, ["boa", "ruim"])

    _relogio(monkeypatch, 1000.0)
    monkeypatch.setattr(etl_mod, "run_query", _run_query({"boa": [{"v": 1}], "ruim": [{"v": 9}]}))
    etl.run()
    _, carimbo_inicial_ruim, _ = etl.get_key_state("ruim:todos")

    # segunda rodada, uma hora depois: 'ruim' passa a falhar
    _relogio(monkeypatch, 4600.0)
    monkeypatch.setattr(etl_mod, "run_query", _run_query({"boa": [{"v": 2}], "ruim": RuntimeError("deadlock")}))
    etl.run()

    rows_boa, carimbo_boa, erro_boa = etl.get_key_state("boa:todos")
    rows_ruim, carimbo_ruim, erro_ruim = etl.get_key_state("ruim:todos")

    assert rows_boa == [{"v": 2}] and erro_boa is None
    assert carimbo_boa == 4600.0  # a que funcionou avançou

    assert rows_ruim == [{"v": 9}], "linhas antigas continuam servidas (esperado)"
    assert carimbo_ruim == carimbo_inicial_ruim, "carimbo NÃO pode avançar numa falha"
    assert "deadlock" in erro_ruim


def test_rodada_totalmente_falha_nao_conta_como_refresh(etl, monkeypatch):
    _builders(monkeypatch, ["boa"])

    monkeypatch.setattr(etl_mod, "run_query", _run_query({"boa": [{"v": 1}]}))
    etl.run()
    primeiro = etl.get_last_run()

    monkeypatch.setattr(etl_mod, "run_query", _run_query({"boa": RuntimeError("banco fora")}))
    etl.run()

    assert etl.get_last_run() == primeiro


def test_chave_que_volta_a_funcionar_limpa_o_erro(etl, monkeypatch):
    _builders(monkeypatch, ["boa"])

    monkeypatch.setattr(etl_mod, "run_query", _run_query({"boa": RuntimeError("timeout")}))
    etl.run()
    monkeypatch.setattr(etl_mod, "run_query", _run_query({"boa": [{"v": 3}]}))
    etl.run()

    rows, carimbo, erro = etl.get_key_state("boa:todos")
    assert rows == [{"v": 3}]
    assert erro is None
    assert carimbo is not None
