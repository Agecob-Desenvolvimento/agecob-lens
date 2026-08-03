# Especificação — Modo TV sem slop

Documento único de design para o redesign do "Modo TV / Placar do Dia" (`agecob-lens/src/components/tv/TvMode.tsx`). Alvo: 55" 1080p, visto de 3–6 m, canvas fixo 1920×1080 escalado ao viewport. Implementável só com inline styles React + Google Fonts. Todos os valores Lc abaixo foram computados com a implementação APCA-W3 0.1.9 verificada (`scratchpad/apca.js`, pares de referência batem exatos).

---

## 1. Tokens

Regra geral que resolve o conflito entre pesquisa de cor (validada em WCAG 2.x) e auditoria APCA: **onde o hex proposto pela pesquisa de cor não atingia Lc 60 em toda superfície, a lightness foi elevada no mesmo H/S até cruzar Lc 60 (nunca a saturação)** — mesma técnica que a própria pesquisa de cor prescreve para variantes.

| Token | Atual | Novo | Lc APCA (fundo) | Racional (1 linha) |
|---|---|---|---|---|
| `bg0` | `#060912` | mantém | — | base da marca; não é slop |
| `bg1` | `#0a1020` | mantém (topo do gradiente de fundo) | — | idem |
| `card` | `#0e1730` | mantém | — | nível 1 de elevação por tom |
| `cardHi` | `#122046` | mantém | — | nível 2 (cards de BU) |
| `petrol` | `#15355c` | **deletado** | — | alimentava só o radial de fundo antigo (TvVariants/TvOperacional); o gradiente do §3.7 o substitui — zero usos restantes, remover de `tvShared.ts` |
| `line` | `rgba(255,255,255,0.07)` | mantém — **só divisor interno, nunca borda de card** | — | ver §3.7 |
| `lineHi` | `rgba(255,255,255,0.14)` | mantém — **só o border interno do track da barra de meta (§3.1)** | — | único uso sancionado; nunca borda de card |
| `t1` | `#eef2fb` | mantém | −98.0 (card) | passa em qualquer tamanho |
| `t2` | `#9aa6c2` | **`#c9d0df`** | −76.7 (card) / −75.3 (cardHi) / −77.8 (bg0) | atual reprova (Lc 53); mesma família HSL, sobe até Lc ≥ 75 em toda superfície |
| `t3` (texto) | `#5d6886` | **`#afb6c7`** | −61.6 (card) / −62.7 (bg0) | atual é Lc 23 — abaixo do mínimo absoluto Lc 30; uso restrito a texto ≥ 28px/600+ |
| `t3small` | — | **`#ccd0db`** | −76.9 (card) | papel t3 quando o texto for 28px/regular |
| `hairline` | — | **`#5d6886`** (rebaixado) | −22.9 (card, não-texto) | antigo t3 vira régua/divisor — cruza Lc 15 de não-texto e fica quieto |
| `gold` | `#d4af5a` | mantém — **só ≥ 48px/600+ ou fills** | −61.5 (bg0) / −60.4 (card) | identidade; nunca carrega estado |
| `goldText` | — | **`#e4ce99`** | −76.8 (card) / −77.9 (bg0) | ouro para texto < 48px (captions, chips, "META") |
| `goldLight` / `goldDeep` | — | **`#f0d68c`** / **`#9a7a35`** | — (não-texto) | stops do gradiente do Gold Spine (§4) |
| `good` | `#37d39a` | **`#79c693`** | −61.6 (card) / −60.3 (cardHi) | dessaturado (verde saturado vibra no navy) + hue 158°→140° para conversar com o gold; L resolvido numericamente p/ Lc ≥ 60 |
| `warn` | `#f0b840` | **`#e7aa6c`** | −61.9 (card) / −60.5 (cardHi) | sai de cima do gold (41°→30° — colisão de hue < 1° hoje); Lc ≥ 60 |
| `bad` | `#f0716f` | **`#e0756a`** | −43.9 (card) | terracota 6°; **só fills, bordas, strokes e texto ≥ 48px/700** |
| `badText` | — | **`#eba59e`** | −62.1 (card) / −60.7 (cardHi) | texto negativo < 48px (mesmo padrão do red-11 dark da Radix) |
| `alarm` | — | **`#ff4d42`** | −41.6 (card, como chrome) | o único saturado do sistema; exclusivo do estado "atrás do ritmo"; nunca texto |
| `alarmText` | — | **`#ff9b94`** | −62.0 (card) | o número dentro do chip de alarme |
| `cyan` | `#5cd0e8` | mantém | −68.2 (card) | dado/"esperado" apenas; estados nunca usam cyan |
| `TONE.neutral` | `#5cd0e8` (cyan) | **`#eef2fb`** | −98.0 (card) | "estados nunca usam cyan" vale também para o mapa `TONE` de `tvShared.ts`; neutro = texto primário sem matiz de sinal (§3.6); `#c9d0df` fica restrito a rótulo (pill neutra §3.2) e **não** entra no `TONE` |
| `goodSoft` | — | `rgba(121,198,147,0.14)` | — | fill de chip |
| `warnSoft` | — | `rgba(231,170,108,0.14)` | — | fill de chip |
| `badSoft` | — | `rgba(224,117,106,0.14)` | — | fill de chip |
| `alarmSoft` | — | `rgba(255,77,66,0.12)` | — | fill do chip de alarme |

