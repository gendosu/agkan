// Utility functions

export function escapeHtmlClient(str: string | null | undefined): string {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

export function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + 'd ago';
  const mo = Math.floor(day / 30);
  if (mo < 12) return mo + 'mo ago';
  return Math.floor(mo / 12) + 'y ago';
}

export function showToast(msg?: string): void {
  const toast = document.getElementById('toast') as HTMLElement | null;
  if (!toast) return;
  if (msg) toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
