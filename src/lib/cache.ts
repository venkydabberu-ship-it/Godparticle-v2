// Simple localStorage cache with TTL. Silently no-ops if localStorage unavailable.

export function getCached<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) { localStorage.removeItem(key); return null; }
    return data as T;
  } catch { return null; }
}

export function setCached<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function clearCached(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}
