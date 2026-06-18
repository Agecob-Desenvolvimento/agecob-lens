import { useEffect, useState } from "react";

/** Pisca um flash curto (`flashMs`); o gap até o próximo pulso é aleatório
 *  (entre `minGapMs` e `maxGapMs`), agendado a partir do último pulso. */
export function usePeriodicBlink(minGapMs = 4000, maxGapMs = 10000, flashMs = 800): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout>;
    let nextTimer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const gap = minGapMs + Math.random() * (maxGapMs - minGapMs);
      nextTimer = setTimeout(() => {
        setOn(true);
        flashTimer = setTimeout(() => {
          setOn(false);
          scheduleNext();
        }, flashMs);
      }, gap);
    };
    scheduleNext();
    return () => {
      clearTimeout(nextTimer);
      clearTimeout(flashTimer);
    };
  }, [minGapMs, maxGapMs, flashMs]);
  return on;
}
