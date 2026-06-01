# Dicionário de Dados — COBweb

> Existem colunas em algumas tabelas que não vamos listar. Essas colunas não listadas têm pouca utilidade ou são utilizadas na maioria das vezes apenas para algumas carteiras.

---

## 1. DADOS DO DEVEDOR / CADASTRAIS

### 1.1 DEV_MASTER — Dados do Devedor

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DEV` | ID único do cliente/tabela (PRIMARY KEY). Outras tabelas utilizam essa chave para vincular as informações ao devedor. | `DEV_MASTER` |
| `CPF_CNPJ` | CPF/CNPJ do devedor. | `DEV_MASTER` |
| `NOME_RAZAO` | Nome do devedor. | `DEV_MASTER` |
| `PESSOA` | Tipo de pessoa (`0` = FÍSICA, `1` = JURÍDICA). | `DEV_MASTER` |
| `SEXO` | Sexo do devedor (`0` = FEMININO, `1` = MASCULINO). | `DEV_MASTER` |
| `DT_NASC_ABERTURA` | Data de nascimento do devedor. | `DEV_MASTER` |
| `NOME_MAE` | Nome da mãe do devedor. | `DEV_MASTER` |

---

### 1.2 Telefone

#### DEV_FONE

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DEV_FONE` | ID único da tabela (IDENTITY). | `DEV_FONE` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `DEV_FONE` |
| `FONE` | Fone do devedor (sem o DDD). | `DEV_FONE` |
| `ID_FONE_REF` | FOREIGN KEY — referência à tabela `DEV_FONE_REFERENCIA` onde é armazenada a informação de cada referência dos telefones. | `DEV_FONE` |
| `ID_ORI` | FOREIGN KEY — referência à tabela `DEV_ORIGEM` onde é armazenada a informação da origem do dado. | `DEV_FONE` |
| `TIPO` | Tipo do telefone (`0` = FIXO, `1` = MÓVEL). | `DEV_FONE` |
| `HOT` | Marcação que informa se o fone é HOT (`1` = SIM, `0` = NÃO). | `DEV_FONE` |
| `VALIDO` | Informa se o dado é válido (`1` = VÁLIDO, `0` = INVÁLIDO). | `DEV_FONE` |
| `SMS` | Marcação que informa se o fone é apto para envio de SMS (`1` = SIM, `0` = NÃO). | `DEV_FONE` |
| `WHATSAPP` | Marcação que informa se o fone também é WhatsApp (`1` = SIM, `0` = NÃO). | `DEV_FONE` |
| `DT_CADASTRO` | Contém a data de cadastro do dado. | `DEV_FONE` |
| `COMPLEMENTO` | Informação do complemento do telefone. | `DEV_FONE` |
| `ID_DDD` | FOREIGN KEY — referência à tabela `DDD_CAD`. | `DEV_FONE` |
| `POSITIVO` | Marcação que informa se o dado é positivo (`1` = SIM, `0` = NÃO). | `DEV_FONE` |
| `DT_ATUALIZADO` | Data que o registro sofreu sua última atualização. | `DEV_FONE` |

#### DEV_FONE_REFERENCIA — Referências para Telefone

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_FONE_REFERENCIA` | ID único da tabela (IDENTITY). | `DEV_FONE_REFERENCIA` |
| `DESCR` | Descrição da referência. | `DEV_FONE_REFERENCIA` |

#### DDD_CAD — Informações dos DDDs

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DDD` | ID único da tabela (IDENTITY). | `DDD_CAD` |
| `DDD` | Informação do DDD (ex.: 11, 13, etc.). | `DDD_CAD` |

