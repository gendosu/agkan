import { addBoardStreamListener } from './boardStream';

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

export function initAttentionStream(): void {
  addBoardStreamListener('attention', (raw) => {
    const msg = raw as AttentionMessage;
    if (msg.type === 'snapshot') {
      msg.taskIds.forEach((id) => applyAttention(id, true));
    } else if (msg.type === 'update') {
      applyAttention(msg.taskId, msg.needsAttention);
    }
  });
}
