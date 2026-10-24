import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { Header } from '@/components/Header';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { site, explorerUrl, apiDocsUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: { default: 'TalentTrust | Milestone escrow on Stellar', template: '%s | TalentTrust' },
  description:
    'TalentTrust lets clients and freelancers lock payments in a Soroban smart contract, release funds milestone by milestone, resolve disputes and build on-chain reputation.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Provide per-scheme theme colours so the mobile browser chrome matches
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4f46e5' },
    { media: '(prefers-color-scheme: dark)',  color: '#818cf8' },
  ],
};

/**
 * Blocking inline script: reads tt.theme from localStorage and sets
 * data-theme on <html> before any CSS or React renders, preventing FOUC.
 * Wrapped in try/catch so storage errors silently fall back to System mode.
 * The nonce attribute is intentionally omitted here; attach it via
 * middleware when a CSP nonce is available.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('tt.theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning because data-theme is set by the inline
    // script before React hydrates, causing a deliberate attribute mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-component */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ConfirmProvider>
          <a href="#main" className="skip">
            Skip to content
          </a>
          <Header />
          <main id="main">{children}</main>
          <footer className="footer">
            <div className="container footer-inner">
              <div>
                <strong style={{ color: 'var(--text)' }}>TalentTrust</strong> &middot; {site.tagline}
              </div>
              <div className="footer-links">
                <Link href="/docs">Docs</Link>
                <a href={apiDocsUrl} target="_blank" rel="noreferrer">
                  API
                </a>
                <a href={explorerUrl} target="_blank" rel="noreferrer">
                  Contract
                </a>
                <a href={site.github} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            </div>
          </footer>
        </ConfirmProvider>
      </body>
    </html>
  );
}
