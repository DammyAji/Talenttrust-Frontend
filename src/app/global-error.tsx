'use client';

import { useEffect, useRef } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '32px 20px',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          background: '#f7f8fc',
          color: '#0f172a',
        }}
      >
        <main style={{ maxWidth: 560, textAlign: 'center' }}>
          <p
            style={{
              display: 'inline-block',
              padding: '5px 12px',
              borderRadius: 999,
              border: '1px solid #e3e7f0',
              color: '#5b6478',
              fontSize: '0.85rem',
              fontWeight: 500,
              margin: 0,
            }}
          >
            Error
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            style={{ fontSize: '2.2rem', lineHeight: 1.2, letterSpacing: '-0.02em', margin: '16px 0 8px' }}
          >
            Something went wrong
          </h1>
          <p style={{ color: '#5b6478', marginBottom: 28 }}>
            The app hit an unexpected problem. Reloading usually fixes it.
          </p>
          {isDev && (error.message || error.digest) && (
            <pre
              style={{
                textAlign: 'left',
                maxWidth: 480,
                margin: '0 auto 28px',
                padding: '14px 16px',
                borderRadius: 10,
                background: '#f1f3fa',
                border: '1px solid #e3e7f0',
                fontSize: '0.85rem',
                whiteSpace: 'pre-wrap',
                overflowX: 'auto',
              }}
            >
              {error.digest ? `Digest: ${error.digest}\n` : ''}
              {error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '11px 18px',
                borderRadius: 10,
                border: '1px solid transparent',
                background: '#4f46e5',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: '11px 18px',
                borderRadius: 10,
                border: '1px solid #e3e7f0',
                background: '#fff',
                color: '#0f172a',
                fontWeight: 600,
                fontSize: '0.95rem',
                textDecoration: 'none',
              }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
