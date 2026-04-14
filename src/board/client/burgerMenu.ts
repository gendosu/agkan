// Burger menu, purge tasks, version info, settings, and dark mode functionality

import { initDarkMode } from './darkMode';
import { refreshBoardCards } from './boardPolling';

type LlmPreference = 'codex' | 'claude';

function normalizeLlm(value: unknown): LlmPreference {
  return value === 'codex' ? 'codex' : 'claude';
}

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

async function executePurge(purgeResultEl: HTMLElement): Promise<void> {
  try {
    const res = await fetch('/api/tasks/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      await refreshBoardCards();
    } else {
      purgeResultEl.textContent = 'Failed to purge tasks. Please try again.';
      purgeResultEl.style.color = '#dc2626';
    }
  } catch {
    purgeResultEl.textContent = 'Failed to purge tasks. Network error.';
    purgeResultEl.style.color = '#dc2626';
  }
}

async function executeArchive(archiveResultEl: HTMLElement): Promise<{ count: number } | null> {
  try {
    const res = await fetch('/api/tasks/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = (await res.json()) as { count: number };
      await refreshBoardCards();
      return data;
    } else {
      archiveResultEl.textContent = 'Failed to archive tasks. Please try again.';
      archiveResultEl.style.color = '#dc2626';
    }
  } catch {
    archiveResultEl.textContent = 'Failed to archive tasks. Network error.';
    archiveResultEl.style.color = '#dc2626';
  }
  return null;
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
    void executePurge(purgeResultEl);
  });
}

