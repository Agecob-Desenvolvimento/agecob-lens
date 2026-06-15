Atue como um Engenheiro de Software Sênior especializado em dashboards de dados e automação de ETL. 

**CONTEXTO DO PROJETO:**
Temos um dashboard rodando em servidor local. Decidimos NÃO usar RAG ou reescrita de código em tempo de execução. A arquitetura aprovada é:
1. Um script Python (`extrator.py`) lê um PDF estruturado, valida os dados e gera um arquivo JSON local.
2. O dashboard lê esse arquivo JSON (`dados_metas/ultimas_metas.json`) para exibir as metas.
3. O histórico é preservado salvando arquivos com o período no nome (ex: `metas_2T26.json`).

**DADOS DE ENTRADA (Extraídos do PDF):**
O JSON gerado terá uma estrutura baseada nestas colunas do PDF:
- `Escritorio` (ex: AGECOB_LP)
- `Portfólio` (ex: BVFinanceira I, Santander Financeira XLII)
- `Grupo` (ex: Veículos, CDC/SR)
- `Negociadores` (Nome do agente)
- `Meta Caixa` (Valor)
- `Meta Retomadas(#)` (Quantidade)
- `Meta Retomadas(R$)` (Valor)
- `Meta PNT(Caixa+ Retomadas)` (Valor)
- Meses específicos como colunas ou chaves aninhadas (ex: `202604`, `202605`, `202606`).

**OBJETIVO DA TAREFA:**
Substituir o gráfico atual na seção "detalhamento-agentes" do dashboard por um novo componente de visualização de metas, que seja reativo aos filtros existentes.

**REGRAS DE NEGÓCIO E UI (CRÍTICO):**
1. **Localização:** O novo componente deve ser inserido exclusivamente na seção/página "detalhamento-agentes", substituindo o gráfico antigo.
2. **Reatividade ao Filtro:** O componente deve ouvir o filtro de "Carteiras" (Portfólio) já existente na página.
3. **Lógica de Exibição por Portfólio:** 
   - Se o usuário selecionar um ou mais portfólios específicos, o gráfico deve mostrar as metas exatas dos negociadores pertencentes a esses portfólios.
   - **REGRA DE OURO (Generalização):** Se o usuário selecionar "Todos os portfólios" (ou nenhum, assumindo todos), o sistema NÃO deve somar as metas (pois seria um número irreal). Ele deve calcular a **MÉDIA** das metas dos negociadores filtrados.
   - **Aviso Visual:** Quando a lógica de média for acionada, deve aparecer um banner ou texto de aviso claro e visível acima do gráfico: "⚠️ Atenção: Como 'Todos os Portfólios' foi selecionado, as metas exibidas representam a média generalizada dos agentes, e não a soma total."
4. **Validação do ETL (No script extrator.py):** Antes de gerar o JSON, o script deve validar se as colunas obrigatórias existem e se a soma das linhas bate com a linha "TOTAL GERAL" do PDF. Se falhar, deve gerar um `erro_extração.log` e NÃO sobrescrever o `ultimas_metas.json`.

**SOLICITAÇÃO (ULTRA-PLANO):**
Antes de escrever qualquer código, gere um "Ultra-plano" detalhado em markdown contendo:
1. **Estrutura do JSON Alvo:** Um exemplo de como o `ultimas_metas.json` deve ser formatado para facilitar o filtro no frontend.
2. **Passo a Passo do `extrator.py`:** A lógica de leitura, validação (soma vs total geral) e salvamento seguro.
3. **Lógica do Frontend:** Como interceptar o filtro de carteiras, como calcular a média condicionalmente e como renderizar o aviso visual.
4. **Sugestão de Visualização:** Qual tipo de gráfico (ex: Barras empilhadas, Tabela com formatação condicional, KPI cards) melhor representa "Meta vs Real" para negociadores nesse contexto.

Aguardo o Ultra-plano para aprovação antes da geração do código.