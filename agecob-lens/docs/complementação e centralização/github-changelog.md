# Changelog — Ajustes no GitHub

Este documento resume as mudanças feitas desde o início da organização do projeto no GitHub.

## 1) Correções de fluxo Git (push/rebase/cherry-pick)

- Tratamos divergência de histórico (`non-fast-forward`) nas branches `T` e `main`.
- Evitamos `force push` e seguimos fluxo seguro com:
  - `rebase --abort` quando necessário;
  - alinhamento da branch local com remota;
  - `cherry-pick` de commits específicos.
- Resolvemos conflitos de integração (principalmente em `README.md`) para concluir push sem perder histórico remoto.

## 2) Publicação do `.env.example`

### Branch `T`

- Adicionado e versionado `.env.example`.
- Commit: `4624fde`
- Push: `origin/T`

### Branch `main`

- Mesmo conteúdo de `.env.example` promovido para `main`.
- Commit: `fa98cc9`
- Push: `origin/main`

## 3) Novo repositório remoto (`ag-front`) populado

- Remoto adicionado: `https://github.com/1isaqu/ag-front`
- Branches enviadas:
  - `main`
  - `T`

## 4) Organização do `agecob-lens` para evitar sujeira local

- Atualização do `.gitignore` com:
  - `.env`
  - `.env.*`
  - `!.env.example`
  - `.cursor/`
- Objetivo: evitar commit acidental de arquivos locais/sensíveis e manter o repositório limpo.
- Commit: `1f3c2b0`
- Push: `origin/main` e `ag-front/main`

## 5) Segurança e boas práticas mantidas

- O arquivo `.env` local **não** foi commitado.
- Apenas arquivos aprovados foram versionados.
- Não usamos operações destrutivas em branches principais.

## 6) Contexto de commits anteriores relevantes no período

- Commit com organização/documentação no fluxo anterior:
  - `0ab2211` (branch `T`)

---

## Estado final após os ajustes

- `origin/main`: sincronizada e limpa.
- `origin/T`: sincronizada e limpa.
- `ag-front/main` e `ag-front/T`: populadas.
- `.env.example`: presente no GitHub.
- `.env` local: fora do versionamento.

---

## 7) Mudanças recentes no dashboard (UI + operação)

### Redesign de interface e gráficos

- Tema atualizado para visual claro, com padronização de cores secundárias.
- Textos e labels foram normalizados para melhor legibilidade.
- Blocos redundantes da home foram removidos para reduzir ruído visual.
- Gráfico de distribuição em detalhamento foi corrigido:
  - separação de métricas por unidade (volume vs valores);
  - remoção da leitura ambígua de linha de tendência única;
  - inclusão de métricas derivadas de apoio (conversão e ticket).

### Operação em servidor

- `atualizar.bat` corrigido para cenário monorepo `C:\agecob`:
  - build no diretório correto `C:\agecob\agecob-lens`;
  - validações de caminho e falha por etapa;
  - reinício controlado do serviço `AgecobAPI`.
- Adicionada autoelevação para administrador (UAC), reduzindo falhas por permissão.

### Documentação estratégica adicionada

- Criada pasta `docs/future implem/` com documentos de planejamento:
  - `redesign_executivo_dashboard_92b7d68c.plan.md`
  - `pipeline-analise-operacional.md`
- Conteúdo desses docs foi traduzido para inglês com maior precisão técnica.