**Mapa de tamanho → cor permitida** (resolve legibilidade × APCA em uma regra aplicável):
- Texto < 48px regular → apenas cores Lc ≥ 75: `#eef2fb`, `#c9d0df`, `#ccd0db`, `#e4ce99`, `#eba59e`, `#ff9b94`.
- Texto ≥ 28px **e** ≥ 600 de peso (chips, pills, labels bold) → cores Lc ≥ 60 liberadas: `#afb6c7`, `#79c693`, `#e7aa6c`, `#d4af5a`.
- Texto ≥ 48px/700 → Lc ≥ 45 aceito: `#e0756a` entra aqui.
- **Piso absoluto de fonte: 28px para qualquer glifo na tela.** Decisão: a pesquisa de legibilidade pediu 24px e a de APCA pediu 32px; 28px é o mínimo Fire TV a 1080p e o início da banda Tier-3 — o que não couber em 28px é deletado, não encolhido.
- Verificação a 4 m: contam-se exatamente **4 matizes de sinal** (verde, âmbar, terracota, no máximo um vermelho saturado); o gold lê como chrome, não como estado.

---

## 2. Tipografia

Decisão central: **Inter sai de cena** (é o tell nº 1 de default) e entra o par broadcast "numeral condensado × caps expandido", com pisos de tamanho recalculados da pesquisa de arcminutos. JetBrains Mono sai junto (tell de IDE).

**Import (uma linha, `display=block` — TV segura 1–3 s em vez de piscar fallback):**

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Archivo:wdth,wght@62..125,400..800&family=Space+Mono:wght@700&display=block" />
```

As três faces foram verificadas binário-a-binário: o woff2 servido pelo Google mantém `tnum` com dígitos uniformes (Barlow Condensed 475 u, Archivo 579 u). Oswald, Anton e Saira Condensed reprovaram (jitter em número vivo) — não usar.

**Objeto compartilhado para todo numeral:**

```js
const NUM = {
  fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif",
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: "'tnum' 1",
};
const LABEL = { fontFamily: "'Archivo',Arial,sans-serif", fontStretch: '125%', textTransform: 'uppercase' };
```

**Tabela de papéis** (conflitos de px entre pesquisas resolvidos; racional entre parênteses):

| Papel | Face / peso | px | letter-spacing | Cor |
|---|---|---|---|---|
| % da meta (**o elemento mais alto da tela**) | Barlow Condensed 700 | **200** (herda o cálculo de 60′ a 6 m que pedia ~200px; exigência explícita do ponto 1 — nenhum outro glifo o excede) | `-0.01em` | estado: `#79c693` / `#e7aa6c` / **`#eef2fb`** (±3pp = neutro; gold nunca carrega estado, §3.6) |
| Hero R$ (dígitos) | Barlow Condensed 700 | **170** (0.85× do % — a regra 0.85× do score bug foi **invertida a favor do %**: o pedido do usuário de "% mais alto da tela" vence a proposta original de R$ 200px) | `-0.01em` | `#d4af5a` |
| Afixos "R$" / "K" | Archivo 700 caps | 75 (44% do dígito de 170, alinhado ao cap height) | `0.04em` | `#c9d0df` |
| Sub-label "DA META · R$ 1,44 MI" | Archivo 600 caps | 28 | `0.10em` | `#c9d0df` |
| Valor de tile KPI | Barlow Condensed 700 | 84 | `0` | `#eef2fb` |
| Label de tile KPI | Archivo 650 caps | 28 | `0.10em` | `#c9d0df` |
| Total de card BU | Barlow Condensed 600 | 72 | `0` | `#eef2fb` |
| Sub-valores BU ("436", "97%") | Barlow Condensed 600 | 44 | `0` | `#eef2fb` |
| Sub-labels BU ("ACORDOS", "DA 1ª PARCELA") | Archivo 600 caps | 28 | `0.10em` | `#c9d0df` |
| Títulos de seção | Archivo 700 caps | 32 | `0.08em` | `#eef2fb` |
| Eyebrows / badges | Archivo 700 caps | 28 | `0.12em` | `#c9d0df` ou `#e4ce99` |
| Ticks de hora (chart) | Archivo 600 | 28 | `0` | `#afb6c7`; hora atual `#eef2fb` 700 |
| Delta pill do chart | Archivo 800 caps + NUM | 32 | `0.06em` | por estado (§3.2) |
| Relógio | Space Mono 700 | **48** (decisão: legibilidade pedia Tier 1 ≥ 72, tipografia pedia 32–36; relógio é chrome ambiente, não placar — 48 lê a 4.5 m sem competir com o hero) | `0.02em` | `#e4ce99` |
| Ticker — frase | Archivo 600, **sentence case** | 36 | `0` | `#eef2fb` |
| Ticker — valor | Barlow Condensed 700 + NUM | 40 | `0` | semântica (só o número) |
| Contador "3/6" e labels de milestone | Space Mono 700 | 28 | `0.02em` | `#afb6c7` |

