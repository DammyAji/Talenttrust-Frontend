'use client';

import { useEffect, useRef } from 'react';

export interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function RouteError({ error, reset }: RouteErrorProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="container" style={{ padding: '96px 20px', textAlign: 'center' }}>
      <p className="eyebrow">Error</p>
      <h1 ref={heading} tabIndex={-1} style={{ fontSize: '2.4rem', margin: '16px 0 8px' }}>
        Something went wrong
      </h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        We could not load this part of the app. You can try again, or head back home.
      </p>
      {isDev && (error.message || error.digest) && (
        <pre
          className="small"
          style={{ textAlign: 'left', maxWidth: 640, margin: '0 auto 28px', whiteSpace: 'pre-wrap' }}
        >
          {error.digest ? `Digest: ${error.digest}\n` : ''}
          {error.message}
        </pre>
      )}
      <div className="actions" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <a href="/" className="btn btn-secondary">
          Go home
        </a>
      </div>
    </div>
  );
}
