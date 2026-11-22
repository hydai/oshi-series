/** A JSON cache with per-entry lifetimes. Failures only cost a cache miss. */
export interface JsonCache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

// KV refuses expirationTtl below 60 seconds.
const KV_MIN_TTL = 60;

export function kvCache(kv: KVNamespace): JsonCache {
  return {
    async get<T>(key: string) {
      try {
        return await kv.get<T>(key, "json");
      } catch (error) {
        console.warn(`cache read failed for ${key}:`, error);
        return null;
      }
    },
    async put(key, value, ttlSeconds) {
      try {
        await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(KV_MIN_TTL, Math.ceil(ttlSeconds)) });
      } catch (error) {
        // e.g. two concurrent misses writing the same key within a second.
        console.warn(`cache write failed for ${key}:`, error);
      }
    },
  };
}

/** Returns the cached value for `key`, or loads, stores and returns it. */
export async function remember<T>(
  cache: JsonCache,
  key: string,
  ttlSeconds: (value: T) => number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;
  const value = await load();
  await cache.put(key, value, ttlSeconds(value));
  return value;
}
