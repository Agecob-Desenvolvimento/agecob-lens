/**
 * URA do Modo TV — wrapper fino sobre a Web Speech API (síntese de voz).
 * Voz pt-BR escolhida preguiçosamente (a lista de vozes carrega async).
 */
let cachedVoice: SpeechSynthesisVoice | null | undefined;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// vozes chegam async; zera o cache quando o catálogo muda
if (isSpeechSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = undefined;
  };
}

// Ranqueia vozes pt: prefere neurais (Edge "Natural", Chrome "Google") sobre as
// SAPI legadas ("Desktop"), que soam robóticas. Maior número = melhor.
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = (v.name || "").toLowerCase();
  const l = (v.lang || "").toLowerCase();
  // pt-BR tem base 100 — sempre vence qualquer pt-PT ou pt genérico,
  // mesmo que esses sejam "Natural". Resolve Bing falando espanhol/pt-PT.
  let s = l.startsWith("pt-br") ? 100 : l.startsWith("pt") ? 0 : -1;
  if (n.includes("natural")) s += 8;
  else if (n.includes("google") || n.includes("online")) s += 6;
  if (n.includes("desktop")) s -= 2;
  return s;
}

function ptVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const all = window.speechSynthesis.getVoices();
  if (all.length === 0) return null; // catálogo ainda não carregou; retenta no próximo speak
  const pt = all.filter((v) => (v.lang || "").toLowerCase().startsWith("pt"));
  cachedVoice = pt.length ? pt.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0] : null;
  return cachedVoice;
}

export function speakPtBR(text: string): void {
  if (!isSpeechSupported()) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  const v = ptVoice();
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

export function cancelSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
