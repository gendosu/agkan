export type AttentionUpdate = { taskId: number; needsAttention: boolean };
export type AttentionSubscriber = (update: AttentionUpdate) => void;

export class AttentionStateService {
  private state = new Map<number, boolean>();
  private subscribers = new Set<AttentionSubscriber>();

  setAttention(taskId: number, needs: boolean): void {
    const prev = this.state.get(taskId) ?? false;
    if (prev === needs) return;
    this.state.set(taskId, needs);
    this.notify({ taskId, needsAttention: needs });
  }

  getAttention(taskId: number): boolean {
    return this.state.get(taskId) ?? false;
  }

  listAttentionTasks(): number[] {
    return [...this.state.entries()].filter(([, v]) => v).map(([k]) => k);
  }

  clearTask(taskId: number): void {
    const prev = this.state.get(taskId);
    if (prev === undefined) return;
    this.state.delete(taskId);
    if (prev) {
      this.notify({ taskId, needsAttention: false });
    }
  }

  subscribe(cb: AttentionSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify(update: AttentionUpdate): void {
    for (const cb of this.subscribers) {
      cb(update);
    }
  }
}
