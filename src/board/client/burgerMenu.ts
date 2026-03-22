// Burger menu, purge tasks, version info, and dark mode functionality

import { initDarkMode } from './darkMode';
import { refreshBoardCards } from './boardPolling';

function initBurgerToggle(burgerBtn: HTMLButtonElement, burgerDropdown: HTMLElement): void {
  burgerBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    burgerDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!burgerDropdown.contains(e.target as Node) && e.target !== burgerBtn) {
      burgerDropdown.classList.remove('open');
    }
  });
}

async function executePurge(): Promise<void> {
  try {
    const res = await fetch('/api/tasks/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      await refreshBoardCards();
    }
  } catch {
    // Ignore errors during purge
  }
}

function initPurgeModal(burgerDropdown: HTMLElement): void {
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

  purgeConfirmBtn.addEventListener('click', () => {
    purgeModal.classList.remove('show');
    void executePurge();
  });
}

function initVersionModal(burgerDropdown: HTMLElement): void {
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

function initExportModal(burgerDropdown: HTMLElement): void {
  document.getElementById('burger-export-tasks')?.addEventListener('click', () => {
    burgerDropdown.classList.remove('open');
    const a = document.createElement('a');
    a.href = '/api/export';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

function initImportModal(burgerDropdown: HTMLElement): void {
  const importModal = document.getElementById('import-modal') as HTMLElement;
  const importCancelBtn = document.getElementById('import-cancel-btn') as HTMLButtonElement;
  const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement;
  const importResultEl = document.getElementById('import-result') as HTMLElement;
  const importDropZone = document.getElementById('import-drop-zone') as HTMLElement;
  const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

  let selectedFile: File | null = null;

  function setFile(file: File): void {
    selectedFile = file;
    importResultEl.textContent = `Selected: ${file.name}`;
    importResultEl.style.color = '#64748b';
    importConfirmBtn.disabled = false;
  }

  document.getElementById('burger-import-tasks')?.addEventListener('click', () => {
    burgerDropdown.classList.remove('open');
    selectedFile = null;
    importResultEl.textContent = '';
    importConfirmBtn.disabled = true;
    importFileInput.value = '';
    importModal.classList.add('show');
  });

  importCancelBtn.addEventListener('click', () => {
    importModal.classList.remove('show');
  });

  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files?.[0];
    if (file) setFile(file);
  });

  importDropZone.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    importDropZone.style.borderColor = '#3b82f6';
  });

  importDropZone.addEventListener('dragleave', () => {
    importDropZone.style.borderColor = '#94a3b8';
  });

  importDropZone.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    importDropZone.style.borderColor = '#94a3b8';
    const file = e.dataTransfer?.files?.[0];
    if (file) setFile(file);
  });

  importConfirmBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    importConfirmBtn.disabled = true;
    importConfirmBtn.textContent = 'Importing...';
    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) {
        importResultEl.textContent = `Imported ${result.importedCount} task(s) successfully.`;
        importResultEl.style.color = '#16a34a';
        setTimeout(() => {
          importModal.classList.remove('show');
          location.reload();
        }, 1500);
      } else {
        importResultEl.textContent = 'Error: ' + (result.error || 'Unknown error');
        importResultEl.style.color = '#dc2626';
      }
    } catch {
      importResultEl.textContent = 'Failed to import tasks. Invalid JSON file.';
      importResultEl.style.color = '#dc2626';
    } finally {
      importConfirmBtn.disabled = false;
      importConfirmBtn.textContent = 'Import';
    }
  });
}

export function initBurgerMenu(): void {
  const burgerBtn = document.getElementById('burger-menu-btn') as HTMLButtonElement;
  const burgerDropdown = document.getElementById('burger-menu-dropdown') as HTMLElement;

  initBurgerToggle(burgerBtn, burgerDropdown);
  initPurgeModal(burgerDropdown);
  initExportModal(burgerDropdown);
  initImportModal(burgerDropdown);
  initVersionModal(burgerDropdown);
  initDarkMode();
}
