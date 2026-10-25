'use client';

import { useTheme, type Theme } from '@/hooks/useTheme';

const OPTIONS: { value: Theme; icon: string; label: string }[] = [
  { value: 'system', icon: '⊙', label: 'System' },
  { value: 'light',  icon: '☀',  label: 'Light'  },
  { value: 'dark',   icon: '☾',  label: 'Dark'   },
];

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map(({ value, icon, label }) => (
        <button
          key={value}
          type="button"
          className="theme-btn"
          aria-pressed={theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
        >
          <span aria-hidden="true">{icon}</span>
          <span className="theme-btn-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
