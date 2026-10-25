'use client';

import { ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  requireText?: string;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((result: boolean) => void) | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const finish = useCallback((result: boolean) => {
    setOptions(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(result);
    if (returnFocusTo.current) {
      const el = returnFocusTo.current;
      returnFocusTo.current = null;
      setTimeout(() => el.focus(), 0);
    }
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      returnFocusTo.current = (document.activeElement as HTMLElement | null) ?? null;
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ConfirmDialog
          open
          {...options}
          onConfirm={() => finish(true)}
          onCancel={() => finish(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// Outside a ConfirmProvider (e.g. a component rendered on its own) fall back to
// the browser's native confirm so destructive actions still ask first.
const nativeConfirm: ConfirmFn = (options) =>
  Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(options.title) : false);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? nativeConfirm;
}