#### DEV_ORIGEM — Origens

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_ORI` | ID único da tabela (IDENTITY). | `DEV_ORIGEM` |
| `DESCR` | Descrição da origem. | `DEV_ORIGEM` |
| `HIGIENIZADORA` | Marcação que informa se o dado é de uma empresa higienizadora (`1` = SIM, `0` = NÃO). | `DEV_ORIGEM` |

---

### 1.3 Endereço

#### DEV_ENDER

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DEV_ENDER` | ID único da tabela (IDENTITY). | `DEV_ENDER` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `DEV_ENDER` |
| `ENDERECO` | Informação do logradouro (ex.: RUA FREI CANECA). | `DEV_ENDER` |
| `NUMERO` | Número do endereço. | `DEV_ENDER` |
| `COMPLE` | Complemento do endereço (ex.: AP 1302). | `DEV_ENDER` |
| `BAIRRO` | Bairro do endereço. | `DEV_ENDER` |
| `ID_CIDADE` | FOREIGN KEY — referência à tabela `CIDADE_CAD` onde é armazenada a descrição de cada cidade. | `DEV_ENDER` |
| `ID_UF` | FOREIGN KEY — referência à tabela `UF_CAD` onde é armazenada a informação de cada estado. | `DEV_ENDER` |
| `CEP` | CEP do endereço. | `DEV_ENDER` |
| `ID_ENDER_REF` | FOREIGN KEY — referência à tabela `DEV_ENDER_REFERENCIA` onde é armazenada a informação de cada referência. | `DEV_ENDER` |
| `ID_ORI` | FOREIGN KEY — referência à tabela `DEV_ORIGEM` onde é armazenada a informação da origem do dado. | `DEV_ENDER` |
| `HOT` | Marcação que informa se o endereço é HOT (`1` = SIM, `0` = NÃO). | `DEV_ENDER` |
| `VALIDO` | Informa se o dado é válido (`1` = VÁLIDO, `0` = INVÁLIDO). | `DEV_ENDER` |
| `DT_CADASTRO` | Contém a data de cadastro do dado. | `DEV_ENDER` |
| `DT_ATUALIZADO` | Data que o registro sofreu sua última atualização. | `DEV_ENDER` |

#### CIDADE_CAD — Informações das Cidades

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_CIDADE` | ID único da tabela (IDENTITY). | `CIDADE_CAD` |
| `ID_UF` | FOREIGN KEY — referência à tabela `UF_CAD` onde é armazenada a informação de cada estado. | `CIDADE_CAD` |
| `CIDADE` | Descrição/nome da cidade. | `CIDADE_CAD` |

#### UF_CAD — Informações dos Estados

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_UF` | ID único da tabela (IDENTITY). | `UF_CAD` |
| `UF` | Sigla do estado (ex.: SP). | `UF_CAD` |
| `DESCR` | Descrição do estado (ex.: SÃO PAULO). | `UF_CAD` |

#### DEV_ENDER_REFERENCIA — Referências para Endereços

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_ENDER_REF` | ID único da tabela (IDENTITY). | `DEV_ENDER_REFERENCIA` |
| `DESCR` | Descrição da referência. | `DEV_ENDER_REFERENCIA` |

---

### 1.4 Email

#### DEV_EMAIL

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DEV_EMAIL` | ID único da tabela (IDENTITY). | `DEV_EMAIL` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `DEV_EMAIL` |
| `EMAIL` | Informação de email (ex.: SUPORTE@COBDESANTOS.COM). | `DEV_EMAIL` |
| `ID_ORI` | FOREIGN KEY — referência à tabela `DEV_ORIGEM` onde é armazenada a informação da origem do dado. | `DEV_EMAIL` |
| `VALIDO` | Informa se o dado é válido (`1` = VÁLIDO, `0` = INVÁLIDO). | `DEV_EMAIL` |
| `DT_CADASTRO` | Contém a data de cadastro do dado. | `DEV_EMAIL` |

---

## 2. DADOS DAS DÍVIDAS

### 2.1 DIV_MASTER — Dívidas (Informações Específicas / Parcelas)

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DIVIDA` | ID único da tabela (IDENTITY). | `DIV_MASTER` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER` onde é armazenada as informações da carteira. | `DIV_MASTER` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `DIV_MASTER` |
| `ID_PRODUTO` | FOREIGN KEY — referência à tabela `PROD_CAD` onde é armazenada as informações de produto. | `DIV_MASTER` |
| `NR_OPERACAO` | Informação do número do contrato. | `DIV_MASTER` |
| `NR_PARCELA` | Número referente à parcela do contrato (para contratos que não possuem parcelas, a coluna recebe o valor fixo `1`). | `DIV_MASTER` |
| `ATIVO` | Informa se a dívida/parcela está ativa (`1` = ATIVO, `0` = INATIVO). | `DIV_MASTER` |
| `VR_NOMINAL` | Valor nominal da dívida. | `DIV_MASTER` |
| `VR_VENCIDO` | Valor vencido da dívida (geralmente é igual ao valor saldo). | `DIV_MASTER` |
| `VR_SALDO` | Valor atualizado da dívida. | `DIV_MASTER` |
| `DT_VENCIMENTO` | Data de vencimento da dívida. | `DIV_MASTER` |
| `DT_ENTRADA` | Data que a dívida deu entrada no sistema. | `DIV_MASTER` |
| `DT_ATUALIZADO` | Data da última atualização da dívida. | `DIV_MASTER` |
| `ATRASO_IMP` | Atraso da dívida. | `DIV_MASTER` |
| `VR_ADICIONAL` | Valor adicional utilizado para algum tipo de ação (campo só é utilizado em algumas carteiras). | `DIV_MASTER` |
| `DT_BAIXA` | Data da última baixa sofrida pela dívida. | `DIV_MASTER` |
| `ID_FASE` | Fase onde o contrato se enquadra (campo utilizado apenas em algumas carteiras). | `DIV_MASTER` |

