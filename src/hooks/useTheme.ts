'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'tt.theme';

/** Read from localStorage, falling back to 'system' on any error. */
function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // storage unavailable (private browsing, SecurityError, etc.)
  }
  return 'system';
}

/** Apply data-theme attribute to <html> and return the effective color-scheme. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>('system');

  // Initialise from storage on mount (client only)
  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  // When in System mode, follow OS changes
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system'); // re-apply removes data-theme; CSS handles the rest
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // storage write failure — still apply in-memory
    }
    setThemeState(t);
    applyTheme(t);
  }, []);

  return [theme, setTheme];
}
