export const MENU_CACHE_TTL_MS = 5 * 60 * 1000;

export function createCache<T>({ ttlMs, clock, load }: { ttlMs: number; clock: () => Date; load: () => Promise<T> }) {
  let entry: { value: T; expiresAt: number } | undefined;

  return async function get(): Promise<T> {
    const now = clock().getTime();
    if (entry && now < entry.expiresAt) return entry.value;
    const value = await load();
    entry = { value, expiresAt: now + ttlMs };
    return value;
  };
}
