"""
POST /regressao/agentes

Receives agent scatter-point data and returns scikit-learn regression
results for 5 models with cross-validation (70/30 split).
"""

from typing import Any, Dict, List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.utils.response_envelope import build_response_envelope
from dominios.regressao.modelos import fit_all_models, regression_response_to_dict

router = APIRouter(prefix="/regressao")

# Teto do corpo. Antes nao havia limite algum: nem no numero de pontos nem no
# tamanho do body lido por request.json().
MAX_PONTOS = 5000


class RegressaoRequest(BaseModel):
    pontos: List[Dict[str, Any]] = Field(default_factory=list, max_length=MAX_PONTOS)


# def (nao async): fit_all_models e trabalho sincrono de numpy/sklearn. Como async,
# rodava na thread do event loop e congelava TODAS as requisicoes daquele worker
# ate terminar. Sendo def, o FastAPI despacha para o threadpool.
@router.post("/agentes")
def agent_regression(body: RegressaoRequest) -> Dict[str, Any]:
    """
    Receive agent performance data, fit 5 regression models using scikit-learn,
    and return structured results.

    Request body:
    {
        "pontos": [
            {
                "id": "...",
                "nome": "...",
                "eficiencia": 0.45,
                "valor": 120000,
                "acionamentos": 420,
                "contatos": 380,
                "cpc": 90.5,
                "conversao": 4.3
            }
        ]
    }

    Response: see RegressionResponse in dominios/regressao/modelos.py
    """
    pontos: List[Dict[str, Any]] = body.pontos

    if not pontos:
        return build_response_envelope(
            [],
            sources=["regressao"],
            errors=[{"message": "Nenhum ponto recebido."}],
        )

    try:
        result = fit_all_models(pontos)
        response_dict = regression_response_to_dict(result)

        # Wrap in standard envelope with data as a single-item array
        return build_response_envelope(
            [response_dict],
            sources=["regressao"],
        )
    except Exception as exc:
        return build_response_envelope(
            [],
            sources=["regressao"],
            errors=[{"message": f"Erro na regressão: {str(exc)}"}],
        )
