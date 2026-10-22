'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDisclosureReturn {
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** Attach to the trigger button */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** Attach to the panel */
  panelRef: React.RefObject<HTMLElement | null>;
}

/**
 * Manages open/close state for a WAI-ARIA disclosure widget.
 *
 * Provides:
 *  - toggle / close helpers
 *  - refs for the trigger button and the panel
 *  - Escape key → close + return focus to trigger
 *  - pointer-down outside the panel or trigger → close
 *  - focus leaving the panel → close (disclosure pattern, no hard trap)
 */
export function useDisclosure(): UseDisclosureReturn {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Escape → close and return focus to trigger
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Pointer-down outside → close
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (
        panelRef.current &&
        triggerRef.current &&
        !panelRef.current.contains(target) &&
        !triggerRef.current.contains(target)
      ) {
        close();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  // Focus leaving the panel → close (disclosure, not a modal trap)
  useEffect(() => {
    if (!open) return;

    const onFocusOut = (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as Node | null;
      if (
        panelRef.current &&
        relatedTarget &&
        !panelRef.current.contains(relatedTarget) &&
        relatedTarget !== triggerRef.current
      ) {
        close();
      }
    };

    const panel = panelRef.current;
    panel?.addEventListener('focusout', onFocusOut);
    return () => panel?.removeEventListener('focusout', onFocusOut);
  }, [open, close]);

  return { open, toggle, close, triggerRef, panelRef };
}
