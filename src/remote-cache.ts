export interface RemoteCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class RemoteCache<T> {
  private entries = new Map<string, RemoteCacheEntry<T>>();

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttl: number, now = Date.now()): void {
    if (ttl > 0) this.entries.set(key, { value, expiresAt: now + ttl });
  }

  clear(): void {
    this.entries.clear();
  }
}