**Regras de caps** (Butterick): caps só em rótulos fixos de ≤ 3 palavras, sempre com tracking (escala acima); nunca letterspace minúsculas nem dígitos. O ticker é o único lugar onde o uppercase **sai** — prosa em movimento é o pior caso para caps (Clearview: mixed case reconhece 10–16% mais longe).

---

## 3. Componentes

### 3.0 — Grade do canvas (geometria completa, 1920×1080)

Canvas fixo 1920×1080. Safe area `padding: '60px 80px'` (§3.7) → área útil x:80–1840, y:60–1020. Gutter de conteúdo alinhado à barra de meta: **x:120–1800 (1680px)**. Gap vertical padrão entre bandas: **24px**. Toda coordenada abaixo é do canvas (antes do scale ao viewport):

| Banda | x | y | Altura |
|---|---|---|---|
| Keyline de topo (§4) | 0–1920 (full-bleed) | 0–6 | 6 |
| Chrome: toggle (§3.8) à esquerda a partir de x=120; relógio à direita terminando em x=1800 | 120–1800 | 60–116 | 56 |
| Hero lockup (§3.1) — R$ + % | 120–1180 | 96–420 | 324 |
| Cards BU AUTOS / CONSUMER (§3.7), empilhados à direita do hero | 1204–1800 | 96–246 / 270–420 | 150 cada, gap 24 |
| Barra de meta (§3.1) — track | 120–1800 | 444–508 | 64 |
| Labels de milestone + `ESPERADO` (§3.1) | — | 520–548 | 28 |
| Tiles KPI 2×2 (§3.5): Acordos, CPC / Conversão, Ticket médio | 120–448 e 472–800 | 572–724 / 748–900 | 152 cada |
| Card do chart (§3.2) | 824–1800 | 572–900 | 328 |
| Ticker (§3.3) | 120–1800 | 924–1020 | 96 |

Âncoras internas: baseline comum dos dígitos do hero em **y=320** (cap-top do % ≈ y=175 — sem colisão com o chrome, que termina em y=116); sub-labels do hero em y=336–364; chip de alarme (§3.6) em y=372–420; hero spine (§4) em x:96–101, y:96–420; glow do hero (§3.7) centrado no lockup (centro ≈ x=650, y=258); pace marker (§3.1) 5×84px centrado no track (y=434–518). Layout interno dos cards BU (596×150): total 72px à esquerda; pares sub-valor 44px + sub-label 28px à direita. Tile KPI (328×152): label 28 + valor 84 + baseline 28 empilhados (folga 4px entre linhas).

### 3.1 — "% da meta" como elemento mais alto da tela (ponto 1)

**Decisão: barra linear grossa (bullet graph), NÃO anel.** Estudo Waldner (IEEE TVCG 2019, n=92): barra linear é mais precisa, mais rápida e mais preferida; radial exigiria ≥ 380px de diâmetro consumindo o hero inteiro. Substitui: barra de 12px + caption de 16px escondidas sob o hero.

- **Lockup hero**: `[R$ 778,5K — 170px]` à esquerda … `[54% — 200px]` à direita, mesma baseline (y=320), ocupando x:120–1180, y=96–420 do canvas (§3.0). **Decisão explícita que resolve o conflito com a regra do score bug**: o 0.85× é aplicado **ao R$** (170 = 0.85 × 200), não ao % — a exigência do usuário ("% da meta" como elemento visualmente mais alto da tela) vence a proposta original de R$ 200px. Nenhum glifo na tela excede os 200px do %. Sob o %, sub-label `DA META · R$ 1,44 MI` (28px Archivo 600 `#c9d0df`).
- **Barra**: 1680×**64px** (x:120→1800, y:444–508 — §3.0), `borderRadius: 12`, track `#0e1730` com border interno `1px solid lineHi (rgba(255,255,255,0.14))`. Fill: `linear-gradient(90deg, #d4af5a 0%, #e8c97e 100%)`, `borderRadius: '12px 0 0 12px'` até 100%. Decisão fill = gold (não verde): meta é momento de marca, o único overlap sancionado; o estado fica no % e no pace marker. Quando o estado global é "atrás do ritmo" (§3.6), o trecho do track entre o fim do fill e o pace marker recebe fill `alarmSoft`.
- **Milestones** 25/50/75: réguas verticais 3px `rgba(255,255,255,0.28)` sobre track+fill, labels `25 50 75` Space Mono 700 28px `#afb6c7` 12px abaixo (y=520–548); 100% = régua 4px `rgba(255,255,255,0.45)` + `META` 28px `#e4ce99`.
- **Pace marker** (medida comparativa de Few): linha vertical **5×84px `#5cd0e8`** (y=434–518, centrada no track) em `x = largura × (horas úteis decorridas 8h–19h / 11)`; triângulo ▲ 16px + `ESPERADO` 28px Archivo 600 `#c9d0df` **abaixo do track, na banda y=520–548, na x do marker** (acima do track colidiria com o card CONSUMER, que desce até y=420 — §3.0); label de milestone a < 120px do marker é suprimido naquele frame. Decisão de cor: **cyan unificado para "esperado" na barra E no chart** (a pesquisa de pacing propunha branco 45% no chart; um hue = um significado vence).
- **Escalada goal-gradient**: <70% estático; ≥70% `boxShadow: '0 0 48px rgba(212,175,90,0.40)'` **estático** (decisão: sem pulso respirante — orçamento de motion, §5); ≥100% fill vira `linear-gradient(90deg,#79c693,#8fd0a5)`, glow `rgba(121,198,147,0.45)`, % vira `META ✓` em `#79c693`.

