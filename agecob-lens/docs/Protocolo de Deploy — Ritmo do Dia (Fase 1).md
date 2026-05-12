1. Estado atual do projeto
Dataset exploratório d.csv cobre de 2025-11-07 a 2026-05-07, mas será abandonado para produção.

Script teste_sem_faixa_abril.py validou que, para janelas curtas (< 30 dias), o modelo sem faixa é melhor. Para o dataset completo (≥ 90 dias), a faixa é relevante.

Decisão: usar lookup com faixa para o deploy, pois o volume de dados pós-abril já ultrapassa 30 dias úteis rapidamente (e continuará crescendo).

Artefatos do KNN (fase 2) estão guardados e não serão utilizados agora.

2. Script de retreino (retrain_lookup.py)
Este script será executado periodicamente (ex.: mensal) para gerar os arquivos CSV que o endpoint consumirá.

2.1 Consulta SQL base
A consulta retorna, para cada banco, os acordos por dia/hora, com a faixa de batimento do dia.

sql
WITH Batimentos AS (
    SELECT DISTINCT CAST([DATA] AS DATE) AS dia_batimento
    FROM COBwebRCBCONSUMER..CARGA_LOTE WITH (NOLOCK)
    WHERE ID_USUARIO = 1 AND QTD_NV_CLI > 10000
      AND [DATA] >= '2026-04-07'   -- apenas batimentos a partir da data de corte
),
AcordosHora AS (
    SELECT
        CAST(DT_EMISSAO AS DATE) AS dia,
        DATEPART(HOUR, DT_EMISSAO) AS hora,
        COUNT(DISTINCT NR_RECEBIMENTO) AS qtd_acordos
    FROM COBwebRCBCONSUMER..REC_MASTER WITH (NOLOCK)
    WHERE DT_EMISSAO >= '2026-04-07'   -- data de corte
      AND ID_REC_STATUS IN (1, 3, 12)
      AND PARCELA = 0
      AND DATEPART(HOUR, DT_EMISSAO) BETWEEN 8 AND 19
      AND DATEPART(WEEKDAY, DT_EMISSAO) NOT IN (1, 7)   -- ajuste conforme @@DATEFIRST
    GROUP BY CAST(DT_EMISSAO AS DATE), DATEPART(HOUR, DT_EMISSAO)
),
TotaisDia AS (
    SELECT
        dia,
        hora,
        qtd_acordos,
        SUM(qtd_acordos) OVER (PARTITION BY dia) AS total_dia,
        SUM(qtd_acordos) OVER (PARTITION BY dia ORDER BY hora
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado_ate_hora
    FROM AcordosHora
)
SELECT
    'CONSUMER' AS banco_origem,
    t.dia,
    t.hora,
    DATEPART(WEEKDAY, t.dia) AS dia_semana,
    t.total_dia,
    t.acumulado_ate_hora,
    b.dia_batimento AS data_ultimo_batimento,
    DATEDIFF(DAY, b.dia_batimento, t.dia) AS dias_desde_ultimo_batimento,
    CASE
        WHEN DATEDIFF(DAY, b.dia_batimento, t.dia) BETWEEN 0 AND 5  THEN 'pos_batimento'
        WHEN DATEDIFF(DAY, b.dia_batimento, t.dia) BETWEEN 6 AND 15 THEN 'absorcao'
        ELSE 'basal'
    END AS faixa_batimento
FROM TotaisDia t
OUTER APPLY (
    SELECT TOP 1 dia_batimento
    FROM Batimentos b
    WHERE b.dia_batimento <= t.dia
    ORDER BY b.dia_batimento DESC
) b
WHERE t.total_dia > 0
ORDER BY t.dia, t.hora;
Repetir a mesma estrutura para COBwebRCBAUTOS (ou unificar com UNION ALL, trocando o banco).

2.2 Código Python do script
python
import pandas as pd
import pyodbc

# Configuração da conexão (preencher)
conn_str = 'DRIVER={SQL Server};SERVER=...;DATABASE=...;UID=...;PWD=...'

def gerar_lookups():
    with pyodbc.connect(conn_str) as conn:
        # Executar query para CONSUMER e AUTOS (pode ser UNION ALL diretamente)
        df = pd.read_sql(sql_consumer_autos, conn)  # sql_consumer_autos é a query acima com UNION
        # Fechar conexão automaticamente com 'with'

    # Calcular acordos_banda por banco e dia
    df = df.sort_values(['banco_origem','dia','hora'])
    df['acordos_banda'] = (
        df.groupby(['banco_origem','dia'])['acumulado_ate_hora']
          .diff().fillna(df['acumulado_ate_hora'])
          .clip(lower=0).astype(int)
    )

    # Lookup por banco
    for banco in ['CONSUMER', 'AUTOS']:
        subset = df[df['banco_origem'] == banco]
        lookup = (
            subset.groupby(['hora', 'faixa_batimento'])['acordos_banda']
                  .median().round().astype(int)
        )
        lookup.to_csv(f'modelos/lookup_bandas_{banco}.csv', header=['esperado'])

    # Lookup consolidado (todos)
    lookup_todos = (
        df.groupby(['hora', 'faixa_batimento'])['acordos_banda']
          .median().round().astype(int)
    )
    lookup_todos.to_csv('modelos/lookup_bandas_todos.csv', header=['esperado'])

if __name__ == '__main__':
    gerar_lookups()
Pasta de saída: backend/modelos/ (criar se não existir).

3. Implementação do endpoint /dashboard/ritmo-dia/{db}
3.1 Estrutura de cache
O endpoint carrega os CSVs em cache com TTL de 24 horas.

Suporta três valores de {db}: COBwebRCBCONSUMER, COBwebRCBAUTOS, todos.

3.2 Código do router (esqueleto)
python
# routers/ritmo_dia.py
import pandas as pd
from datetime import datetime, date, timedelta
from fastapi import APIRouter, HTTPException
from typing import Optional
import pytz  # opcional

router = APIRouter()

_LOOKUPS = {
    "COBwebRCBCONSUMER": None,
    "COBwebRCBAUTOS": None,
    "todos": None
}
_CACHE_UPDATED: Optional[datetime] = None
_TTL = 86400

def _carregar_lookups():
    global _LOOKUPS, _CACHE_UPDATED
    agora = datetime.now()
    if _CACHE_UPDATED and (agora - _CACHE_UPDATED).total_seconds() < _TTL:
        return
    for chave in _LOOKUPS:
        nome = f"lookup_bandas_{chave}.csv" if chave != "todos" else "lookup_bandas_todos.csv"
        df = pd.read_csv(f"modelos/{nome}")
        lookup_dict = {}
        for _, row in df.iterrows():
            lookup_dict[(int(row['hora']), row['faixa_batimento'])] = int(row['esperado'])
        _LOOKUPS[chave] = lookup_dict
    _CACHE_UPDATED = agora

# Funções auxiliares (a implementar)
def obter_faixa_hoje(db: str) -> tuple[str, int]:
    """Retorna (faixa, dias_desde). Consultar CARGA_LOTE do banco real."""
    # ...
    return "basal", 8

def obter_acordos_hoje(db: str) -> dict:
    """Retorna {hora: acordos_reais} para o dia atual."""
    # ...
    return {8: 2, 9: 5, 10: 1}

@router.get("/dashboard/ritmo-dia/{db}")
async def ritmo_dia(db: str):
    if db not in _LOOKUPS:
        raise HTTPException(400, "Banco inválido")
    _carregar_lookups()
    lookup_atual = _LOOKUPS[db]
    faixa, dias_desde = obter_faixa_hoje(db)
    hora_atual = datetime.now().hour
    real_por_hora = obter_acordos_hoje(db)

    bandas = []
    for h in range(8, 20):
        esperado = lookup_atual.get((h, faixa), 0)
        real = real_por_hora.get(h)
        if h < hora_atual:
            real = real or 0
            delta = real - esperado
            status = "acima" if delta > 0 else ("abaixo" if delta < 0 else "ok")
        elif h == hora_atual:
            real, delta, status = None, None, "em_andamento"
        else:
            real, delta, status = None, None, "futuro"
        bandas.append({"hora": h, "esperado": esperado, "real": real, "delta": delta, "status": status})

    return {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "faixa_batimento": faixa,
            "dias_desde_ultimo_batimento": dias_desde
        },
        "data": {"hora_atual": hora_atual, "bandas": bandas},
        "errors": []
    }
