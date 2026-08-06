import { useEffect, useRef, useState } from "react";

interface ParsedToken {
  prefix: string;
  suffix: string;
  value: number;
  decimals: number;
}

/** Extrai o primeiro número pt-BR (1.234,56) do texto formatado, preservando prefixo/sufixo. */
function parseToken(text: string): ParsedToken | null {
  const match = text.match(/-?\d+(?:[.,]\d+)*/);
  if (!match || match.index == null) return null;
  const token = match[0];
  const prefix = text.slice(0, match.index);
  const suffix = text.slice(match.index + token.length);
  const lastComma = token.lastIndexOf(",");
  const decimals = lastComma === -1 ? 0 : token.length - lastComma - 1;
  const intPart = (lastComma === -1 ? token : token.slice(0, lastComma)).replace(/\./g, "");
  const decPart = lastComma === -1 ? "" : token.slice(lastComma + 1);
  const value = parseFloat(intPart + (decPart ? "." + decPart : ""));
  if (Number.isNaN(value)) return null;
  return { prefix, suffix, value, decimals };
}

function formatToken(value: number, decimals: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Anima a transição entre dois textos formatados (pt-BR) contando do valor
 * anterior até o novo, em vez do dígito trocar instantaneamente a cada refresh.
 * Texto sem número reconhecível (ex.: "—") passa direto, sem animação.
 */
export function useAnimatedFormattedValue(text: string, duration = 800): string {
  const [display, setDisplay] = useState(text);
  const prevValueRef = useRef<number | null>(parseToken(text)?.value ?? null);
  const rafRef = useRef<number>();

  useEffect(() => {
    const parsed = parseToken(text);
    if (!parsed || prefersReducedMotion()) {
      setDisplay(text);
      prevValueRef.current = parsed?.value ?? null;
      return;
    }
    const from = prevValueRef.current ?? parsed.value;
    const to = parsed.value;
    if (from === to) {
      setDisplay(text);
      return;
    }
    let start: number | null = null;
    const tick = (now: number) => {
      // primeiro timestamp vem do próprio rAF (não de performance.now() fora
      // dele): a origem do relógio de rAF nem sempre bate com performance.now()
      if (start == null) start = now;
      const t = Math.min(Math.max((now - start) / duration, 0), 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(parsed.prefix + formatToken(current, parsed.decimals) + parsed.suffix);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, duration]);

  return display;
}