### 3.2 — Ritmo do dia: worm acumulado com banda surplus/déficit (ponto 2)

**Decisão: matar os 12 pares de barras por hora e o tracejado; um SVG único com duas linhas acumuladas.** A pergunta da TV é de NÍVEL ("vamos bater a meta?"), não de taxa — linha acumulada responde num golpe de vista (posição em escala comum = codificação nº 1 de Cleveland & McGill). Substitui: barras real×esperado com outline tracejado 1–2px (abaixo do limite de acuidade a 5 m).

- Plot **880×200px** + 36px de eixo, dentro do card do chart (x:824–1800, y:572–900 — §3.0; padding interno 24px, com folga à direita para o losango + label `META`). Escala X em minutos (8:00–19:00 → ~80px/hora); Y de 0 a `max(meta_dia*1.05, real*1.05)`.
- **Esperado**: polyline sólida 3px `rgba(92,208,232,0.55)`, round linecap, terminando às 19h exatamente na meta, com losango terminal 12px `#d4af5a` + `META` 28px/700 `#e4ce99` `0.08em`. **Proibido dash em qualquer stroke do plot**; referência × real se distingue por opacidade + peso, não por dash.
- **Real**: polyline 6px `#d4af5a`, área sob ela com `linearGradient` vertical `rgba(212,175,90,0.16)` → `rgba(212,175,90,0.02)`; para no minuto atual.
- **Banda ahead/behind (truque clipPath em 2 passes, sem calcular cruzamentos)**: polígono `P_band` = pontos do real (ida) + esperado (volta), fechado. Passe 1: fill `#e0756a` `fillOpacity 0.28`. Passe 2: mesmo polígono, fill `#79c693` `fillOpacity 0.22`, dentro de `<clipPath>` cuja path é a área SOB a curva real. Onde real ≥ esperado sobrevive o verde; onde real < esperado o clip remove o verde e a rosa aparece. Déficit por 2h+ consecutivas: tinge o segmento do esperado nessa faixa para `rgba(224,117,106,0.65)`.
- Gridlines 25/50/75% `1px rgba(255,255,255,0.05)`; 100% `2px rgba(212,175,90,0.30)`. **Sem ticks de Y** (o veredito mora na pill).
- **Cabeça viva no minuto atual**: now-line 2px `rgba(255,255,255,0.20)`; círculo r=9 `#d4af5a` stroke 3px `#0e1730`; anel de pulso r 9→18 / opacity 0.55→0, 2.2s ease-out infinite.
- **Delta pill (o veredito)**: 16px acima da cabeça, h=48px, `borderRadius 24`, `padding '0 20px'`, Archivo 800 32px caps + `NUM`. Delta = `real_acum − esperado_interpolado_ao_minuto` (interpolação linear entre pontos horários — evita "cair atrás" às :00). Estados: à frente `▲ +14 NO RITMO` texto `#79c693` / bg `goodSoft` / border `1.5px #79c693`; atrás `▼ -8 ABAIXO` texto `#eba59e` / bg `badSoft` / border `#e0756a`; ±2 acordos: `NO RITMO` sem seta, bg `rgba(238,242,251,0.08)`, texto `#c9d0df`. Seta + palavra + sinal + cor = redundância para daltônicos e painel com glare.
- Eixo: horas pares (8, 10, 12, 14, 16, 18) + 19h. Fallback de espaço apertado (card < 160px): bullet strip de Few — nunca os dois encodings no mesmo card.

### 3.3 — Ticker: fim do crawl, rotator paginado (ponto 3)

**Decisão: deletar o keyframe `translateX` de 42s; padrão ESPN BottomLine 2018 (flip).** A ESPN matou o crawl exatamente pela frustração descrita pelo usuário. Substitui: marquee contínuo que corta frase no meio.

- Rotator: `const [i, setI] = useState(0)` + `setInterval` de **8000ms** (10000ms se o item passar de 12 palavras — preferir reescrever). Render de UM item por vez, `key={i}` para disparar `tickerIn` (§5). Deck de 5–8 itens (ciclo 42–67s, mesma cadência atual). Ordem estável, nunca random. `< 2` itens: estático, sem timer.
- Anatomia da faixa (h=96px, y=924–1020, x:120–1800 — §3.0, dentro da safe area): badge fixo `DESTAQUES` à esquerda (28px/700 `#e4ce99`, border `1px solid rgba(212,175,90,0.35)`, `borderRadius: 999`) → frase única centralizada → contador `3/6` Space Mono 700 28px `#afb6c7` à direita → barra de progresso 3px na base: bg `rgba(255,255,255,0.07)`, fill `#d4af5a`, `animation: 'tickerHold 8000ms linear both'`, reiniciada pelo `key={i}`.
- Item = `[CHIP DE CATEGORIA] + [FRASE] + [VALOR]`: chip 28px/700 caps `0.14em` `#e4ce99`; frase **sentence case** 36px Archivo 600 `#eef2fb` (máx. 90 chars — guard no builder, não `text-overflow`); valor Barlow Condensed 700 40px `NUM`, cor semântica **só no número** (`#79c693` / `#e7aa6c` / `#eba59e`) — nunca a frase inteira vermelha.
- **Contrato de dados (exceção sancionada no §6)**: `TvTickerItem` em `tvShared.ts` deixa de ser string única e vira `{ chip: string; frase: string; valor?: string; tone?: 'good' | 'warn' | 'bad' }`. O builder que hoje concatena a frase pronta passa a devolver o objeto — **nenhum dado novo, nenhuma query nova; só estrutura** do que já é montado.
- Decisão de conflito (caps 20–22px da pesquisa tipográfica × sentence case 36px da de legibilidade): **sentence case 36px vence** — prosa em movimento é o único lugar onde o caso importa mais que o tamanho.