3.3 Registro no main.py
python
from routers import ritmo_dia
app.include_router(ritmo_dia.router)
4. Frontend — Card no Index.tsx
4.1 Requisição
tsx
const [ritmo, setRitmo] = useState<any>(null);
const selectedDb = "todos"; // ou controlado por seletor

useEffect(() => {
  fetch(`/dashboard/ritmo-dia/${selectedDb}`)
    .then(r => r.json())
    .then(j => { if (!j.errors?.length) setRitmo(j.data); });
}, [selectedDb]);
4.2 Renderização
tsx
{ritmo && (
  <Card>
    <CardHeader>
      <CardTitle>Ritmo do Dia</CardTitle>
      <CardDescription>Faixa: {ritmo.faixa_batimento} · dia {ritmo.dias_desde_ultimo_batimento}</CardDescription>
    </CardHeader>
    <CardContent>
      {ritmo.bandas.map(b => (
        <div key={b.hora} className="flex gap-2">
          <span>{b.hora}h</span>
          <span>esp:{b.esperado}</span>
          <span>real:{b.real ?? '—'}</span>
          <span>{b.status === 'acima' ? '🟢' : b.status === 'abaixo' ? '🔴' : b.status === 'ok' ? '🟡' : '⏳'}</span>
        </div>
      ))}
    </CardContent>
  </Card>
)}
5. Cronograma de execução
Etapa	Responsável	Status
1. Preparar script SQL e Python (retrain_lookup.py)	Isaque	A fazer
2. Executar script uma vez para gerar CSVs iniciais (base abril em diante)	Isaque	A fazer
3. Criar ritmo_dia.py com cache e mocks para testes locais	Isaque	A fazer
4. Implementar funções obter_faixa_hoje e obter_acordos_hoje com queries reais	Isaque	A fazer
5. Conectar frontend e validar card no dev	Isaque	A fazer
6. Testar com dados reais durante um dia	Isaque	A fazer
7. (Produção) Agendar script de retreino (cron/APScheduler)	Isaque/DevOps	Futuro (após validação)
6. Observações importantes
A data de corte 7/4/2026 está fixa no script SQL. Conforme o tempo passa, o modelo usará cada vez mais dados (a partir dessa data).

O modelo usa a faixa_batimento porque o volume de dados pós-abril já é suficiente (>30 dias úteis em poucas semanas).

A regra de fallback (sem faixa) para janelas < 30 dias está documentada, mas não será necessária porque a janela mínima será mantida >= 30 dias com o crescimento natural.

O endpoint todos utiliza a agregação dos dois bancos, como definido.

Esse é o mapa completo. Com ele, você pode começar imediatamente pelo passo 1 (script de retreino) e avançar. Qualquer dúvida sobre as queries de obter_faixa_hoje ou obter_acordos_hoje, é só pedir.Estamos prontos para executar. Seu protocolo agora está completo e reflete exatamente o estado atual: