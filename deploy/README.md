# Deploy — Ritmo do Dia (KNN Phase 2)

Pasta com tudo o que vai pro projeto do dashboard. Copiar `deploy/*` para a árvore
do backend e seguir os passos abaixo.

## Conteúdo

| Arquivo | Função |
|---|---|
| `knn_phase2_model.joblib`  | KNN k=10 treinado em 130 dias |
| `knn_phase2_scaler.joblib` | StandardScaler ajustado em 130 dias |
| `ritmo_dia_predict.py`     | Loader + `esperado_banda()` / `esperado_curva_dia()` |
| `ritmo_dia_router.py`      | FastAPI router `GET /dashboard/ritmo-dia/{db}` |

## Layout sugerido no backend

```
backend/
├── modelos/
│   ├── knn_phase2_model.joblib
│   └── knn_phase2_scaler.joblib
├── routers/
│   └── ritmo_dia_router.py
├── services/
│   └── ritmo_dia_predict.py
└── main.py
```

Apontar `RITMO_DIA_MODEL_DIR=backend/modelos` (env var) ou ajustar `_BASE_DIR`
em `ritmo_dia_predict.py`.

## Passos de integração

1. Copiar arquivos respeitando o layout acima.
2. Instalar dependências: `pip install fastapi joblib numpy scikit-learn==1.8.0`.
3. Implementar os stubs em `ritmo_dia_router.py`:
   - `obter_dias_desde_batimento(db)` — query em `CARGA_LOTE` (QTD_NV_CLI > 10000)
   - `obter_acordos_hoje(db)` — query em `REC_MASTER` (ID_REC_STATUS IN (1,3,12), PARCELA = 0, hora ∈ 8..19)
4. Registrar router em `main.py`:
   ```python
   from routers.ritmo_dia_router import router as ritmo_dia_router
   app.include_router(ritmo_dia_router)
   ```
5. Testar local: `curl localhost:8000/dashboard/ritmo-dia/todos`.

## Contrato dos stubs

```python
def obter_dias_desde_batimento(db: str) -> int:
    """
    Retorna dias corridos desde o último batimento do banco. Imputar 30
    quando não houver batimento na janela (mesma regra do treino).
    """

def obter_acordos_hoje(db: str) -> dict[int, int]:
    """
    Retorna {hora: qtd_acordos} para o dia atual.
    Filtros: ID_REC_STATUS IN (1,3,12), PARCELA = 0, hora ∈ 8..19.
    Para db='todos': UNION CONSUMER + AUTOS.
    """
```

## Resposta do endpoint

```json
{
  "meta": {
    "generated_at": "2026-05-08T11:23:00",
    "faixa_batimento": "basal",
    "dias_desde_ultimo_batimento": 8,
    "modelo": "knn_phase2",
    "em_operacao": true
  },
  "data": {
    "hora_atual": 11,
    "acumulado_atual": 20,
    "bandas": [
      {"hora": 8,  "esperado": 3, "real": 2,  "delta": -1, "status": "abaixo"},
      {"hora": 9,  "esperado": 4, "real": 5,  "delta":  1, "status": "acima"},
      {"hora": 10, "esperado": 4, "real": 13, "delta":  9, "status": "acima"},
      {"hora": 11, "esperado": 4, "real": null, "delta": null, "status": "em_andamento"},
      {"hora": 12, "esperado": 5, "real": null, "delta": null, "status": "futuro"}
    ]
  },
  "errors": []
}
```

## Reprodução / retreino

Para regenerar `knn_phase2_model.joblib` + `knn_phase2_scaler.joblib`:

```bash
cd <repo raiz>
py -3.14 knn_phase2.py
```

Saídas em raiz: `knn_phase2_model.joblib`, `knn_phase2_scaler.joblib`,
`knn_phase2_validation.csv`. Copiar os dois `.joblib` para esta pasta.

## Critérios de promoção (validados em 2026-05-08)

| Critério | Limiar | Resultado |
|---|---|---|
| MAE absoluto holdout | < 8.5 | 3.13 ✅ |
| Melhora vs Phase 1 (holdout) | ≥ 10% | −21.6% ✅ |
| Acerto direcional | > 65% | 81.3% ✅ |
| Nenhum fold com piora > 0.10 abs **e** > 3% rel | — | fold 1: +0.04 / +2.9% ✅ |

Detalhes completos: `Adendo Fase 2 — KNN promovido.md` (raiz do repo).

## Observações

- `acumulado_lag` em `esperado_banda()` exige o cumulativo ao **fim** da hora H-1.
  Para hora=8 (primeira), passar 0. `esperado_curva_dia()` já cuida disso ao
  iterar 8h–19h e somar reais conforme avança.
- Cache: o modelo é carregado uma vez por processo (lazy load em `_load()`).
  Não há TTL — o joblib só é relido quando o processo reinicia.
- Para retreino periódico, agendar `knn_phase2.py` (ex.: cron mensal) e copiar
  os artefatos atualizados para `backend/modelos/` antes de reiniciar o serviço.
