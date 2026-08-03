# Handoff — Redesign do Modo TV (fases 1–3 entregues, 4–5 pendentes)

Documento para o agente que vai revisar, commitar e colocar em produção.
Escrito em 2026-07-27. Working tree limpo de bugs conhecidos, **nada commitado ainda**.

---

## 0. O pedido que você recebeu

> "chama um subagente para fazer uma review nas mudanças (se quiser commitar para
> facilitar o review, pode), verificar se está tudo ok com o código, e dar push
> pra origin main (pode commitar e pushar as outras mudanças também, não tem problema)."

O usuário autorizou commit + push para `origin main`, incluindo as mudanças que
não são do redesign (`config/settings.py`, `dominios/acordos/queries.py` — ver §4).

---

## 1. Leitura obrigatória antes de tocar em qualquer coisa

Nesta ordem:

1. `agecob-lens/docs/spec-modo-tv.md` — **untracked**, precisa entrar no commit.
   É a spec do redesign (tokens APCA, grade, componentes, assinatura, motion).
   **O §2 (Tipografia) está REVOGADO** — ver §3 abaixo.
2. `agecob-lens/docs/data-layer.md` — **leitura integral obrigatória** antes de
   editar qualquer coisa de dado (ViewModel, selector, métrica, adapter). Regra do
   `CLAUDE.md` do projeto, vale para você e para qualquer subagente que você abrir.
3. `agecob-lens/docs/CLAUDE.md` — dicionário oficial de métricas, regra "Wrong or
   Act", anti-patterns.
4. `CLAUDE.md` da raiz — regras de negócio canônicas (status, CPC, conversão).

---

## 2. Estado do repositório

Branch `main`, sincronizada com `origin/main` (0 ahead, 0 behind).
Último commit: `f45d234 fix(modo-tv): URA fala valor da 1ª parcela, não total do acordo`.

```
 M agecob-lens/src/components/tv/TvAtoms.tsx
 M agecob-lens/src/components/tv/TvMode.tsx
 M agecob-lens/src/components/tv/TvOperacional.tsx
 M agecob-lens/src/components/tv/TvVariants.tsx
 M agecob-lens/src/components/tv/tvShared.ts
 M agecob-lens/src/hooks/useTvModeViewModel.ts
 M agecob-lens/src/lib/dates.ts
 M config/settings.py            <- NÃO é do redesign (do usuário, ver §4)
 M dominios/acordos/queries.py   <- NÃO é do redesign (do usuário, ver §4)
?? agecob-lens/docs/spec-modo-tv.md
```

Frontend: +787 / −429 em 7 arquivos.

### Verificações já rodadas (2026-07-27, com dados reais de produção via proxy)

| check | resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | **15 erros — todos pré-existentes**, conjunto arquivo:linha idêntico ao início da sessão. **Zero em `components/tv`** |
| `npx eslint src/components/tv src/hooks/useTvModeViewModel.ts src/lib/dates.ts` | limpo |
| `npm test` | **207 testes, 26 arquivos, todos passando** |
| medição de geometria no DOM | zero elementos fora da safe area; zero overflow; hero usa 1048 de 1100px |

> Os 15 erros de `tsc` são **baseline pré-existente** (`analiseMocks.ts`,
> `RadarDesempenho.tsx`, `HandoffDiagnosticCards.tsx`, `useHomeViewModel.ts`,
> `usePortfolioList.ts`, `useTvModeViewModel.ts` ×4, e 5 arquivos `.test.ts`).
> Não foram introduzidos por este trabalho. `vite build` não typechecka —
> por isso o `tsc --noEmit` é a checagem que vale.

---

## 3. O que foi feito (fases 1–3)

Origem: uma lista de 9 pontos do usuário sobre "AI slop" + uma pesquisa em 8
frentes (~90 fontes) sintetizada na spec.

