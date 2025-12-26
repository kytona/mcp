export class TtlCache<T> {
  private readonly cache = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