### 3.4 — Contraste objetivo dos labels pequenos (ponto 4)

**Decisão: trocar os dois cinzas por valores resolvidos numericamente (tabela §1) + piso de 28px + mapa tamanho→cor.** Substitui: `#9aa6c2` (Lc 53, reprova para label) e `#5d6886` (Lc 23, abaixo do mínimo absoluto — matematicamente invisível a 3–6 m).

Aplicação direta no exemplo do usuário: `436 ACORDOS` vira número 44px Barlow Condensed 600 `#eef2fb` + label 28px Archivo 600 caps `0.10em` **`#c9d0df`** (Lc 76.7 — antes Lc 53). `97% DA 1ª PARCELA` idem. `#5d6886` só sobrevive como hairline não-texto.

### 3.5 — Tile de CPC com referência (ponto 5)

**Decisão: toda tile de KPI ganha linha de baseline + delta chip — regra já existente no acceptance criteria do projeto ("every primary KPI displays baseline"), agora aplicada ao Modo TV.** Substitui: `6.300` flutuando sem juízo de valor.

- Sob o valor 84px: sub-linha `MÉDIA 3M · 5.8K` (28px Archivo 600 caps `#c9d0df`) — referência = média do escritório 3 meses, mesma convenção de benchmark da Home.
- Ao lado: chip `▲ +8%` 28px/700, texto `#79c693` sobre `goodSoft` com border `1px solid rgba(121,198,147,0.35)`; negativo: `#eba59e` sobre `badSoft` border `rgba(224,117,106,0.35)`; dentro de ±3%: sem chip (estado neutro se omite, nunca placeholder).
- **Contrato de dados (exceção sancionada no §6)**: `TvKpi` em `tvShared.ts` deixa de ser só `{ label, value, sub, tone }` e ganha dois campos opcionais: `baseline?: { label: string; value: string }` (ex.: `{ label: 'MÉDIA 3M', value: '5.8K' }`) e `delta?: { pct: number; dir: 'up' | 'down' }`. **Fonte**: a média de 3 meses do escritório que a Home já usa como benchmark — mesmo payload já servido pelo backend; o ViewModel do Modo TV passa a mapear o campo em vez de descartá-lo. **Sem endpoint novo, sem query nova.** Métrica sem benchmark disponível no payload → tile renderiza sem baseline (omissão, nunca placeholder).
- Mesmo padrão nas 4 tiles (Acordos, CPC, Conversão, Ticket médio) — uma tile sem baseline é a exceção proibida, não o padrão.

### 3.6 — Verde/vermelho recalibrados e travados (ponto 6)

**Decisão: tripleto dessaturado e esquentado, hexes travados na tabela §1 — nunca "green" genérico.** Substitui: `#37d39a` (mint 158°, vibra no navy e cola no cyan do chart) e `#f0716f` (salmão 1°).

- Arquitetura de matiz: arco análogo quente **6° (bad) — 30° (warn) — 42° (gold)** com 12–24° de espaçamento + **um único verde 140°** como acento contrastante (o "bom" é a manchete de um placar de receita). Guard rails: nenhum novo hue de sinal entre 0–60°; verde a ≥ 50° do cyan 190°.
- Gold **nunca** carrega estado (convenção Bloomberg: âmbar = marca, não alerta). Métrica exatamente na meta = neutro `#eef2fb`, não gold. **Esta regra vence em toda a spec**: o % co-hero dentro de ±3pp da meta rende em `#eef2fb` (§2) — a proposta anterior de gold como estado "on-pace" está revogada. **`TONE.neutral` de `tvShared.ts` migra de `#5cd0e8` para `#eef2fb`** (tabela §1): "estados nunca usam cyan" vale também para o mapa TONE; o `#c9d0df` segue como cor de rótulo (pill neutra do chart, §3.2) e nunca entra no TONE.
- **Exceção de um alarme**: `#ff4d42` saturado, exclusivo do estado global "atrás do ritmo projetado" — mesmo limiar da pill do chart (§3.2): delta < −2 acordos (fora da banda neutra ±2). **Regra determinística — quando ativo, renderiza sempre nas mesmas duas superfícies, ambas, e em nenhuma outra**: (1) o segmento de déficit do track da barra de meta — do fim do fill dourado até o pace marker — recebe fill `alarmSoft`; (2) chip de alarme no hero, sob o sub-label do % (y=372–420, alinhado à direita com o % — §3.0): bg `alarmSoft`, border `1px solid rgba(255,77,66,0.35)`, `▼` + número do déficit em `#ff9b94` 28px/700 + `ABAIXO DO RITMO` 28px Archivo 700 caps. Se não está atrás, **zero pixels** de `#ff4d42` na tela.

