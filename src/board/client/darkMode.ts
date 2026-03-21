// Dark mode / light mode support with localStorage persistence and server-side config

const STORAGE_KEY = 'agkan-theme';

export type ThemePreference = 'dark' | 'light' | 'system';

export function getThemePreference(): 'dark' | 'light' | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return null;
}

export function saveThemePreference(theme: 'dark' | 'light'): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function clearThemePreference(): void {
  localStorage.removeItem(STORAGE_KEY);
}

async function persistThemeToServer(theme: ThemePreference): Promise<void> {
  try {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: { theme } }),
    });
  } catch {
    // Ignore network errors - localStorage is the fallback
  }
}

export function getCurrentEffectiveTheme(): 'dark' | 'light' {
  const stored = getThemePreference();
  if (stored) return stored;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function applyTheme(preference: ThemePreference): void {
  if (preference === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (preference === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function getActivePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return 'system';
}

function updateCheckmarks(active: ThemePreference): void {
  const items: Record<ThemePreference, string> = {
    dark: 'burger-theme-dark',
    light: 'burger-theme-light',
    system: 'burger-theme-system',
  };

  for (const [pref, id] of Object.entries(items) as [ThemePreference, string][]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (pref === active) {
      if (!el.textContent?.startsWith('\u2713 ')) {
        el.textContent = '\u2713 ' + el.textContent?.replace(/^\u2713 /, '');
      }
    } else {
      el.textContent = el.textContent?.replace(/^\u2713 /, '') ?? el.textContent;
    }
  }
}

export async function loadThemeFromServer(): Promise<ThemePreference | null> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return null;
    const data = (await res.json()) as { board?: { theme?: string } };
    const theme = data?.board?.theme;
    if (theme === 'dark' || theme === 'light' || theme === 'system') {
      return theme;
    }
    return null;
  } catch {
    return null;
  }
}

export function initDarkMode(): void {
  // Apply stored or system preference on init (localStorage as fallback until server responds)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
  }

  const activePreference = getActivePreference();
  updateCheckmarks(activePreference);

  // Load from server config and apply if different from localStorage
  void loadThemeFromServer().then((serverTheme) => {
    if (serverTheme !== null) {
      if (serverTheme === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, serverTheme);
      }
      applyTheme(serverTheme);
      updateCheckmarks(serverTheme);
    }
  });

  document.getElementById('burger-theme-dark')?.addEventListener('click', () => {
    saveThemePreference('dark');
    applyTheme('dark');
    updateCheckmarks('dark');
    void persistThemeToServer('dark');
  });

  document.getElementById('burger-theme-light')?.addEventListener('click', () => {
    saveThemePreference('light');
    applyTheme('light');
    updateCheckmarks('light');
    void persistThemeToServer('light');
  });

  document.getElementById('burger-theme-system')?.addEventListener('click', () => {
    clearThemePreference();
    applyTheme('system');
    updateCheckmarks('system');
    void persistThemeToServer('system');
  });
}
