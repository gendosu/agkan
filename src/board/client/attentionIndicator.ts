import { setStreamState, registerReconnect } from './connectionStatus';

type AttentionMessage =
  | { type: 'snapshot'; taskIds: number[] }
  | { type: 'update'; taskId: number; needsAttention: boolean };

export function applyAttention(taskId: number, needs: boolean): void {
  const card = document.querySelector<HTMLElement>(`[data-id="${taskId}"]`);
  if (!card) return;
  const slot = card.querySelector<HTMLElement>('.attention-indicator');
  if (!slot) return;
  if (needs) {
    slot.innerHTML = '<span title="質問待ち" class="icon-question">❓</span>';
    slot.classList.add('is-active');
  } else {
    slot.innerHTML = '';
    slot.classList.remove('is-active');
  }
}

export function startAttentionStream(): () => void {
  let backoffMs = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let es: EventSource;
  let stopped = false;

  function connect(): void {
    es = new EventSource('/api/attention/stream');
    setStreamState('attention', 'connecting');

    es.addEventListener('open', () => {
      setStreamState('attention', 'connected');
      backoffMs = 1000;
    });

    es.onmessage = (e) => {
      let msg: AttentionMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'snapshot') {
        msg.taskIds.forEach((id) => applyAttention(id, true));
      } else if (msg.type === 'update') {
        applyAttention(msg.taskId, msg.needsAttention);
      }
    };

    es.onerror = () => {
      if (stopped) return;
      setStreamState('attention', 'disconnected');
      es.close();
      reconnectTimer = setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, 30000);
        connect();
      }, backoffMs);
    };
  }

  function reconnectNow(): void {
    if (stopped) return;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    es.close();
    backoffMs = 1000;
    connect();
  }

  connect();
  const unregister = registerReconnect(reconnectNow);

  return () => {
    stopped = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    unregister();
    es.close();
  };
}