function initArchiveModal(burgerDropdown: HTMLElement): void {
  const archiveModal = document.getElementById('archive-confirm-modal');
  const archiveConfirmBtn = document.getElementById('archive-confirm-btn') as HTMLButtonElement | null;
  const archiveCancelBtn = document.getElementById('archive-cancel-btn') as HTMLButtonElement | null;
  const archiveResultEl = document.getElementById('archive-result');

  if (!archiveModal || !archiveConfirmBtn || !archiveCancelBtn || !archiveResultEl) {
    return;
  }

  const safeArchiveModal = archiveModal as HTMLElement;
  const safeArchiveResultEl = archiveResultEl as HTMLElement;

  document.getElementById('burger-archive-tasks')?.addEventListener('click', () => {
    burgerDropdown.classList.remove('open');
    safeArchiveResultEl.textContent = '';
    safeArchiveModal.classList.add('show');
  });

  archiveCancelBtn.addEventListener('click', () => {
    safeArchiveModal.classList.remove('show');
  });

  archiveConfirmBtn.addEventListener('click', async () => {
    const result = await executeArchive(safeArchiveResultEl);
    if (result !== null) {
      safeArchiveModal.classList.remove('show');
    }
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

function initSettingsModal(burgerDropdown: HTMLElement): void {
  const settingsModal = document.getElementById('settings-modal') as HTMLElement | null;
  const settingsSelect = document.getElementById('settings-llm-select') as HTMLSelectElement | null;
  const settingsResultEl = document.getElementById('settings-result') as HTMLElement | null;
  const settingsCancelBtn = document.getElementById('settings-cancel-btn') as HTMLButtonElement | null;
  const settingsSaveBtn = document.getElementById('settings-save-btn') as HTMLButtonElement | null;

  if (!settingsModal || !settingsSelect || !settingsResultEl || !settingsCancelBtn || !settingsSaveBtn) {
    return;
  }

  document.getElementById('burger-settings')?.addEventListener('click', async () => {
    burgerDropdown.classList.remove('open');
    settingsResultEl.textContent = '';
    settingsResultEl.style.color = '#64748b';
    settingsSelect.value = 'claude';
    settingsModal.classList.add('show');

    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = (await res.json()) as { board?: { llm?: unknown } };
        settingsSelect.value = normalizeLlm(data?.board?.llm);
      }
    } catch {
      // Ignore load errors and keep default
    }
  });

  settingsCancelBtn.addEventListener('click', () => {
    settingsModal.classList.remove('show');
  });

  settingsSaveBtn.addEventListener('click', async () => {
    const selected = normalizeLlm(settingsSelect.value);
    settingsSaveBtn.disabled = true;
    settingsSaveBtn.textContent = 'Saving...';

    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: { llm: selected } }),
      });

      if (res.ok) {
        settingsResultEl.textContent = 'Saved.';
        settingsResultEl.style.color = '#16a34a';
        setTimeout(() => {
          settingsModal.classList.remove('show');
        }, 250);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        settingsResultEl.textContent = data.error || 'Failed to save settings.';
        settingsResultEl.style.color = '#dc2626';
      }
    } catch {
      settingsResultEl.textContent = 'Failed to save settings.';
      settingsResultEl.style.color = '#dc2626';
    } finally {
      settingsSaveBtn.disabled = false;
      settingsSaveBtn.textContent = 'Save';
    }
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
  const importModal = document.getElementById('import-modal');
  const importCancelBtn = document.getElementById('import-cancel-btn');
  const importConfirmBtn = document.getElementById('import-confirm-btn') as HTMLButtonElement | null;
  const importResultEl = document.getElementById('import-result');
  const importDropZone = document.getElementById('import-drop-zone');
  const importFileInput = document.getElementById('import-file-input') as HTMLInputElement | null;

  if (!importModal || !importCancelBtn || !importConfirmBtn || !importResultEl || !importDropZone || !importFileInput) {
    return;
  }

  const safeImportModal = importModal as HTMLElement;
  const safeImportCancelBtn = importCancelBtn as HTMLButtonElement;
  const safeImportConfirmBtn = importConfirmBtn as HTMLButtonElement;
  const safeImportResultEl = importResultEl as HTMLElement;
  const safeImportDropZone = importDropZone as HTMLElement;
  const safeImportFileInput = importFileInput as HTMLInputElement;

  let selectedFile: File | null = null;

  function setFile(file: File): void {
    selectedFile = file;
    safeImportResultEl.textContent = `Selected: ${file.name}`;
    safeImportResultEl.style.color = '#64748b';
    safeImportConfirmBtn.disabled = false;
  }

  document.getElementById('burger-import-tasks')?.addEventListener('click', () => {
    burgerDropdown.classList.remove('open');
    selectedFile = null;
    safeImportResultEl.textContent = '';
    safeImportConfirmBtn.disabled = true;
    safeImportFileInput.value = '';
    safeImportModal.classList.add('show');
  });

  safeImportCancelBtn.addEventListener('click', () => {
    safeImportModal.classList.remove('show');
  });

  safeImportFileInput.addEventListener('change', () => {
    const file = safeImportFileInput.files?.[0];
    if (file) setFile(file);
  });

  safeImportDropZone.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    safeImportDropZone.style.borderColor = '#3b82f6';
  });

  safeImportDropZone.addEventListener('dragleave', () => {
    safeImportDropZone.style.borderColor = '#94a3b8';
  });

  safeImportDropZone.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    safeImportDropZone.style.borderColor = '#94a3b8';
    const file = e.dataTransfer?.files?.[0];
    if (file) setFile(file);
  });

  safeImportConfirmBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    safeImportConfirmBtn.disabled = true;
    safeImportConfirmBtn.textContent = 'Importing...';
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
        safeImportResultEl.textContent = `Imported ${result.importedCount} task(s) successfully.`;
        safeImportResultEl.style.color = '#16a34a';
        setTimeout(() => {
          safeImportModal.classList.remove('show');
          location.reload();
        }, 1500);
      } else {
        safeImportResultEl.textContent = 'Error: ' + (result.error || 'Unknown error');
        safeImportResultEl.style.color = '#dc2626';
      }
    } catch {
      safeImportResultEl.textContent = 'Failed to import tasks. Invalid JSON file.';
      safeImportResultEl.style.color = '#dc2626';
    } finally {
      safeImportConfirmBtn.disabled = false;
      safeImportConfirmBtn.textContent = 'Import';
    }
  });
}

export function initBurgerMenu(): void {
  const burgerBtn = document.getElementById('burger-menu-btn') as HTMLButtonElement;
  const burgerDropdown = document.getElementById('burger-menu-dropdown') as HTMLElement;

  initBurgerToggle(burgerBtn, burgerDropdown);
  initPurgeModal(burgerDropdown);
  initArchiveModal(burgerDropdown);
  initExportModal(burgerDropdown);
  initImportModal(burgerDropdown);
  initSettingsModal(burgerDropdown);
  initVersionModal(burgerDropdown);
  initDarkMode();
}