| § | entrega |
|---|---|
| §1 | Paleta travada por auditoria **APCA** rodada em Node. Os cinzas antigos reprovavam: `#9aa6c2` = Lc 53, `#5d6886` = Lc 23 (invisível a 3–6 m). Verde/âmbar/terracota dessaturados e aquecidos para conversar com o dourado. Token `alarm` reservado a um único estado |
| §2 | **REVOGADO PELO USUÁRIO** — ver abaixo |
| §3.0 | Safe area 80px lateral / 60px vertical; tiles KPI 2×2 ao lado do gráfico |
| §3.1 | Hero do **dia** em 3 colunas (valor de acordos · 1ª parcela · % da meta do dia), baselines alinhadas; barra de meta 52px com marcos, marcador de ritmo esperado e faixa de déficit |
| §3.2 | `RitmoWorm` — linhas **acumuladas** real × esperado em SVG, área verde/rosa entre elas via `clipPath` de 2 passes, pill de veredito, cabeça viva. Matou as 12 barras com contorno tracejado |
| §3.3 | Rodapé **paginado** (8s por item, contador N/M, barra de progresso). Crawl de 42s morto — resolve também a violação de WCAG 2.2.2 |
| §3.4 | Contraste resolvido numericamente + mapa tamanho→cor |
| §3.5 | KPIs com referência (`▼ 9% · média do escritório 9,1%`) — **parcial, ver §5** |
| §3.6 | Semântica de cor travada; chip de alarme no hero (único uso do vermelho saturado) |
| §3.7 | Borda cinza removida de todos os cards; elevação por degrau de fundo |
| §3.8 | Abas com sublinhado dourado reto no lugar da pill iOS |
| extra | Ordenação por coluna no Modo Operacional (pedido direto), mesmo ciclo do `PerformanceHeatmap` |

### §2 (Tipografia) está REVOGADO — não reintroduza

Implementei Barlow Condensed + Archivo + Space Mono com piso de 28px. O usuário
rejeitou ao ver renderizado: *"não gostei da tipografia. esta tipografia está
gritando muita informação. mude para a antiga fonte."*

Revertido para `'Inter', system-ui` + JetBrains Mono, com os tamanhos antigos.
**Motivo técnico:** o piso de 28px só é coerente com a regra que o acompanha
(*"o que não couber em 28px é deletado, não encolhido"*). Aplicar o piso sem
cortar informação iguala rótulo e dado no mesmo volume e mata a hierarquia.

