// Dark mode / light mode support with SSR data-theme attribute

export type ThemePreference = 'dark' | 'light' | 'system';

export function getCurrentEffectiveTheme(): 'dark' | 'light' {
  const ssrTheme = document.documentElement.getAttribute('data-theme');
  if (ssrTheme === 'dark' || ssrTheme === 'light') return ssrTheme;
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

async function persistThemeToServer(theme: ThemePreference): Promise<void> {
  try {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board: { theme } }),
    });
  } catch {
    // Ignore network errors
  }
}

function getActivePreference(): ThemePreference {
  const ssrTheme = document.documentElement.getAttribute('data-theme');
  if (ssrTheme === 'dark' || ssrTheme === 'light') return ssrTheme;
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
  // Read initial theme from SSR data-theme attribute (set server-side from config.yml)
  const activePreference = getActivePreference();
  updateCheckmarks(activePreference);

  document.getElementById('burger-theme-dark')?.addEventListener('click', () => {
    applyTheme('dark');
    updateCheckmarks('dark');
    void persistThemeToServer('dark');
  });

  document.getElementById('burger-theme-light')?.addEventListener('click', () => {
    applyTheme('light');
    updateCheckmarks('light');
    void persistThemeToServer('light');
  });

  document.getElementById('burger-theme-system')?.addEventListener('click', () => {
    applyTheme('system');
    updateCheckmarks('system');
    void persistThemeToServer('system');
  });
}
