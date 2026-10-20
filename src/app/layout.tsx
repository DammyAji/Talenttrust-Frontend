import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { Header } from '@/components/Header';
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
  themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
              <Link href="/status">Status</Link>
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
      </body>
    </html>
  );
}
