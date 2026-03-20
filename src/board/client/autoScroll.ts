// Auto-scroll during drag within column bodies

let autoScrollRAF: number | null = null;
let autoScrollBody: HTMLElement | null = null;
let autoScrollDir = 0;
const AUTO_SCROLL_ZONE = 60;
const AUTO_SCROLL_SPEED = 8;

export function stopAutoScroll(): void {
  if (autoScrollRAF !== null) {
    cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
  }
  autoScrollBody = null;
  autoScrollDir = 0;
}

function startAutoScroll(): void {
  if (autoScrollRAF !== null) return;
  function step(): void {
    if (autoScrollBody && autoScrollDir !== 0) {
      autoScrollBody.scrollTop += autoScrollDir * AUTO_SCROLL_SPEED;
      autoScrollRAF = requestAnimationFrame(step);
    } else {
      autoScrollRAF = null;
    }
  }
  autoScrollRAF = requestAnimationFrame(step);
}

export function attachAutoScrollToBody(body: HTMLElement): void {
  body.addEventListener('dragover', (e: DragEvent) => {
    const rect = body.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < AUTO_SCROLL_ZONE) {
      autoScrollBody = body;
      autoScrollDir = -1;
      startAutoScroll();
    } else if (y > rect.height - AUTO_SCROLL_ZONE) {
      autoScrollBody = body;
      autoScrollDir = 1;
      startAutoScroll();
    } else {
      stopAutoScroll();
    }
  });
  body.addEventListener('dragleave', stopAutoScroll);
  body.addEventListener('drop', stopAutoScroll);
}

export function initAutoScroll(): void {
  document.querySelectorAll<HTMLElement>('.column-body').forEach(attachAutoScrollToBody);
  document.addEventListener('dragend', stopAutoScroll);
}
