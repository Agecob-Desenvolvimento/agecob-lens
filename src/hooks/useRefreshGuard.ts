import { useCallback, useRef, useState } from "react";

interface RefreshGuardOptions {
  minIntervalMs?: number;
  debounceMs?: number;
}

export function useRefreshGuard(
  onRefresh: () => Promise<void> | void,
  options: RefreshGuardOptions = {},
) {
  const minIntervalMs = options.minIntervalMs ?? 10000;
  const debounceMs = options.debounceMs ?? 300;
  const [refreshing, setRefreshing] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const lastRunRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const guardedRefresh = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastRunRef.current;
    if (elapsed < minIntervalMs) {
      setRemainingMs(minIntervalMs - elapsed);
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(async () => {
      setRefreshing(true);
      setRemainingMs(0);
      try {
        await onRefresh();
        lastRunRef.current = Date.now();
      } finally {
        setRefreshing(false);
      }
    }, debounceMs);
  }, [debounceMs, minIntervalMs, onRefresh]);

  return {
    guardedRefresh,
    refreshing,
    remainingMs,
  };
}
