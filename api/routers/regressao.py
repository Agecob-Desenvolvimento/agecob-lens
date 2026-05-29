"""
POST /regressao/agentes

Receives agent scatter-point data and returns scikit-learn regression
results for 5 models with cross-validation (70/30 split).
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Request

from core.utils.response_envelope import build_response_envelope
from dominios.regressao.modelos import fit_all_models, regression_response_to_dict

router = APIRouter(prefix="/regressao")


@router.post("/agentes")
async def agent_regression(request: Request) -> Dict[str, Any]:
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
    body = await request.json()
    pontos: List[Dict[str, Any]] = body.get("pontos", [])

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