### 2.2 PROD_CAD — Produtos

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_PRODUTO` | ID único da tabela (IDENTITY). | `PROD_CAD` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER`. | `PROD_CAD` |
| `DESCR` | Descrição do produto (ex.: CARTÃO DE CRÉDITO). | `PROD_CAD` |
| `CODIGO` | Código do produto. | `PROD_CAD` |
| `ID_PROD_GRUPO` | FOREIGN KEY — referência à tabela `PROD_GRUPO` onde é armazenada as informações de grupos para produtos (ex.: criar um grupo chamado CARTÃO onde todos os produtos referentes a cartões irão participar — apenas para algumas carteiras). | `PROD_CAD` |

### 2.3 FASE_CAD — Fases

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_FASE` | ID único da tabela (IDENTITY). | `FASE_CAD` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER`. | `FASE_CAD` |
| `FASE` | Descrição da fase (ex.: ETAPA 5). | `FASE_CAD` |

---

### 2.4 DIV_DEVEDORES — Dívidas (Informações Gerais)

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DEVEDORES` | ID único da tabela (IDENTITY). | `DIV_DEVEDORES` |
| `ID_EMPRESA` | FOREIGN KEY — referência à tabela `EMP_MASTER` onde é armazenada as informações da empresa. | `DIV_DEVEDORES` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER`. | `DIV_DEVEDORES` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `DIV_DEVEDORES` |
| `ID_PRODUTO` | FOREIGN KEY — referência à tabela `PROD_CAD`. | `DIV_DEVEDORES` |
| `ID_POLITICA` | FOREIGN KEY — referência à tabela `CART_POLITICA` onde é armazenada as referências da política de cálculo. | `DIV_DEVEDORES` |
| `NR_OPERACAO` | Informação do número do contrato. | `DIV_DEVEDORES` |
| `PESSOA_TIPO` | Tipo de pessoa (`0` = FÍSICA, `1` = JURÍDICA). | `DIV_DEVEDORES` |
| `MCI` | Código único do cliente. | `DIV_DEVEDORES` |
| `PLANO` | Plano do contrato (caso seja um contrato sem parcelas, então é fixo o valor `1`). | `DIV_DEVEDORES` |
| `ATIVO` | Informa se a dívida/parcela está ativa (`1` = ATIVO, `0` = INATIVO). | `DIV_DEVEDORES` |
| `ID_USUARIO` | FOREIGN KEY — referência à tabela `USU_MASTER`. Indica a quem pertence a cobrança da dívida (para casos de distribuição). | `DIV_DEVEDORES` |
| `CTO_DTRETORNO` | Caso o cliente receba um agendamento com retorno, a data é armazenada nesta coluna. | `DIV_DEVEDORES` |
| `CTO_ID_USUARIO` | Caso o cliente receba um agendamento com retorno, o usuário responsável é armazenado nesta coluna. | `DIV_DEVEDORES` |
| `DT_ATUALIZADO` | Data que o registro sofreu sua última atualização. | `DIV_DEVEDORES` |
| `INCOBRAVEL` | Marcação que informa se a dívida é incobrável (`1` = SIM, `0` = NÃO). | `DIV_DEVEDORES` |

**Exemplo de relacionamento entre `DIV_MASTER` e `DIV_DEVEDORES`:**

```sql
SELECT *
FROM DIV_MASTER DM (NOLOCK),
     DIV_DEVEDORES DD (NOLOCK)
WHERE DM.NR_OPERACAO = DD.NR_OPERACAO
  AND DM.ID_CARTEIRA = DD.ID_CARTEIRA
  AND DM.ID_DEV = DD.ID_DEV
```

---

