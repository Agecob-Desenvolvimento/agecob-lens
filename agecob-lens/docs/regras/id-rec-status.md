# ID_REC_STATUS — Enum REC_MASTER

Lookup oficial da coluna `REC_MASTER.ID_REC_STATUS`. Source of truth pra qualquer filtro/agregação envolvendo status de acordo.

---

## Enum

| ID | DESCR | Semântica de negócio |
|---|---|---|
| 1  | ATIVO | Acordo firme, aguardando primeiro pagamento. |
| 2  | QUEBRA | Cliente não pagou e acordo foi cancelado. |
| 3  | BAIXA POR PAGAMENTO | Acordo quitado/pago. |
| 4  | A ENVIAR | Registrado, ainda não processado pelo sistema. |
| 5  | PENDENTE | Aguardando validação interna. |
| 6  | APROVADO | Passou por alçada de aprovação de desconto. |
| 7  | REJEITADO | Supervisor ou banco negou a proposta. |
| 8  | PROPOSTA | Simulação. **Não conta como meta.** |
| 9  | BAIXA MANUAL | Administrativo confirmou pagamento manualmente. |
| 10 | QUEBRA AUTOMÁTICA | Sistema cancelou por estouro de carência. |
| 11 | EXCEÇÃO | Negociação fora da regra padrão (aguarda aprovação do banco). |
| 12 | BAIXA PAGTO AVULSO | Cliente pagou valor diferente do boleto. |

---

## Constantes derivadas (usadas no backend `config/settings.py`)

```python
STATUS_APROVADOS = (1, 3, 12)         # ATIVO + BAIXA POR PAGAMENTO + BAIXA PAGTO AVULSO
STATUS_EXCECAO   = (5,)               # PENDENTE no enum — chamado "Exceção" pelo negócio
STATUS_REJEITADO = (7,)               # REJEITADO (supervisor/banco negou)
STATUS_QUEBRADO  = (2,)               # QUEBRA
STATUS_QUEBRA_AUTOMATICA = (10,)      # QUEBRA AUTOMÁTICA (estouro de carência)
STATUS_GERADOS   = (1, 2, 3, 10, 12)  # VALORES GERADOS = aprovados + quebras
STATUS_UNIVERSO_ACORDOS = (1, 2, 3, 5, 10, 12)  # gerados + exceção (pré-filtro CTE)
```

- **Aprovados** (1, 3, 12) = acordos considerados válidos como meta.
- **Gerados** (1, 2, 3, 10, 12) = **base dos KPIs de valor gerado** (valor_acordos,
  1ª parcela, qtd_acordos, ticket) e dos boletos (conversão/efetividade). Um acordo
  firmado hoje conta no valor gerado **mesmo que depois quebre** (QUEBRA=2) ou seja
  cancelado por carência (QUEBRA AUTOMÁTICA=10). Quebrar é desfecho posterior, não
  apaga a geração. Conversão/efetividade passam a refletir as quebras (boleto de
  quebra entra no denominador de emitidos, nunca no de pagos → corrige inflação).
- **Exceção** = ID `5` (`PENDENTE` no enum). A operação chama de "Exceção" qualquer acordo aguardando validação interna — distinto do ID `11` (`EXCEÇÃO` no enum literal, que NÃO é o que o negócio considera "exceção" nos KPIs).
- **Rejeitado** (7) = supervisor/banco negou — usado em `excecoes-por-portfolio` companion chart.
- **Universo de acordos** = união aprovados + exceção — base de KPIs envolvendo acordos.

> ⚠️ Atenção à divergência: o enum literal nomeia `11 = EXCEÇÃO`, mas a regra de negócio do dashboard usa `5 = PENDENTE` como "Exceção". Não confundir.

---

## Convenção de primeira parcela

`PARCELA = 0` é a **primeira parcela** em COBweb (não `PARCELA = 1`). Não "normalizar" esse zero.

---

## Notas operacionais

- ID 8 (PROPOSTA) explicitamente **não conta como meta** — é simulação.
- IDs 4, 6, 9, 11 (a enviar, aprovado-alçada, baixa manual, exceção-enum) **não entram** em KPIs de geração.
- IDs 2 e 10 (QUEBRA e QUEBRA AUTOMÁTICA) representam acordos cancelados, **mas
  contam em STATUS_GERADOS** (valores gerados) — ver bloco de constantes acima.
  Continuam disponíveis isolados para análise de "colchão"/quebra rate
  (`quebrados-por-portfolio` usa só status 2).
