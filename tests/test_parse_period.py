"""_parse_period: rejeita período incompleto/inválido em vez de cair em "hoje"."""
import pytest
from fastapi import HTTPException

from api.routers.dashboard import _parse_period


def test_sem_datas_continua_significando_hoje():
    assert _parse_period(None, None) == (None, None)
    assert _parse_period("", "") == (None, None)


def test_periodo_completo_vira_intervalo_exclusivo():
    assert _parse_period("2026-06-01", "2026-06-30") == ("2026-06-01", "2026-07-01")


@pytest.mark.parametrize(
    "df,dt",
    [("2026-06-01", None), (None, "2026-06-30"), ("2026-06-01", "")],
)
def test_par_incompleto_e_rejeitado(df, dt):
    """Antes devolvia (None, None) e o endpoint respondia os números de HOJE com 200."""
    with pytest.raises(HTTPException) as exc:
        _parse_period(df, dt)

    assert exc.value.status_code == 400


@pytest.mark.parametrize("df,dt", [("2026-13-01", "2026-06-30"), ("ontem", "hoje")])
def test_data_invalida_e_rejeitada(df, dt):
    with pytest.raises(HTTPException) as exc:
        _parse_period(df, dt)

    assert exc.value.status_code == 400


def test_intervalo_invertido_e_corrigido():
    """Antes virava DT_EMISSAO >= '20260731' AND < '20260702' -> R$ 0,00 como fato."""
    assert _parse_period("2026-07-31", "2026-07-01") == ("2026-07-01", "2026-08-01")