### 2.5 DIV_AUX — Dívidas (Informações Auxiliares)

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_DIV_AUX` | ID único da tabela (IDENTITY). | `DIV_AUX` |
| `ID_DIVIDA` | FOREIGN KEY — referência à tabela `DIV_MASTER`. | `DIV_AUX` |
| `CAMPO010` a `CAMPO330` | Todas as informações referentes à dívida que não são possíveis armazenar em alguma tabela, então são armazenadas nessa tabela auxiliar para que o cliente não perca nenhum dado "importante" em tela. | `DIV_AUX` |

> **Nota (AgDash):** `DIV_AUX.CAMPO010` é utilizado como campo de **Portfólio** no dashboard.

---

## 3. DADOS DOS ACORDOS

### 3.1 REC_MASTER — Acordos (Informações das Parcelas do Acordo)

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_REC` | ID único da tabela (IDENTITY). | `REC_MASTER` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER`. | `REC_MASTER` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `REC_MASTER` |
| `NR_RECEBIMENTO` | Número do acordo. | `REC_MASTER` |
| `ID_USUARIO` | FOREIGN KEY — referência à tabela `USU_MASTER`. Atual dono do acordo. | `REC_MASTER` |
| `ID_REC_TIPO` | FOREIGN KEY — referência à tabela `REC_TIPO` onde é armazenada as informações dos tipos de pagamento (DÉBITO AUTOMÁTICO, BOLETO, etc.). | `REC_MASTER` |
| `ID_REC_STATUS` | FOREIGN KEY — referência à tabela `REC_STATUS` onde é armazenado os possíveis status do acordo. | `REC_MASTER` |
| `ID_REC_ORIGEM` | FOREIGN KEY — referência à tabela `REC_ORIGEM` onde é armazenada as origens dos acordos (ACORDO MANUAL, AUTO NEGOCIADOR, etc.). | `REC_MASTER` |
| `DT_EMISSAO` | Data e hora da emissão do acordo. | `REC_MASTER` |
| `DT_VENCIMENTO` | Data de vencimento da parcela. | `REC_MASTER` |
| `DT_PAGAMENTO` | Data de pagamento da parcela. | `REC_MASTER` |
| `NUMERO` | Nosso número. | `REC_MASTER` |
| `PARCELA` | Número da parcela. | `REC_MASTER` |
| `PLANO` | Plano do acordo (quantidade de parcelas). | `REC_MASTER` |
| `VALOR` | Valor da parcela. | `REC_MASTER` |
| `CD_BARRAS` | Código de barras. | `REC_MASTER` |
| `CD_LINHA_DIG` | Linha digitável. | `REC_MASTER` |
| `VR_PAGO` | Valor pago. | `REC_MASTER` |
| `DT_QUEBRA` | Data da quebra do acordo. | `REC_MASTER` |
| `ID_REC_TIPO_ENVIO` | FOREIGN KEY — referência à tabela `REC_TIPO_ENVIO` onde é armazenado os tipos de envio (ENVIO POR E-MAIL, SMS, CARTA, etc.). | `REC_MASTER` |

**Exemplo de relacionamento entre `REC_MASTER` e `REC_DIVIDAS`:**

```sql
SELECT *
FROM REC_MASTER RM (NOLOCK),
     REC_DIVIDAS RD (NOLOCK)
WHERE RM.NR_RECEBIMENTO = RD.NR_RECEBIMENTO
  AND RM.ID_CARTEIRA = RD.ID_CARTEIRA
```

---

### 3.2 REC_DIVIDAS — Acordos (Dívidas Vinculadas ao Acordo)

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_RE_DIVIDAS` | ID único da tabela (IDENTITY). | `REC_DIVIDAS` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER`. | `REC_DIVIDAS` |
| `ID_DIVIDA` | FOREIGN KEY — referência à tabela `DIV_MASTER`. | `REC_DIVIDAS` |
| `NR_RECEBIMENTO` | Número do acordo. | `REC_DIVIDAS` |
| `ID_CART_CALC01` | FOREIGN KEY — referência à tabela `CART_CALC01` onde é armazenado os parâmetros de cálculo. O mesmo vale para `CART_CALC02` e `CART_CALC03`. | `REC_DIVIDAS` |

> As demais colunas armazenam informações de cálculo, como valores de multa, juros, percentual de entrada, etc. (correção da dívida para gerar o valor do acordo).

---

## 4. ACIONAMENTOS

### 4.1 CTO_MASTER — Providência

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_CTO_MASTER` | ID único da tabela (IDENTITY). | `CTO_MASTER` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER`. | `CTO_MASTER` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `CTO_MASTER` |
| `ID_DEVEDORES` | FOREIGN KEY — referência à tabela `DIV_DEVEDORES`. Relacionamento do cliente/dívida com o acionamento lançado. | `CTO_MASTER` |
| `ID_USUARIO` | FOREIGN KEY — referência à tabela `USU_MASTER`. Usuário que fez o acionamento. | `CTO_MASTER` |
| `DATA` | Data do acionamento. | `CTO_MASTER` |
| `ID_DEV_FONE` | FOREIGN KEY — referência à tabela `DEV_FONE`. Indica o telefone vinculado ao acionamento. | `CTO_MASTER` |
| `SCORE` | Peso do telefone. | `CTO_MASTER` |
| `ID_COMPLEMENTO` | FOREIGN KEY — referência à tabela `CTO_COMPLEMENTO` (descrição da providência). | `CTO_MASTER` |
| `ID_AGENDA` | FOREIGN KEY — referência à tabela `CTO_AGENDA` (texto digitado ao realizar o acionamento). | `CTO_MASTER` |

### 4.2 CTO_ACAO — Cadastro da Ação

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_ACAO` | ID único da tabela (IDENTITY). | `CTO_ACAO` |
| `COD_ACAO` | Código da ação. | `CTO_ACAO` |
| `DESCR` | Descrição. | `CTO_ACAO` |
| `ID_CARTEIRA` | FOREIGN KEY — referência à tabela `CART_MASTER`. | `CTO_ACAO` |

