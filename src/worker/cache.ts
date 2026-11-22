/** A JSON cache with per-entry lifetimes. Failures only cost a cache miss. */
export interface JsonCache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
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
    async delete(key) {
      try {
        await kv.delete(key);
      } catch (error) {
        console.warn(`cache delete failed for ${key}:`, error);
      }
    },
  };
}
