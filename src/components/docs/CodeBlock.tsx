'use client';

import { useState } from 'react';

export interface CodeBlockProps {
  children: string;
  className?: string;
  title?: string;
}

export function CodeBlock({ children, className, title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(children.trim());
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
      setCopied(false);
      setTimeout(() => setFailed(false), 2000);
    }
  };

  const statusAnnouncement = copied
    ? 'Code copied to clipboard'
    : failed
    ? 'Failed to copy code to clipboard'
    : '';

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {title && <span className="code-block-title">{title}</span>}
        <button
          type="button"
          className="btn btn-secondary btn-sm code-copy-btn"
          onClick={handleCopy}
          aria-label={copied ? 'Copied code' : failed ? 'Failed to copy code' : 'Copy code to clipboard'}
        >
          {copied ? 'Copied' : failed ? 'Failed' : 'Copy'}
        </button>
      </div>
      <pre className={className}>
        <code>{children}</code>
      </pre>
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>
    </div>
  );
}
