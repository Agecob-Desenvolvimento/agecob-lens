/**
 * URA do Modo TV — wrapper fino sobre a Web Speech API (síntese de voz).
 * Voz pt-BR escolhida preguiçosamente (a lista de vozes carrega async).
 *
 * Blindagem contra espanhol: se nenhuma voz pt-BR foi carregada ainda,
 * enfileira e dispara quando o catálogo chegar. Se não houver voz pt-BR
 * no sistema, loga warn e não fala — silêncio é melhor que espanhol.
 */
let cachedVoice: SpeechSynthesisVoice | null | undefined;
let pendingQueue: string[] = [];
let voicesLoaded = false;

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function flushQueue(): void {
  if (!pendingQueue.length) return;
  const queue = pendingQueue;
  pendingQueue = [];
  for (const t of queue) speakNow(t);
}

function speakNow(text: string): void {
  if (!isSpeechSupported()) return;
  const v = ptVoice();
  if (!v) {
    console.warn("[URA] Nenhuma voz pt-BR disponível no sistema. URA silenciada.");
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  u.voice = v;
  window.speechSynthesis.speak(u);
}

// vozes chegam async; zera o cache quando o catálogo muda e dispara a fila
if (isSpeechSupported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = undefined;
    voicesLoaded = true;
    flushQueue();
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
  // vozes "Multilingual" trocam sotaque/fonema por trecho conforme idioma
  // detectado no texto — é a causa raiz de falar espanhol em certas frases.
  if (n.includes("multilingual")) s -= 20;
  return s;
}

function ptVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const all = window.speechSynthesis.getVoices();
  if (all.length === 0) return null; // catálogo ainda não carregou
  const pt = all.filter((v) => (v.lang || "").toLowerCase().startsWith("pt"));
  cachedVoice = pt.length ? pt.slice().sort((a, b) => voiceScore(b) - voiceScore(a))[0] : null;
  voicesLoaded = true;
  return cachedVoice;
}

export function speakPtBR(text: string): void {
  if (!isSpeechSupported()) return;
  // Voz ainda não carregada → enfileira, dispara quando onvoiceschanged chamar.
  // Se já carregou mas ptVoice() é null, o speakNow loga warn e silencia.
  if (!voicesLoaded && window.speechSynthesis.getVoices().length === 0) {
    pendingQueue.push(text);
    return;
  }
  speakNow(text);
  // Se tinha fila pendente, dispara junto
  if (pendingQueue.length) flushQueue();
}

export function cancelSpeech(): void {
  pendingQueue = [];
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
