'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type ReactNode,
} from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
}

export interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id?: number) => void;
}

interface ToastEntry {
  id: number;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
  expiresAt: number;
}

export const TOAST_DURATION_MS = 5000;
export const ERROR_TOAST_DURATION_MS = 8000;
export const MAX_VISIBLE_TOASTS = 3;

const TICK_MS = 100;

const durationFor = (variant: ToastVariant) =>
  variant === 'error' ? ERROR_TOAST_DURATION_MS : TOAST_DURATION_MS;

const ICONS: Record<ToastVariant, string> = { success: '✓', error: '!', info: 'i' };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

const NOOP_TOAST: ToastApi = { success: () => {}, error: () => {}, info: () => {}, dismiss: () => {} };

/** Like useToast, but a no-op when rendered outside a ToastProvider (e.g. isolated component tests). */
export function useOptionalToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOAST;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(1);
  const pausedRef = useRef(false);
  const regionRef = useRef<HTMLDivElement | null>(null);

  const setPausedState = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPaused(value);
  }, []);

  const dismiss = useCallback((id?: number) => {
    setToasts((prev) => (id === undefined ? [] : prev.filter((t) => t.id !== id)));
  }, []);

  const push = useCallback((variant: ToastVariant, message: string, options?: ToastOptions) => {
    const id = nextId.current++;
    setToasts((prev) => {
      const now = Date.now();
      const duration = durationFor(variant);
      const last = prev[prev.length - 1];
      if (last && last.variant === variant && last.message === message) {
        const refreshed: ToastEntry = {
          ...last,
          action: options?.action ?? last.action,
          expiresAt: now + duration,
        };
        return [...prev.slice(0, -1), refreshed];
      }
      const next: ToastEntry[] = [...prev, { id, variant, message, action: options?.action, expiresAt: now + duration }];
      return next.length > MAX_VISIBLE_TOASTS ? next.slice(next.length - MAX_VISIBLE_TOASTS) : next;
    });
  }, []);

  const success = useCallback(
    (message: string, options?: ToastOptions) => push('success', message, options),
    [push],
  );
  const error = useCallback(
    (message: string, options?: ToastOptions) => push('error', message, options),
    [push],
  );
  const info = useCallback(
    (message: string, options?: ToastOptions) => push('info', message, options),
    [push],
  );

  const api = useMemo<ToastApi>(() => ({ success, error, info, dismiss }), [success, error, info, dismiss]);

  useEffect(() => {
    const timer = setInterval(() => {
      setToasts((prev) => {
        if (prev.length === 0) return prev;
        if (pausedRef.current) {
          return prev.map((t) => ({ ...t, expiresAt: t.expiresAt + TICK_MS }));
        }
        const now = Date.now();
        const kept = prev.filter((t) => t.expiresAt > now);
        return kept.length === prev.length ? prev : kept;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // On small screens the fixed region can overlap the element the user is
  // typing into; move it to the top while that is happening.
  useEffect(() => {
    const onFocusIn = (event: Event) => {
      const region = regionRef.current;
      const target = event.target as HTMLElement | null;
      if (!region || typeof target?.getBoundingClientRect !== 'function' || window.innerWidth > 480) return;
      const r = region.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const overlaps = t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top;
      region.classList.toggle('toast-region--raised', overlaps);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && regionRef.current?.contains(next)) return;
    setPausedState(false);
  };

  const renderToast = (toast: ToastEntry) => (
    <div
      key={toast.id}
      className={`toast toast-${toast.variant}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss(toast.id);
      }}
    >
      <span className="toast-body">
        <span className="toast-icon" aria-hidden="true">
          {ICONS[toast.variant]}
        </span>
        <span className="toast-message">{toast.message}</span>
      </span>
      {toast.action && (
        <button
          type="button"
          className="btn btn-secondary btn-sm toast-action"
          onClick={() => {
            toast.action?.onClick();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-region"
        data-paused={paused ? '' : undefined}
        ref={regionRef}
        onMouseEnter={() => setPausedState(true)}
        onMouseLeave={() => setPausedState(false)}
        onFocus={() => setPausedState(true)}
        onBlur={handleBlur}
      >
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.filter((t) => t.variant !== 'error').map(renderToast)}
        </div>
        <div className="toast-stack" role="alert" aria-live="assertive">
          {toasts.filter((t) => t.variant === 'error').map(renderToast)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
