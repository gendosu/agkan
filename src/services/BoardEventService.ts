type Listener = () => void;

export class BoardEventService {
  private listeners: Listener[] = [];

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  listenerCount(): number {
    return this.listeners.length;
  }
}
