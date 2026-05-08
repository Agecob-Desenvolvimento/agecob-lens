"""
Ritmo do Dia — FastAPI router (Phase 2, KNN)

Endpoint:
    GET /dashboard/ritmo-dia/{db}

db ∈ {COBwebRCBCONSUMER, COBwebRCBAUTOS, todos}

Funções obter_faixa_hoje e obter_acordos_hoje dependem do COBweb e estão
declaradas como stubs — preencher com queries reais antes do deploy.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException

from .ritmo_dia_predict import dia_em_andamento, esperado_curva_dia

router = APIRouter()

_BANCOS_VALIDOS = {'COBwebRCBCONSUMER', 'COBwebRCBAUTOS', 'todos'}


def faixa_de_dias(d: int) -> str:
    if d <= 5:
        return 'pos_batimento'
    if d <= 15:
        return 'absorcao'
    return 'basal'


def obter_dias_desde_batimento(db: str) -> int:
    """
    Consulta CARGA_LOTE do banco indicado e retorna dias desde o último
    batimento (QTD_NV_CLI > 10000). Se não houver batimento na janela,
    retornar 30 (mesma imputação do treino).

    TODO: implementar query real.
    """
    raise NotImplementedError('obter_dias_desde_batimento')


def obter_dia_semana_hoje() -> int:
    """2=seg … 6=sex (DATEPART(WEEKDAY) no SQL Server com @@DATEFIRST=7)."""
    # weekday(): seg=0…dom=6 → seg=2…sex=6
    return datetime.now().weekday() + 2


def obter_acordos_hoje(db: str) -> dict[int, int]:
    """
    Retorna {hora: qtd_acordos} para o dia atual no banco indicado.
    Filtros: ID_REC_STATUS IN (1,3,12), PARCELA = 0, hora ∈ 8..19.

    TODO: implementar query real.
    """
    raise NotImplementedError('obter_acordos_hoje')


@router.get('/dashboard/ritmo-dia/{db}')
async def ritmo_dia(db: str):
    if db not in _BANCOS_VALIDOS:
        raise HTTPException(400, f'Banco inválido: {db}')

    if not dia_em_andamento():
        return {
            'meta': {'generated_at': datetime.now().isoformat(),
                     'em_operacao': False},
            'data': {},
            'errors': ['Fora do horário operacional (seg-sex 08:00-19:30)']
        }

    dias_desde   = obter_dias_desde_batimento(db)
    faixa        = faixa_de_dias(dias_desde)
    dia_sem      = obter_dia_semana_hoje()
    reais        = obter_acordos_hoje(db)
    bandas       = esperado_curva_dia(dias_desde, dia_sem, reais)
    hora_atual   = datetime.now().hour
    acumulado    = sum(reais.get(h, 0) for h in range(8, hora_atual))

    return {
        'meta': {
            'generated_at':                datetime.now().isoformat(),
            'faixa_batimento':             faixa,
            'dias_desde_ultimo_batimento': dias_desde,
            'modelo':                      'knn_phase2',
            'em_operacao':                 True,
        },
        'data': {
            'hora_atual':       hora_atual,
            'acumulado_atual':  acumulado,
            'bandas':           bandas,
        },
        'errors': []
    }
