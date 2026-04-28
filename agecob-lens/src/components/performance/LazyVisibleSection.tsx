import { type ReactNode, useEffect, useState } from "react";
import type { LoadPriority } from "@/config/loadPriorities";
import { useInViewport } from "@/hooks/useInViewport";
import { loadQueue } from "@/lib/loadQueue";

interface LazyVisibleSectionProps {
  id: string;
  scope: string;
  priority: LoadPriority;
  rootMargin?: string;
  fallback: ReactNode;
  children: ReactNode;
}

export default function LazyVisibleSection({
  id,
  scope,
  priority,
  rootMargin = "120px",
  fallback,
  children,
}: LazyVisibleSectionProps) {
  const [hostRef, isVisible] = useInViewport<HTMLDivElement>(rootMargin);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isVisible || ready) return;
    let cancelled = false;
    loadQueue
      .enqueue(id, scope, priority, async () => true)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isVisible, priority, ready, scope]);

  useEffect(() => {
    const onRouteCooled = (event: Event) => {
      const customEvent = event as CustomEvent<{ route?: string }>;
      if (customEvent.detail?.route === scope) {
        setReady(false);
      }
    };
    window.addEventListener("route:cooled", onRouteCooled);
    return () => window.removeEventListener("route:cooled", onRouteCooled);
  }, [scope]);

  return <div ref={hostRef}>{ready ? children : fallback}</div>;
}