### 3.7 — Fim do card genérico: elevação por tom de fundo (ponto 7)

**Decisão: remover border cinza 1px + shadow de TODOS os cards; hierarquia vem de degraus de background + Gold Spine.** Substitui: o card genérico uniforme.

- Níveis: fundo da página (gradiente abaixo) → tiles KPI em `card #0e1730` → cards AUTOS/CONSUMER em `cardHi #122046` + spine de 3px (§4) → hero **sem card**, direto no fundo, com spine de 5px. Posições e dimensões de todos os blocos: §3.0.
- Fundo com luz direcional (atmosfera quieta, não é a assinatura): `background: 'radial-gradient(ellipse 55% 38% at 50% -8%, rgba(212,175,90,0.14), transparent 70%), radial-gradient(ellipse 90% 70% at 50% 120%, rgba(4,6,12,0.9), transparent), linear-gradient(180deg, #0a1020 0%, #060912 100%)'` (o radial antigo baseado em `petrol #15355c` morre junto — token deletado, §1) + glow atrás do hero: div 900×420px `radial-gradient(closest-side, rgba(212,175,90,0.12), transparent)`, `zIndex: 0`, centrado no lockup (centro ≈ x=650, y=258 — §3.0). **Grain de feTurbulence descartado**: com canvas 1920×1080 escalado a ratios não inteiros do viewport, ruído fino gera moiré/shimmer em painel barato.
- Shadows decorativas continuam proibidas; a única `box-shadow` permitida é o glow HOT da barra de meta (§3.1) — é sinal, não decoração. `line rgba(255,255,255,0.07)` fica apenas para divisores internos.
- Safe area obrigatória: container com `padding: '60px 80px'`; ticker e relógio DENTRO do inset (TV em modo "Zoom" corta o bezel).

### 3.8 — Toggle Gerencial/Operacional (ponto 8)

**Decisão: tab underline de cantos retos com gold ativo.** Substitui: pill toggle estilo iOS.

- Container transparente, sem borda. Duas abas de texto: Archivo 700 caps 28px `0.10em`. Ativa: `#eef2fb` + underline `4px` sólido `#d4af5a`, cantos retos (`borderRadius: 0`), 8px abaixo do texto. Inativa: `#afb6c7`, sem underline. Gap 32px entre abas. Transição do underline: `left/width 200ms cubic-bezier(0.4,0,0.2,1)` (ou corte seco em reduced-motion).

### 3.9 — Anti-slop e assinatura (ponto 9)

Coberto por: tipografia broadcast não-default (§2), paleta color-graded sem gradiente roxo/glassmorphism (§1, §3.6), elevação sem sombra uniforme (§3.7), zero emoji-como-ícone (setas/losangos são glifos geométricos), padding assimétrico (hero 96–420px vs tiles compactas), e o elemento de assinatura único do §4.

---

## 4. Assinatura da marca

**Escolhido: Gold Spine System** — a barra vertical dourada do logo AgeCob repetida como dispositivo estrutural, do jeito que score bugs repetem a barra de cor do time. Um único dispositivo, escalado por hierarquia, custo de legibilidade zero:

1. **Hero spine**: strip absoluto 5px × altura total na borda esquerda do bloco hero (x:96–101, y:96–420 — §3.0) — `background: 'linear-gradient(180deg, #f0d68c 0%, #d4af5a 45%, #9a7a35 100%)'`, `boxShadow: '0 0 14px rgba(212,175,90,0.35)'`, `borderRadius: 2`.
2. **Tile spines**: mesmo strip a 3px, sem glow, nos 2 cards BU e nas 4 tiles KPI.
3. **Slab angulado** antes de cada título de seção: `display:'inline-block', width:12, height:20, background:'#d4af5a', transform:'skewX(-14deg)', marginRight:10, verticalAlign:'middle'`.
4. **Keyline de topo**: faixa 6px na borda superior do canvas — `background: 'repeating-linear-gradient(115deg, rgba(212,175,90,0.9) 0 2px, transparent 2px 14px)'`, `borderBottom: '1px solid rgba(212,175,90,0.25)'`.

**Rejeitado: ghost numeral watermark** (o "%" em 560px stroke-only atrás do layout). Por quê: duplica informação que agora já é o elemento mais alto da tela (200px — o mesmo número duas vezes na tela viola o próprio anti-pattern do projeto), a ≤ 0.14 de alpha é invisível de 5 m (vira ruído de perto e nada de longe), e briga com a disciplina APCA recém-instalada. A atmosfera de floodlight não concorre: foi rebaixada a tratamento quieto de fundo (§3.7) — a ousadia é gasta num lugar só, o spine.

---

## 5. Motion

