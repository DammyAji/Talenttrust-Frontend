'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import nav from '@/lib/nav.json';
import { useDisclosure } from '@/hooks/useDisclosure';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';

export function Header() {
  const pathname = usePathname();
  const { open, toggle, close, triggerRef, panelRef } = useDisclosure();

  // First-link ref — receives focus when the panel opens
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  // Close + return focus when route changes
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Close when viewport grows above the mobile breakpoint
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 721px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) close();
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [close]);

  // Move focus to the first panel link when the panel opens
  useEffect(() => {
    if (open) {
      // defer so the panel is visible before focus moves
      const id = requestAnimationFrame(() => firstLinkRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Lock body scroll while the panel is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="TalentTrust home">
          <span className="logo-mark">TT</span>
          TalentTrust
        </Link>

        {/* Desktop nav */}
        <nav className="nav" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          <CommandPalette />
          <Link
            href="/contracts"
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 8, color: 'var(--brand-ink)' }}
          >
            Launch app
          </Link>
          <ThemeToggle />
        </nav>
        <div className="header-actions">
          <NotificationBell />
        </div>

        {/* Mobile trigger */}
        <button
          ref={triggerRef}
          className="menu-trigger"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={toggle}
        >
          <span className="menu-icon" aria-hidden="true">
            {open ? '✕' : '☰'}
          </span>
          <span>{open ? 'Close' : 'Menu'}</span>
        </button>
      </div>

      {/* Mobile panel */}
      <nav
        id="mobile-nav"
        ref={panelRef as React.RefObject<HTMLElement>}
        className={`mobile-nav${open ? ' mobile-nav--open' : ''}`}
        aria-label="Mobile"
        aria-hidden={!open}
      >
        {nav.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            ref={i === 0 ? firstLinkRef : undefined}
            aria-current={isActive(item.href) ? 'page' : undefined}
            onClick={close}
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/contracts"
          className="btn btn-primary"
          style={{ marginTop: 8, color: 'var(--brand-ink)' }}
          onClick={close}
        >
          Launch app
        </Link>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <ThemeToggle />
        </div>
      </nav>

      {/* Backdrop — closes the panel on tap/click */}
      {open && (
        <div
          className="mobile-backdrop"
          aria-hidden="true"
          onPointerDown={close}
        />
      )}
    </header>
  );
}
