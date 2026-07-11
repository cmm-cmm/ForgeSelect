export type Handler = (...args: unknown[]) => void;

export class Emitter {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
  }

  off(event: string, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) handler(...args);
  }

  clear(): void {
    this.handlers.clear();
  }
}
