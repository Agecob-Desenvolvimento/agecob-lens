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

export default function TvMode({ vm, onClose }: { vm: TvModeViewModel; onClose: () => void }) {
  // Escala uniforme: esticar por eixo distorce o texto em janela fora de 16:9
  // (21% numa 2.16:1). Numa TV 16:9 — o alvo real — isso preenche 100%. A sobra
  // em outras proporções recebe o mesmo fundo do canvas, então não vira tarja.
  const [scale, setScale] = useState(1);
  const [mode, setMode] = useState<"ritmo" | "operacional">("ritmo");
  const ura = useAcordoAnnouncer(vm.valor.metaDia, vm.ritmoAgg, vm.topAgentes);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

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
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: TV_BG, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ width: 1920, height: 1080, flexShrink: 0, transform: `scale(${scale})`, transformOrigin: "center center" }}>
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
