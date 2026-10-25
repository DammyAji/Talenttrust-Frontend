'use client';

import { useState } from 'react';

export interface DocHeadingProps {
  id: string;
  title: string;
}

export function DocHeading({ id, title }: DocHeadingProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
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

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <h2 className="doc-heading">
      <span>{title}</span>
      <a
        href={`#${id}`}
        className="heading-anchor"
        aria-label={`Link to ${title}`}
        onClick={handleClick}
      >
        <span aria-hidden="true">#</span>
      </a>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `Copied link to ${title}` : ''}
      </span>
    </h2>
  );
}
