---
title: Agecob — Diário de Bordo
tags: [agecob, diario, timeline]
created: 2026-04-27
updated: 2026-04-27
---

# Diário de Bordo — agecob-lens

Timeline pessoal do que foi feito, semana a semana. Útil para retrospectiva, CV, e para lembrar contexto quando retomar algo depois de um tempo.

---

## Semana 5 (21–27 abr 2026)

**Foco:** Documentação, auditoria, pipeline v2.

- [x] Auditoria de consistência do endpoint `/produtividade-agentes` (34 PASS, 1 bloqueado)
- [x] Pipeline Análise Operacional v2 finalizado
  - Infraestrutura validada (índices, benchmarks)
  - Tabela fato definida (dia × portfólio × banco)
  - Query de agregação validada em produção
  - CARGA_LOTE integrado com thresholds
  - Freshness contract, alert lifecycle, YAML schema
- [x] Redesign executivo v2 finalizado (Visual Encoding, InsightEngine, component contracts)
- [x] Diagnóstico de atualidade de todos os docs
- [x] Documentação centralizada para Obsidian (MOC + docs especializados)

**Bloqueios:** Permissão DDL no Agecob DB ainda pendente.

**Aprendizado:** A diferença de 81× no tempo de query (join direto vs CTEs) é o tipo de coisa que justifica sempre validar no banco antes de escrever código.

---

## Semana 4 (14–20 abr 2026)

**Foco:** Refactor main.py, endpoint consolidado.

- [x] Refactor main.py (3 changes)
  - Change 1: Unificação da query de produtividade
  - Change 2: Eliminação do filtro Python redundante
  - Change 3: CTE_Saldo_Original restrito ao dia
  - Resultado: 1568 → 1447 linhas (−7.7%)
- [x] Endpoint `/produtividade-agentes` implementado e testado
  - Consolidação cross-DB via CHAVE normalizada
  - Cache próprio com TTL 60s

**Aprendizado:** ADD-ONLY como disciplina funciona. O refactor foi um prompt separado da implementação do endpoint, e ambos foram verificáveis isoladamente.

---

## Semana 3 (7–13 abr 2026)

**Foco:** Gráficos, cards, redesign visual.

- [x] Builders de chart queries implementados (primeira-parcela, exceções por portfolio/agente, acordos por portfolio)
- [x] Redesign visual inicial (tema claro, labels normalizados, blocos redundantes removidos)
- [x] Gráfico de distribuição corrigido (separação volume vs valor)

**Aprendizado:** Nunca misturar count e BRL no mesmo eixo Y. Parece óbvio depois, mas o gráfico original fazia isso.

---

## Semana 2 (1–6 abr 2026)

**Foco:** Operação de servidor, Git.

- [x] `atualizar.bat` corrigido para monorepo
- [x] Autoelevação UAC adicionada
- [x] Git organizado: branches alinhadas, .gitignore atualizado, .env.example publicado
- [x] Remoto ag-front populado

**Aprendizado:** Automatizar o deploy (mesmo que com .bat) economiza tempo e reduz erro humano.

---

## Semana 1 (~28 mar 2026)

**Foco:** Setup inicial.

- [x] Repositório criado
- [x] FastAPI + Uvicorn + pyodbc configurados
- [x] Primeiros endpoints de produtividade
- [x] Frontend React/TS + Vite + Tailwind + shadcn inicializado
- [x] Nginx + NSSM configurados no servidor Windows

**Aprendizado:** Ter o backend e o SQL Server no mesmo host simplifica, mas cria dependency — se o servidor cai, cai tudo.

---

## Template para novas semanas

```markdown
## Semana N (DD–DD mmm 2026)

**Foco:** [tema principal]

- [ ] item 1
- [ ] item 2

**Bloqueios:** [se houver]

**Aprendizado:** [uma frase]
```

---

## Referências

- [[agecob-changelog-consolidado]] — Changelog técnico detalhado
- [[agecob-decisoes-tecnicas]] — Decisões que surgiram dessas semanas
- [[agecob-moc]] — Índice geral
