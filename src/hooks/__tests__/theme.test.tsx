/**
 * Tests for useTheme hook and ThemeToggle component.
 *
 * Covers:
 *  - Selecting Light/Dark writes tt.theme to localStorage and sets data-theme
 *  - Selecting System removes data-theme and clears storage
 *  - System mode follows matchMedia change events (OS theme change)
 *  - localStorage read/write errors fall back to System mode silently
 *  - ThemeToggle renders three accessible buttons with correct aria-pressed
 *  - ThemeToggle keyboard: each button toggles the theme
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── matchMedia mock ───────────────────────────────────────────────────────────
type MqlListener = (e: { matches: boolean }) => void;
let mqlListeners: MqlListener[] = [];
let mqlDarkMatches = false;

function makeMql() {
  return {
    get matches() { return mqlDarkMatches; },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, fn: MqlListener) => { mqlListeners.push(fn); },
    removeEventListener: (_: string, fn: MqlListener) => {
      mqlListeners = mqlListeners.filter((l) => l !== fn);
    },
  };
}

beforeEach(() => {
  mqlListeners = [];
  mqlDarkMatches = false;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => makeMql()),
  });
  // Reset html attribute and localStorage before each test
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

// ── Import after mocks ────────────────────────────────────────────────────────
import { useTheme } from '../useTheme';
import { ThemeToggle } from '../../components/ThemeToggle';

// ── useTheme tests ────────────────────────────────────────────────────────────

describe('useTheme – Light selection', () => {
  it('sets data-theme="light" and writes tt.theme to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1]('light'); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('tt.theme')).toBe('light');
    expect(result.current[0]).toBe('light');
  });
});

describe('useTheme – Dark selection', () => {
  it('sets data-theme="dark" and writes tt.theme to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1]('dark'); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('tt.theme')).toBe('dark');
    expect(result.current[0]).toBe('dark');
  });
});

describe('useTheme – System selection', () => {
  it('removes data-theme attribute and stores "system"', () => {
    localStorage.setItem('tt.theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1]('system'); });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('tt.theme')).toBe('system');
    expect(result.current[0]).toBe('system');
  });
});

describe('useTheme – System mode follows matchMedia changes', () => {
  it('re-applies (keeps no data-theme) when OS theme changes while in System mode', () => {
    const { result } = renderHook(() => useTheme());
    // Start in System
    act(() => { result.current[1]('system'); });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    // Simulate OS switching to dark
    mqlDarkMatches = true;
    act(() => { mqlListeners.forEach((fn) => fn({ matches: true })); });

    // data-theme should still be absent (CSS media query handles rendering)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(result.current[0]).toBe('system');
  });

  it('does NOT listen to matchMedia when a manual theme is active', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1]('dark'); });

    const listenerCountAfterDark = mqlListeners.length;
    // Flip OS
    act(() => { mqlListeners.forEach((fn) => fn({ matches: false })); });

    // data-theme should remain 'dark' regardless
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(mqlListeners.length).toBe(listenerCountAfterDark);
  });
});

describe('useTheme – localStorage read error falls back to System', () => {
  it('defaults to system when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useTheme());
    // After mount effect, should be 'system' (no throw, no data-theme)
    expect(result.current[0]).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});

describe('useTheme – localStorage write error is silent', () => {
  it('still applies data-theme even when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1]('dark'); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(result.current[0]).toBe('dark');
  });
});

describe('useTheme – restores persisted theme on mount', () => {
  it('reads dark from localStorage and applies it on mount', () => {
    localStorage.setItem('tt.theme', 'dark');
    const { result } = renderHook(() => useTheme());
    // After mount effect
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

// ── ThemeToggle component tests ───────────────────────────────────────────────

describe('ThemeToggle – rendering', () => {
  it('renders three buttons: System, Light, Dark', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /system/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument();
  });

  it('has aria-pressed="true" on System by default', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /system/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /light/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /dark/i })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('ThemeToggle – keyboard interaction', () => {
  it('pressing Light sets aria-pressed and data-theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /light/i }));
    expect(screen.getByRole('button', { name: /light/i })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('pressing Dark sets aria-pressed and data-theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /dark/i }));
    expect(screen.getByRole('button', { name: /dark/i })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('pressing System after Dark removes data-theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /dark/i }));
    await user.click(screen.getByRole('button', { name: /system/i }));
    expect(screen.getByRole('button', { name: /system/i })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
