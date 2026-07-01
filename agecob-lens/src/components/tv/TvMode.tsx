/**
 * Modo TV — overlay fullscreen escuro (sem sidebar). Escala o canvas
 * 1920×1080 para o viewport e cicla A → B → C a cada 15s.
 * Esc / ✕ fecham; pontos navegam manualmente.
 */
import { useEffect, useState } from "react";
import { TV, TvDataContext, type TvModeViewModel } from "./tvShared";
import { VariantHeroCentral, VariantScoreboard, VariantSplitCommand } from "./TvVariants";
import { useAcordoAnnouncer } from "@/hooks/useAcordoAnnouncer";

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {on ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /> : <path d="m23 9-6 6M17 9l6 6" />}
    </svg>
  );
}

const VARIANTS = [
  { id: "hero-central", label: "A · Hero Central", Comp: VariantHeroCentral },
  { id: "split-command", label: "B · Centro de Comando", Comp: VariantSplitCommand },
  { id: "scoreboard", label: "C · Placar do Dia", Comp: VariantScoreboard },
];
const CYCLE_MS = 15000;

const TV_KEYFRAMES = `
@keyframes tv-pulse { 0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(55,211,154,0.6); } 50% { opacity:0.55; box-shadow:0 0 0 8px rgba(55,211,154,0); } }
.tv-pulse { animation: tv-pulse 1.8s ease-in-out infinite; }
@keyframes tv-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
.tv-ticker-track { animation: tv-ticker 42s linear infinite; }
@media (prefers-reduced-motion: reduce) { .tv-pulse, .tv-ticker-track { animation: none; } }
`;

export default function TvMode({ vm, onClose }: { vm: TvModeViewModel; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [scale, setScale] = useState(1);
  const ura = useAcordoAnnouncer(vm.valor.metaDia, vm.ritmoAgg, vm.topAgentes);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % VARIANTS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Current = VARIANTS[idx].Comp;
  return (
    <TvDataContext.Provider value={vm}>
      <style>{TV_KEYFRAMES}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: TV.bg0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ width: 1920, height: 1080, flexShrink: 0, transform: `scale(${scale})`, transformOrigin: "center center" }}>
          <Current />
        </div>
        <div style={{ position: "fixed", top: 20, right: 24, display: "flex", alignItems: "center", gap: 18, zIndex: 10000 }}>
          <div style={{ display: "flex", gap: 9 }}>
            {VARIANTS.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setIdx(i)}
                title={v.label}
                aria-label={v.label}
                style={{ width: 11, height: 11, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0, background: i === idx ? TV.gold : "rgba(255,255,255,0.25)", transition: "background 200ms ease" }}
              />
            ))}
          </div>
          {ura.supported && (
            <button
              onClick={ura.toggle}
              title={ura.enabled ? "Desligar URA de acordos" : "Ligar URA de acordos"}
              aria-label={ura.enabled ? "Desligar URA de acordos" : "Ligar URA de acordos"}
              aria-pressed={ura.enabled}
              style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${ura.enabled ? TV.good : TV.line}`, background: ura.enabled ? "rgba(55,211,154,0.14)" : "rgba(255,255,255,0.06)", color: ura.enabled ? TV.good : TV.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
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