Orçamento: **no estado estável, no máximo UMA animação contínua na tela** (o anel de pulso da cabeça viva do chart). Tudo o mais é burst curto ou one-shot.

| Animação | Spec | Gatilho |
|---|---|---|
| `tickerIn` | `400ms cubic-bezier(0.4,0,0.2,1) both` — `from { opacity:0; transform:translateY(16px) }` | cada flip do rotator (`key={i}`); sem animação de saída |
| `tickerHold` | `8000ms linear both` — `from { width:0 } to { width:100% }` | barra de progresso do ticker |
| `livePulse` | `2.2s ease-out infinite` — anel r 9→18px, opacity 0.55→0 | cabeça viva do worm |
| `alarmPulse` | `2.4s ease-in-out infinite` — `50% { opacity:0.72 }` | SÓ o chip de alarme, e **suprime `livePulse` enquanto ativo** (um pulso por tela) |
| `milestoneFlash` | 900ms, uma vez por marco/dia (rastrear em ref) — régua do marco bloom `rgba(255,255,255,0.9)` 8px e volta; empurra item gold no ticker (`◆ 75% DA META — 14h32`) | cruzar 25/50/75/100% |
| `shimmer100` | 3s, exatamente uma vez — overlay 200px branco→transparente em `translateX` pela barra | 100% da meta |
| Underline do toggle | `200ms cubic-bezier(0.4,0,0.2,1)` | troca de modo |

Sem confete, sem animação de grain/filter, sem breathing no glow HOT (estático). WCAG 2.2.2: nenhum movimento contínuo > 5s exceto os pulsos de baixa amplitude; o crawl de 42s (violação canônica) morre.

**`prefers-reduced-motion: reduce`** (detectar com `window.matchMedia`, já que os styles são inline): `tickerIn` vira `tickerFade` (opacity only, 300ms ease-out); barra de progresso vira underline estático sob o contador N/M; `livePulse`, `alarmPulse` e `shimmer100` desligam (alarme fica estático — a cor e o chip já comunicam); cadência de 8s **não muda** (reduced motion muda o estilo da transição, nunca a informação).

---

## 6. O que NÃO mudar

- **Identidade navy + gold** e os quatro fundos `#060912 / #0a1020 / #0e1730 / #122046` — é a marca, não slop.
- `t1 #eef2fb` (Lc 98) e `cyan #5cd0e8` no papel de dado.
- **Canvas fixo 1920×1080 escalado ao viewport** e a arquitetura de dois modos (Gerencial/Operacional).
- O esqueleto de informação: hero → BU cards → 4 tiles KPI → chart horário → ticker. A hierarquia está certa; o problema era execução visual. (A ordem de leitura é preservada na grade do §3.0: hero + BU no topo, barra, tiles + chart na zona inferior, ticker na base.)
- Uppercase em rótulos fixos de ≤ 3 palavras (só ganha tracking, §2).
- A cadência total do ticker (~42–67s de ciclo completo) e o conceito do badge fixo "DESTAQUES".
- O modelo de dados de **backend**: curva esperada por hora, fonte da meta, lógica de 1ª parcela (PARCELA=0), cache — fora de escopo. **Duas exceções aditivas no contrato do frontend**, exigidas pelos pontos 3 e 5 e especificadas em §3.3 e §3.5: `TvKpi` ganha `baseline`/`delta` opcionais e `TvTickerItem` vira objeto estruturado. Nenhuma query nova, nenhum endpoint novo — só mapeamento/estruturação de dados já servidos.
- `borderRadius: 8` dos cards (o pedido de cantos retos é do indicador do toggle, não dos cards).

---

## 7. Fontes consultadas

