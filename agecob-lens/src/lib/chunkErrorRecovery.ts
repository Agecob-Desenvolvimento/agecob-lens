const CHUNK_ERROR_PATTERN = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;
const RELOAD_GUARD_KEY = "agdash:chunk-reload-attempted";

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR_PATTERN.test(error.message);
}

/** Force a one-time full reload to pick up a fresh build after a stale-chunk fetch failure. */
export function reloadOnChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error) || sessionStorage.getItem(RELOAD_GUARD_KEY)) return false;
  sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  window.location.reload();
  return true;
}