### 4.3 CTO_RESULTADO — Cadastro de Resultado

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_RESULTADO` | ID único da tabela (IDENTITY). | `CTO_RESULTADO` |
| `COD_RESULTADO` | Código do resultado. | `CTO_RESULTADO` |
| `DESCR` | Descrição. | `CTO_RESULTADO` |
| `ID_ACAO` | FOREIGN KEY — referência à tabela `CTO_ACAO`. | `CTO_RESULTADO` |

---

### 4.4 CTO_AGENDA — Agenda de Contato

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_AGENDA` | ID único da tabela (IDENTITY). | `CTO_AGENDA` |
| `ID_DEV` | FOREIGN KEY — referência à tabela `DEV_MASTER`. | `CTO_AGENDA` |
| `ID_USUARIO` | FOREIGN KEY — referência à tabela `USU_MASTER`. Usuário que fez o acionamento. | `CTO_AGENDA` |
| `DATA` | Data do acionamento. | `CTO_AGENDA` |
| `TEXTO` | Texto digitado pelo operador no ato do acionamento. | `CTO_AGENDA` |

### 4.5 CTO_COMPLEMENTO — Cadastro de Complemento

| Coluna | Descrição | Tabela |
|---|---|---|
| `ID_COMPLEMENTO` | ID único da tabela (IDENTITY). | `CTO_COMPLEMENTO` |
| `COD_COMPLEMENTO` | Código complemento. | `CTO_COMPLEMENTO` |
| `DESCR` | Descrição. | `CTO_COMPLEMENTO` |
| `ID_RESULTADO` | FOREIGN KEY — referência à tabela `CTO_RESULTADO`. | `CTO_COMPLEMENTO` |
| `CODPARA` | Código de DE/PARA para webservice. | `CTO_COMPLEMENTO` |
| `CODPARA_DESC` | Descrição do código de DE/PARA do WS. | `CTO_COMPLEMENTO` |
| `DISC_PARA` | Código de DE/PARA para discador. | `CTO_COMPLEMENTO` |
| `DISC_PARA_DESC` | Descrição do código de DE/PARA do discador. | `CTO_COMPLEMENTO` |

---

## Diagrama de Relacionamentos (Resumo)

```
DEV_MASTER ──┬── DEV_FONE ────── DEV_FONE_REFERENCIA
             │                  ├── DDD_CAD
             │                  └── DEV_ORIGEM
             ├── DEV_ENDER ──── CIDADE_CAD ─── UF_CAD
             │                └── DEV_ENDER_REFERENCIA
             ├── DEV_EMAIL
             │
DIV_MASTER ──┬── PROD_CAD ─── PROD_GRUPO
             ├── FASE_CAD
             └── DIV_AUX

DIV_DEVEDORES ──── DIV_MASTER
              ├── EMP_MASTER
              ├── CART_MASTER
              ├── USU_MASTER
              └── CART_POLITICA

REC_MASTER ──── REC_DIVIDAS ─── DIV_MASTER
            ├── REC_TIPO
            ├── REC_STATUS
            ├── REC_ORIGEM
            ├── REC_TIPO_ENVIO
            ├── USU_MASTER
            └── CART_CALC01/02/03

CTO_MASTER ──── CTO_ACAO
            ├── CTO_RESULTADO
            ├── CTO_COMPLEMENTO
            ├── CTO_AGENDA
            ├── DEV_FONE
            └── DIV_DEVEDORES
```

---

*Extraído de `DICIONARIO DE DADOS.xlsx` em 2026-06-01.*