- https://github.com/Myndex/SAPC-APCA/blob/master/documentation/APCA_in_a_Nutshell.md
- https://www.beville.com/subpage.php?criteria=n_What_are_the_Guidelines_for_Selecting_Font_Sizes_For_CRT_Displays
- https://raw.githubusercontent.com/tmaasen/apple-dev-mcp/main/content/universal/typography.md
- https://developer.android.com/design/ui/tv/guides/styles/typography
- http://docs.52im.net/extend/docs/api/android-50/design/tv/style.html
- https://www.smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/
- https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html
- https://www.extron.com/article/videowallfontsize
- https://digitalsignage.com/digital_signage/docs/guides/typography-viewing-distance/
- https://en.wikipedia.org/wiki/10-foot_user_interface
- https://docs.kiwidrone.com.ua/mil-std-1472h-uiux.html
- https://practicaltypography.com/letterspacing.html
- https://practicaltypography.com/all-caps.html
- https://www.clearviewhwy.com/home/research/research-inceptive-designs-word-pattern-studies/
- https://library.ctr.utexas.edu/hostedpdfs/tti/0-4984-1.pdf
- https://rsms.me/inter/dynmetrics/
- https://design.google/library/material-design-dark-theme
- https://codelabs.developers.google.com/codelabs/design-material-darktheme
- https://blog.zeplin.io/dark-mode-color-palette/
- https://www.smashingmagazine.com/2025/04/inclusive-dark-mode-designing-accessible-dark-themes/
- https://www.radix-ui.com/colors/docs/palette-composition/scales
- https://www.bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility/
- https://ted-merz.com/2021/06/26/amber-on-black/
- https://supercharge.design/blog/color-harmony-in-ui-in-depth-guide
- https://atmos.style/glossary/color-harmony
- https://blog.scorevision.com/led-video-scoreboard-design-best-practices
- https://fonts.google.com/specimen/Barlow+Condensed
- https://fonts.google.com/specimen/Archivo
- https://fonts.google.com/specimen/Space+Mono
- https://fonts.google.com/knowledge/glossary/numerals_figures
- https://github.com/jpt/barlow
- https://github.com/jpt/barlow/issues/69
- https://github.com/Omnibus-Type/Archivo
- https://github.com/floriankarsten/space-grotesk
- https://en.wikipedia.org/wiki/Archivo
- https://fontalternatives.com/best-fonts-for/sports/
- https://fontalternatives.com/blog/best-fonts-dense-dashboards/
- https://fontadvice.com/font-collections/scoreboard-fonts/
- https://www.sportsvideo.org/2026/06/09/designing-the-modern-scorebug-how-broadcast-graphics-teams-are-rethinking-the-most-important-element-on-screen/
- https://blog.bramp.net/post/2018/01/21/google-font-features/
- https://www.clariostechnology.com/productivity/blog/burnupvsburndownchart/
- https://miro.com/agile/burnup-chart-vs-burndown-chart/
- https://crickpro.com/cricket-league-website/match-pages/match-charts
- https://en.wikipedia.org/wiki/Required_run_rate
- https://defector.com/espns-win-probability-graphic-wants-to-give-you-gambling-brain
- https://awfulannouncing.com/gambling/espn-mlb-win-probability-sports-betting.html
- https://www.nngroup.com/articles/dashboards-preattentive/
- https://www.nngroup.com/articles/auto-forwarding/
- https://www.nngroup.com/articles/designing-effective-carousels/
- https://creativeartsadventure.wordpress.com/2017/01/02/cleveland-mcgill-graphical-perception-theory-experimentation-and-application-to-the-development-of-graphical-methods/
- https://peltiertech.com/surplus-deficit-area-chart/
- https://www.atlassian.com/data/charts/area-chart-complete-guide
- https://pascalpotvin.medium.com/designing-a-10ft-ui-ae2ca0da08b7
- https://www.purrweb.com/blog/how-to-design-an-app-for-smart-tvs/
- https://arxiv.org/pdf/2205.00757
- https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- https://en.wikipedia.org/wiki/Bullet_graph
- https://www.betterevaluation.org/tools-resources/bullet-graph-design-specification
- https://www.intelligentgraphicandcode.com/design/dashboard-design/operational-dashboards
- https://www.newscaststudio.com/2018/08/16/espn-new-ticker/
- https://www.espnfrontrow.com/2018/08/espns-bottomline-will-have-new-look-come-monday/
- https://www.yodeck.com/use-cases/digital-signage-design/
- https://www.crowntv-us.com/blog/digital-signage-design/
- https://www.sciencedirect.com/science/article/abs/pii/S0749596X19300786
- https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html
- https://web.dev/articles/prefers-reduced-motion
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- https://arxiv.org/abs/1907.13534
- https://www.cg.tuwien.ac.at/research/publications/2019/waldner-2019-rld/waldner-2019-rld-paper.pdf
- https://arxiv.org/pdf/2403.12343
- https://www.flerlagetwins.com/2019/03/radial-progress-bars_19.html
- https://en.wikipedia.org/wiki/Score_bug
- https://staturdays.com/2021/08/30/grading-the-best-and-worst-score-bugs-in-sports/
- https://peoplescience.maritz.com/Articles/2018/Know-Your-Nuggets-Endowed-Progress
- https://trophy.so/blog/progress-bars-feature-gamification-examples
- https://fundraiseup.com/blog/fundraising-thermometer/
- https://medium.com/design-bootcamp/goal-gradient-effect-and-the-psychology-of-progress-bars-df6fd889fd8e
- https://clairification.com/2025/10/27/surprising-psychology-behind-why-fundraising-thermometers-still-work-helpful-ai-boost/
- https://sa-liberty.medium.com/the-31-core-gamification-techniques-part-1-progress-achievement-mechanics-d81229732f07
- https://wasp3d.com/blogs/https-wasp3d-com-blogs-sports-lower-thirds-for-broadcasts-design-animation-and-best-practices
- https://medium.com/whoisjuan-journal/the-football-score-bug-a-case-study-on-creating-innovative-digital-on-screen-interfaces-9da29101c92a
- https://www.alicia.design/post/solving-small-text-and-contrast-issues-for-large-screen-readability
- https://css-tricks.com/stripes-css/
- https://css-tricks.com/grainy-gradients/
- https://css-tricks.com/adding-stroke-to-web-text/
- https://blog.logrocket.com/create-beautiful-stroked-text-css/
- https://www.bstefanski.com/blog/noisygrainy-backgrounds-and-gradients-in-css
- https://jaconir.online/blogs/css-radial-gradient
- https://dopelycolors.com/blog/radial-vs-linear-gradients-css-guide
- https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/repeating-linear-gradient
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/paint-order
- https://creativemarket.com/blog/best-sports-fonts