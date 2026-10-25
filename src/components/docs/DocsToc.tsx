'use client';

import { useState, useEffect, useRef } from 'react';

export interface DocsTocProps {
  items: Array<[string, string]>;
}

export function DocsToc({ items }: DocsTocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.[0] || '');
  const [isOpen, setIsOpen] = useState(false);
  const disclosureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Initial hash check on mount
    const hash = window.location.hash.replace('#', '');
    if (hash && items.some(([id]) => id === hash)) {
      setActiveId(hash);
    }

    // 2. Setup IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        // Find visible sections
        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by top position to pick top visible section
          const topEntry = visibleEntries.reduce((prev, curr) =>
            prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr
          );
          setActiveId(topEntry.target.id);
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    items.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [items]);

  // Handle escape key to close mobile disclosure
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setActiveId(id);
    setIsOpen(false);
    window.history.pushState(null, '', `#${id}`);

    const target = document.getElementById(id);
    if (target) {
      const prefersReducedMotion =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
          : false;
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  };

  const currentLabel = items.find(([id]) => id === activeId)?.[1] || items[0]?.[1] || '';

  return (
    <nav className="toc" aria-label="On this page">
      {/* Desktop TOC */}
      <div className="toc-desktop">
        {items.map(([id, label]) => {
          const isActive = activeId === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              className={isActive ? 'active' : undefined}
              aria-current={isActive ? 'location' : undefined}
              onClick={(e) => handleLinkClick(e, id)}
            >
              {label}
            </a>
          );
        })}
      </div>

      {/* Mobile Disclosure TOC (<=860px) */}
      <div className="toc-mobile" ref={disclosureRef}>
        <button
          type="button"
          className="toc-disclosure-btn"
          aria-expanded={isOpen}
          aria-controls="toc-mobile-list"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span>
            On this page: <strong>{currentLabel}</strong>
          </span>
          <span className="toc-arrow" aria-hidden="true">
            {isOpen ? '▲' : '▼'}
          </span>
        </button>
        {isOpen && (
          <div id="toc-mobile-list" className="toc-mobile-list">
            {items.map(([id, label]) => {
              const isActive = activeId === id;
              return (
                <a
                  key={id}
                  href={`#${id}`}
                  className={isActive ? 'active' : undefined}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(e) => handleLinkClick(e, id)}
                >
                  {label}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
