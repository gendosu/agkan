// Burger menu, purge tasks, and version info functionality

export function initBurgerMenu(): void {
  const burgerBtn = document.getElementById('burger-menu-btn') as HTMLButtonElement;
  const burgerDropdown = document.getElementById('burger-menu-dropdown') as HTMLElement;

  burgerBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    burgerDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!burgerDropdown.contains(e.target as Node) && e.target !== burgerBtn) {
      burgerDropdown.classList.remove('open');
    }
  });

  // Purge tasks
  const purgeModal = document.getElementById('purge-confirm-modal') as HTMLElement;
  const purgeConfirmBtn = document.getElementById('purge-confirm-btn') as HTMLButtonElement;
  const purgeCancelBtn = document.getElementById('purge-cancel-btn') as HTMLButtonElement;
  const purgeResultEl = document.getElementById('purge-result') as HTMLElement;

  document.getElementById('burger-purge-tasks')?.addEventListener('click', () => {
    burgerDropdown.classList.remove('open');
    purgeResultEl.textContent = '';
    purgeModal.classList.add('show');
  });

  purgeCancelBtn.addEventListener('click', () => {
    purgeModal.classList.remove('show');
  });

  purgeConfirmBtn.addEventListener('click', async () => {
    purgeConfirmBtn.disabled = true;
    purgeConfirmBtn.textContent = 'Purging...';
    try {
      const res = await fetch('/api/tasks/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        purgeResultEl.textContent = 'Purged ' + data.count + ' task(s).';
        setTimeout(() => {
          purgeModal.classList.remove('show');
        }, 1500);
        location.reload();
      } else {
        purgeResultEl.textContent = 'Error: ' + (data.error || 'Unknown error');
      }
    } catch {
      purgeResultEl.textContent = 'Failed to purge tasks.';
    } finally {
      purgeConfirmBtn.disabled = false;
      purgeConfirmBtn.textContent = 'Purge';
    }
  });

  // Version info
  const versionModal = document.getElementById('version-info-modal') as HTMLElement;
  const versionCloseBtn = document.getElementById('version-info-close') as HTMLButtonElement;
  const versionTextEl = document.getElementById('version-info-text') as HTMLElement;

  document.getElementById('burger-version-info')?.addEventListener('click', async () => {
    burgerDropdown.classList.remove('open');
    versionTextEl.textContent = 'Loading...';
    versionModal.classList.add('show');
    try {
      const res = await fetch('/api/version');
      const data = await res.json();
      versionTextEl.textContent = 'agkan v' + data.version;
    } catch {
      versionTextEl.textContent = 'Failed to load version.';
    }
  });

  versionCloseBtn.addEventListener('click', () => {
    versionModal.classList.remove('show');
  });
}
