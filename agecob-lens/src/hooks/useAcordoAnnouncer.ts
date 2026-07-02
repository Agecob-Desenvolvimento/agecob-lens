/**
 * URA de acordos do Modo TV — detecta acordos novos por polling do feed
 * /dashboard/acordos-hoje e anuncia agente + valor por voz (Web Speech).
 *
 * Off por padrão: a política de autoplay do browser exige um gesto do usuário
 * para liberar áudio — o clique no botão arma a URA e satisfaz o gesto.
 * Ao armar, semeia o conjunto "já visto" com o estado atual: só acordos que
 * chegarem DEPOIS do toggle são anunciados (sem despejar o backlog do dia).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchAcordos, fetchPrimeiraParcelaDia, fetchRitmoDia, type AcordoRow } from "@/services/api";
import { todayStr } from "@/lib/dates";
import { type TvRitmoAgg, type TvTopAgente } from "@/components/tv/tvShared";
import { cancelSpeech, isSpeechSupported, speakPtBR } from "@/lib/speech";

const POLL_MS = 20000;
// atraso do boletim horário além do :00 — garante que ao menos 1 poll já rodou
// com o relógio do backend virado pra hora nova, senão fala o real da hora
// anterior ainda "em andamento" (stale, sempre 0 no instante exato da virada).
const HOUR_BOUNDARY_BUFFER_MS = 120000;
const MAX_PER_TICK = 5; // teto de anúncios por ciclo — evita avalanche de áudio
const RITMO_VAZIO: TvRitmoAgg = { real: null, espAteAgora: null, proj: null, meta: null };

// Frases de motivação no fim do boletim — rotacionadas para não repetir.
const MOTIV_ACIMA = [
  "Excelente trabalho, continuem assim!",
  "Ritmo excelente, equipe, bora manter!",
  "Vocês estão voando, continuem!",
  "Que time! Sigam nesse ritmo!",
];
const MOTIV_ABAIXO = [
  "Vamos com tudo, equipe, ainda dá tempo!",
  "Bora acelerar, a virada está nas nossas mãos!",
  "Foco e energia, dá pra recuperar!",
  "Cada acordo conta, vamos pra cima!",
];

export interface AcordoAnnouncer {
  supported: boolean;
  enabled: boolean;
  toggle: () => void;
}

const keyOf = (r: AcordoRow): string => `${r.banco_origem ?? ""}:${r.acordo}`;

// pctMetaDia é fracionário (0..1); omite a frase da meta quando não há meta carregada
const falaMeta = (pct: number | null): string =>
  pct == null ? "" : ` Agora estamos em ${Math.round(pct * 100)} por cento da meta do dia.`;

const ORDINAL = ["primeiro", "segundo", "terceiro"];

// top 3 agentes do dia por 1ª parcela — "" quando ainda não há dado
function falaTop3(top: TvTopAgente[]): string {
  if (!top.length) return "";
  const partes = top
    .slice(0, 3)
    .map((a, i) => `Em ${ORDINAL[i]}, ${a.label}, com ${Math.round(a.value)} reais.`)
    .join(" ");
  return ` Top 3 agentes do dia: ${partes}`;
}

// Boletim horário do ritmo do dia + top 3 agentes + frase de motivação no fim.
// null quando não há dados de ritmo (fora do horário operacional) → não fala.
function falaRitmo(r: TvRitmoAgg, motivIdx: number, top: TvTopAgente[]): string | null {
  if (r.real == null && r.espAteAgora == null && r.proj == null) return null;
  const real = Math.round(r.real ?? 0);
  const esp = Math.round(r.espAteAgora ?? 0);
  const acima = real >= esp;
  const estado = acima ? "acima do esperado" : "abaixo do esperado";
  const pool = acima ? MOTIV_ACIMA : MOTIV_ABAIXO;
  const motiv = pool[motivIdx % pool.length];
  const proj =
    r.proj != null && r.meta != null
      ? ` Projeção de fechamento, ${Math.round(r.proj)} acordos, contra meta de ${Math.round(r.meta)}.`
      : "";
  return `Atualização do ritmo do dia. ${real} acordos fechados, ${estado}, esperado ${esp} até agora.${proj}${falaTop3(top)} ${motiv}`;
}

function announce(rows: AcordoRow[], pct: number | null): void {
  const head = rows.slice(0, MAX_PER_TICK);
  for (const r of head) {
    const reais = Math.round(r.valor_total_acordo || 0);
    speakPtBR(`Conseguimos realizar mais um acordo! ${r.agente} fez uma negociação de ${reais} reais.${falaMeta(pct)}`);
  }
  const extra = rows.length - head.length;
  if (extra > 0) speakPtBR(`E mais ${extra} acordos fechados!`);
}

export function useAcordoAnnouncer(
  metaDia: number | null = null,
  ritmoAgg: TvRitmoAgg = RITMO_VAZIO,
  topAgentes: TvTopAgente[] = [],
): AcordoAnnouncer {
  const { selectedDatabase } = useGlobalFilters();
  const [enabled, setEnabled] = useState(false);
  const seen = useRef<Set<string> | null>(null); // null = ainda não semeado

  const { data } = useQuery({
    queryKey: ["tv", "acordos-announcer", selectedDatabase] as const,
    queryFn: () => fetchAcordos(selectedDatabase),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
  });

  // 1ª parcela gerada hoje — mesma queryKey da TV (cache compartilhado); o
  // refetchInterval faz o % da meta atualizar junto com o poll dos acordos.
  const { data: ppEnv } = useQuery({
    queryKey: ["tv", "pp-dia-hoje", selectedDatabase, todayStr()] as const,
    queryFn: () => fetchPrimeiraParcelaDia(selectedDatabase, undefined, todayStr(), todayStr()),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
  });

  const ppHoje = ppEnv?.data?.[0] ? Number(ppEnv.data[0].total_valor) || 0 : null;
  const pct = metaDia != null && metaDia > 0 && ppHoje != null ? ppHoje / metaDia : null;
  const pctRef = useRef(pct); // lido dentro do efeito async (poll)
  pctRef.current = pct;

  // ritmo-dia — mesma queryKey da TV; refetchInterval mantém o ritmo fresco para
  // o boletim horário (a leitura sai do ritmoAgg já computado pelo ViewModel).
  useQuery({
    queryKey: ["tv", "ritmo-dia", selectedDatabase] as const,
    queryFn: () => fetchRitmoDia(selectedDatabase),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
  });

  const ritmoRef = useRef(ritmoAgg); // lido dentro do timer horário
  ritmoRef.current = ritmoAgg;
  const topAgentesRef = useRef(topAgentes); // lido dentro do timer horário
  topAgentesRef.current = topAgentes;
  const motivIdx = useRef(0); // rotação das frases de motivação

  // troca de banco ou desarme → reseta a semente e silencia a fila
  useEffect(() => {
    seen.current = null;
    if (!enabled) cancelSpeech();
  }, [enabled, selectedDatabase]);

  useEffect(() => {
    const rows = data?.data;
    if (!enabled || !rows) return;
    if (seen.current === null) {
      seen.current = new Set(rows.map(keyOf)); // semeia: não anuncia o que já existia
      return;
    }
    const fresh: AcordoRow[] = [];
    for (const r of rows) {
      const k = keyOf(r);
      if (seen.current.has(k)) continue; // dedup entre parcelas e entre ciclos
      seen.current.add(k);
      fresh.push(r);
    }
    if (fresh.length) announce(fresh, pctRef.current);
  }, [data, enabled]);

  // boletim do ritmo do dia: imediato ao ligar e depois a cada virada de hora
  // (o ritmo recalcula por hora). setTimeout reagendado não deriva como setInterval.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const boletim = () => {
      const msg = falaRitmo(ritmoRef.current, motivIdx.current, topAgentesRef.current);
      if (msg) {
        speakPtBR(msg);
        motivIdx.current += 1;
      }
    };
    const agendarProximaHora = () => {
      const agora = new Date();
      const ms = (60 - agora.getMinutes()) * 60000 - agora.getSeconds() * 1000 - agora.getMilliseconds();
      timer = setTimeout(() => {
        boletim();
        agendarProximaHora();
      }, ms + HOUR_BOUNDARY_BUFFER_MS);
    };
    boletim(); // logo ao ligar a URA
    agendarProximaHora(); // depois, a cada :00
    return () => clearTimeout(timer);
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next) speakPtBR("URA de acordos ativada."); // dentro do gesto: libera o áudio
      return next;
    });
  }, []);

  return { supported: isSpeechSupported(), enabled, toggle };
}