Consequência aceita: perde-se o ponto anti-slop nº 9 do usuário ("fonte default é
um tell") e a legibilidade a 5 m de rótulos pequenos. **É decisão dele e vence.**

### Código morto removido nesta rodada

`VariantHeroCentral`, `VariantSplitCommand`, `HeroValor`, `BuPanel`, `MetaBar` e
7 campos órfãos de `TvHeroValor` (`realizado`, `meta`, `ontemMesmaHora`,
`vsOntem`, `projecao`, `pctMeta`, `projPctMeta`), mais o cálculo de `projecao`.
Autorizado pelo usuário ("pode tirar").

---

## 4. Mudanças que NÃO são do redesign (do próprio usuário)

Ambas apareceram no working tree durante a sessão. **O usuário confirmou as duas
como dele.** Ele autorizou commitar junto.

### `config/settings.py` — `CPC_COMPLEMENTO_CODS` perdeu `"572"`

```diff
-CPC_COMPLEMENTO_CODS = ("449","452","453","454","455","459","572")
+CPC_COMPLEMENTO_CODS = ("449","452","453","454","455","459")
```

**Impacto amplo:** muda `qtd_contatos` (CPC) e, por consequência, **Conversão em
toda a aplicação** — incluindo o benchmark que o Modo TV agora exibe.

⚠️ **AÇÃO NECESSÁRIA:** `agecob-lens/docs/data-layer.md` (ADR-006) e o `CLAUDE.md`
da raiz ainda documentam **7 códigos, com o 572**. Código e contrato documentado
estão divergentes. Ou atualize os dois docs no mesmo commit, ou confirme com o
usuário. Não deixe divergir — foi exatamente uma divergência assim (lista por
`ID_COMPLEMENTO`) que zerou o CPC em produção em 2026-07-10.

### `dominios/acordos/queries.py` — `U.CHAVE` → `U.NOME`

Endpoint `/dashboard/acordos-hoje`. Muda `AcordoRow.agente` de login para nome
completo em todos os consumidores (`useAcordoAnnouncer.ts`, `AcordoRiscoPanel.tsx`,
export de `Carteiras.tsx`). Verificado: é só exibição e o mascaramento de demo
continua pegando (`demoMask.ts` casa por nome de campo). Confirme que nenhum
consumidor casa por login antes de subir.

---

## 5. O que FALTA (não bloqueia deploy, mas precisa ser dito)

### Fases nunca liberadas pelo usuário

- **§4 Gold Spine** — o elemento de assinatura da marca (barra dourada do logo
  repetida como keyline: 5px no hero, 3px nas tiles, slab angulado nos títulos,
  keyline hachurado no topo). **É o ponto 9 da lista anti-slop original do
  usuário** ("adicionar um elemento gráfico de marca"). Tokens `goldLight` e
  `goldDeep` já existem em `tvShared.ts` e estão sem consumidor esperando isso.
- **§5 Motion** — existem `tv-ticker-in`, `tv-ticker-hold`, `tv-pulse` com
  `prefers-reduced-motion`. Faltam `alarmPulse`, `milestoneFlash`, `shimmer100`
  e a transição do sublinhado do toggle.

### Itens de fases entregues que ficaram pela metade

| item | onde | o que falta |
|---|---|---|
| §3.1 | `TvVariants.tsx` | `META ✓` quando `pctMetaDia ≥ 100%` — o fill fica verde e o brilho troca, mas o número cru continua |
| §3.2 | `TvAtoms.tsx` | realce do esperado em déficit de 2h+ consecutivas; eixo em horas pares (renderiza as 12, sem colisão) |
| §3.5 | `useHomeViewModel.ts` | **2 das 4 tiles sem referência** (Acordos, Ticket médio). §3.5 diz que tile sem baseline é exceção, não padrão. O fix exige dar `baseline` a "Qtd Acordos" na **Home** (existe `prevTotals.qtd_acordos`) e devolver `baselineValue` em `mk()` (~linha 206) — mexe fora do Modo TV, por isso não foi feito sem autorização |
| §3.5 | `useTvModeViewModel.ts` | `refDe()` casa KPI por **string literal** de label ("CPC", "Conversão %", "Qtd Acordos"). Se a Home renomear, a referência some em silêncio. Vale extrair para const compartilhada |
| §3.0 | `TvVariants.tsx` | spec pede gutter 120–1800; está 80–1840 |

### Riscos conhecidos

- `HOLIDAYS_2026` (`lib/dates.ts`) é um set de **ano único**. `previousBusinessDayStr()`
  (novo) e `countBusinessDays()` dependem dele. A partir de 2027-01-01 todo feriado
  vira dia útil → o "vs dia útil anterior" pode cair num dia sem movimento.
- **Prova visual limitada.** O pane do browser recusou compor frames quase a
  sessão inteira; a validação foi por medição de geometria e estilo no DOM.
  As screenshots que existem vieram do usuário. Se puder, abra `/modo-tv` e
  confirme visualmente antes do push.

---

## 6. O que você deve fazer

1. **Ler os .md do §1** — `data-layer.md` integral é obrigatório pela regra do projeto.
2. **Revisar o diff.** Foco sugerido, por ordem de risco:
   - `useTvModeViewModel.ts` — é onde mora a lógica nova de dado (`pctEsperado`,
     `valorAcordosDia`, `vsOntemDia`, `refDe`). Confira as convenções de fração
     vs percentual: `delta.pct` e `vsOntemDia` são **fração** (−0.085 = −8,5%).
   - `TvAtoms.tsx` — `RitmoWorm` tem a matemática do `clipPath` de 2 passes; o
     `id` é sufixado com `useId()` sanitizado (dois-pontos quebram `url(#…)`).
   - Armadilha de verificação: `scrollHeight > clientHeight` **não detecta**
     overflow em `overflow: visible`, e `whiteSpace: nowrap` impede que vire
     quebra de linha. Meça geometria de pai vs filhos.
3. **Resolver a divergência do §4** (settings.py vs docs) antes de commitar.
4. **Commitar.** Sugestão de separação, já que são coisas diferentes:
   - `feat(modo-tv): redesign executivo — tokens APCA, hero do dia, gráfico acumulado, rodapé paginado`
     (7 arquivos do frontend + `docs/spec-modo-tv.md` + este handoff)
   - `fix(cpc): remove código 572 de CPC_COMPLEMENTO_CODS` (+ atualização dos docs)
   - `refactor(acordos): expõe nome do agente em vez do login`
   - Rodapé obrigatório: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
5. **Push para `origin main`.** A branch está sincronizada; não deve haver conflito.
6. **Deploy:** o servidor de produção roda `atualizar.bat` em `C:\agecob-new`
   (git pull + pip + npm build + restart do NSSM `AgecobAPI`). Ver `README.md`.
   Reiniciar o serviço limpa o cache em memória.

### Não faça

- Não reintroduza Barlow Condensed / Archivo / piso de 28px (§3).
- Não suba `uvicorn` local — a porta 8000 é o servidor de produção. Frontend só
  com `npm run dev`.
- Não reverta `config/settings.py` nem `dominios/acordos/queries.py` — são do usuário.
