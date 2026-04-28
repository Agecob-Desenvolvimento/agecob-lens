type RouteState = "hot" | "warm" | "cold";
type CleanupFn = () => void;

const ROUTE_RING = ["/", "/comparacao-agentes", "/detalhamento-agentes", "/analise-produtividade"];
const COOLDOWN_MS = 30 * 60 * 1000;
const WARM_WINDOW_MS = 30 * 60 * 1000;

class RouteHeatManager {
  private hotRoute = "/";
  private warmRoute: string | null = null;
  private lru: string[] = [];
  private cleanupMap = new Map<string, CleanupFn[]>();
  private cooldownTimer: number | null = null;
  private lastUsedAt = new Map<string, number>();

  getState(route: string): RouteState {
    if (route === this.hotRoute) return "hot";
    const lastUsed = this.lastUsedAt.get(route) ?? 0;
    if (route === this.warmRoute && Date.now() - lastUsed <= WARM_WINDOW_MS) return "warm";
    return "cold";
  }

  registerCleanup(route: string, cleanup: CleanupFn): () => void {
    const current = this.cleanupMap.get(route) ?? [];
    this.cleanupMap.set(route, [...current, cleanup]);
    return () => {
      const next = (this.cleanupMap.get(route) ?? []).filter((fn) => fn !== cleanup);
      this.cleanupMap.set(route, next);
    };
  }

  promoteHot(route: string): { hot: string; warm: string | null; cooled: string | null } {
    const previousHot = this.hotRoute;
    this.hotRoute = route;
    this.touch(route);
    this.warmRoute = this.pickWarm(route);
    this.clearCooldown();

    let cooled: string | null = null;
    if (previousHot && previousHot !== route) {
      this.cooldownTimer = window.setTimeout(() => {
        this.coolRoute(previousHot);
      }, COOLDOWN_MS);
      cooled = previousHot;
    }

    return { hot: this.hotRoute, warm: this.warmRoute, cooled };
  }

  private coolRoute(route: string): void {
    const cleanups = this.cleanupMap.get(route) ?? [];
    cleanups.forEach((fn) => fn());
    window.dispatchEvent(new CustomEvent("route:cooled", { detail: { route } }));
  }

  private pickWarm(activeRoute: string): string | null {
    const now = Date.now();
    const ringIndex = ROUTE_RING.indexOf(activeRoute);
    const adjacent = ringIndex >= 0 ? ROUTE_RING[(ringIndex + 1) % ROUTE_RING.length] : null;
    if (adjacent && adjacent !== activeRoute) {
      const adjacentLastUsed = this.lastUsedAt.get(adjacent) ?? 0;
      if ((now - adjacentLastUsed) <= WARM_WINDOW_MS) return adjacent;
    }
    return this.lru.find((route) => route !== activeRoute && (now - (this.lastUsedAt.get(route) ?? 0)) <= WARM_WINDOW_MS) ?? null;
  }

  private touch(route: string): void {
    this.lastUsedAt.set(route, Date.now());
    this.lru = [route, ...this.lru.filter((item) => item !== route)].slice(0, ROUTE_RING.length);
  }

  private clearCooldown(): void {
    if (this.cooldownTimer !== null) {
      window.clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }
}

export const routeHeatManager = new RouteHeatManager();
