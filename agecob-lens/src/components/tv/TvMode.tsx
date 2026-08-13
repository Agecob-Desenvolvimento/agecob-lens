/**
 * Modo TV — overlay fullscreen escuro (sem sidebar). Escala o canvas
 * 1920×1080 para o viewport e exibe o Placar do Dia (tela única).
 * Esc / ✕ fecham.
 */
import { useEffect, useState } from "react";
import { TV, TV_BG, TvDataContext, type TvModeViewModel } from "./tvShared";
import { VariantScoreboard } from "./TvVariants";
import TvOperacional from "./TvOperacional";
import { useAcordoAnnouncer } from "@/hooks/useAcordoAnnouncer";

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /> : <path d="m23 9-6 6M17 9l6 6" />}
    </svg>
  );
}

const TV_KEYFRAMES = `
@keyframes tv-pulse { 0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(121,198,147,0.6); } 50% { opacity:0.55; box-shadow:0 0 0 8px rgba(121,198,147,0); } }
.tv-pulse { animation: tv-pulse 1.8s ease-in-out infinite; }
@keyframes tv-ticker-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.tv-ticker-in { animation: tv-ticker-in 400ms cubic-bezier(0.4,0,0.2,1) both; }
@keyframes tv-ticker-hold { from { width: 0; } to { width: 100%; } }
.tv-ticker-hold { animation: tv-ticker-hold 8000ms linear both; }
@keyframes tv-ticker-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .tv-pulse { animation: none; }
  /* keyframe próprio: sobrescrever transform aqui não adianta, o valor animado
     pelos keyframes vence a declaração normal. Cadência de 8s fica (é informação). */
  .tv-ticker-in { animation: tv-ticker-fade 300ms ease-out both; }
  .tv-ticker-hold { animation: none; width: 100%; opacity: 0.35; }
}
`;

/**
 * Tipografia elástica — a fonte segue a CAIXA (não o viewport direto): a linha e
 * o tile já são proporcionais ao viewport, então o texto herda essa fluidez e
 * ainda responde ao que muda só a caixa — menos agentes dividindo a coluna deixa
 * a linha mais alta e a fonte cresce junto. `cqh` acompanha a altura; `cqw` é o
 * teto que impede o número de estourar a célula quando só a altura cresceu.
 * Os coeficientes são % do CONTENT BOX (a caixa a que `cqh`/`cqw` se referem):
 * linha 843,5×58,9 sem padding; tile 276×117, já descontado o padding 18/26.
 *
 * Nas linhas o teto de largura é a própria proporção do projeto — a célula cresce
 * junto com a linha, então libera até ~2×. Nos tiles ele é afrouxado de propósito
 * (1,35× no valor, 1,25× em rótulo e sub): a largura do tile NÃO cresce numa
 * janela alta e a string ("R$ 488", "Ticket médio") já ocupa metade da caixa.
 *
 * `!important` é intencional: o valor de projeto está em `style` inline e nada
 * menos o sobrepõe. Browser sem container queries descarta a declaração inválida
 * e fica no px inline — degradação limpa, sem precisar de @supports.
 */
const TV_TIPOGRAFIA = `
.tv-op-row { container-type: size; }
.tv-op-rank { width: min(50.9cqh, 3.56cqw) !important; font-size: clamp(11px, min(33.9cqh, 2.37cqw), 50px) !important; }
/* termo extra só no nome: é a única string longa da linha e, acompanhando os
   números até 2×, "ANNA LUZIA SANTOS DE FREITAS" passava a ser cortada com
   reticências em toda linha (6/6 medidos a 45,9px; 0/6 a 28px). O 2,78vh são os
   30px do projeto em unidade relativa — acompanha o viewport, não trava num px. */
.tv-op-nome { font-size: clamp(12.1px, min(37.3cqh, 2.61cqw, 2.78vh), 55px) !important; }
.tv-op-login { font-size: clamp(7.7px, min(23.8cqh, 1.66cqw), 35px) !important; }
.tv-op-cel-brl { font-size: clamp(10.45px, min(32.3cqh, 2.25cqw), 47.5px) !important; }
.tv-op-cel-pct { font-size: clamp(12.1px, min(37.3cqh, 2.61cqw), 55px) !important; }
.tv-op-cel-num { font-size: clamp(13.2px, min(40.8cqh, 2.85cqw), 60px) !important; }
.tv-tile { container-type: size; }
.tv-tile-label { font-size: clamp(9.9px, min(15.4cqh, 8.15cqw), 45px) !important; }
.tv-tile-valor { font-size: clamp(35.2px, min(54.7cqh, 31.3cqw), 160px) !important; }
.tv-tile-sub { font-size: clamp(10.45px, min(16.2cqh, 8.6cqw), 47.5px) !important; }
`;

export default function TvMode({ vm, onClose }: { vm: TvModeViewModel; onClose: () => void }) {
  // Sem `transform: scale()`: o canvas É o viewport e cada medida do design é
  // proporção dele (`tvW`/`tvH`/`tvF`). Layout de verdade, não bitmap ampliado —
  // por consequência o zoom do navegador passa a funcionar sozinho, porque zoom
  // muda o tamanho do viewport em px CSS e as unidades relativas acompanham.
  const [mode, setMode] = useState<"ritmo" | "operacional">("ritmo");
  const ura = useAcordoAnnouncer(vm.valor.metaDia, vm.ritmoAgg, vm.topAgentes);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <TvDataContext.Provider value={vm}>
      <style>{TV_KEYFRAMES}</style>
      <style>{TV_TIPOGRAFIA}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: TV_BG, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {mode === "ritmo" ? <VariantScoreboard /> : <TvOperacional />}
        </div>
        {/* abas com sublinhado reto, não pill arredondada: o pill iOS é o mesmo
            componente de todo dashboard genérico e não diz nada da marca */}
        <div style={{ position: "fixed", top: 22, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 32, zIndex: 10000 }}>
          {(["ritmo", "operacional"] as const).map((m) => {
            const ativo = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                title={m === "ritmo" ? "Modo Gerencial" : "Modo Operacional"}
                aria-pressed={ativo}
                style={{
                  padding: "4px 2px 10px",
                  border: "none",
                  borderRadius: 0,
                  background: "transparent",
                  borderBottom: `4px solid ${ativo ? TV.gold : "transparent"}`,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: ativo ? TV.t1 : TV.t3,
                  transition: "color 200ms ease, border-color 200ms ease",
                }}
              >
                {m === "ritmo" ? "Gerencial" : "Operacional"}
              </button>
            );
          })}
        </div>
        <div style={{ position: "fixed", top: 20, right: 24, display: "flex", alignItems: "center", gap: 18, zIndex: 10000 }}>
          {ura.supported && (
            <button
              onClick={ura.toggle}
              title={ura.enabled ? "Desligar URA de acordos" : "Ligar URA de acordos"}
              aria-label={ura.enabled ? "Desligar URA de acordos" : "Ligar URA de acordos"}
              aria-pressed={ura.enabled}
              style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${ura.enabled ? TV.good : TV.line}`, background: ura.enabled ? TV.goodSoft : "rgba(255,255,255,0.06)", color: ura.enabled ? TV.good : TV.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <SpeakerIcon on={ura.enabled} />
            </button>
          )}
          <button
            onClick={onClose}
            title="Sair (Esc)"
            aria-label="Sair do Modo TV"
            style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${TV.line}`, background: "rgba(255,255,255,0.06)", color: TV.t1, cursor: "pointer", fontSize: 20, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ✕
          </button>
        </div>
      </div>
    </TvDataContext.Provider>
  );
}
