import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/toast/toast-provider';

export const metadata: Metadata = {
  title: 'TalentTrust - Safe Freelance Payments',
  description: 'Safe, secure payments that protect both freelancers and clients throughout your project.',
};

import { PreferencesProvider } from '@/lib/preferences';
import { SettingsTrigger } from '@/components/settings/SettingsTrigger';
import { WalletProvider } from '@/contexts/WalletContext';
import { WalletConnectButton } from '@/components/WalletConnectButton';
import RouteAnnouncer from '@/components/RouteAnnouncer';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PreferencesProvider>
          <ToastProvider>
            <WalletProvider>
              {/* Skip link must be the first focusable element so keyboard users
                  can bypass the sticky header on every page (WCAG 2.4.1). */}
              <a href="#main-content" className="skip-link">
                Skip to main content
              </a>
              <RouteAnnouncer />
              <div className="min-h-screen bg-slate-50 flex flex-col">
                <header className="sticky top-0 z-40 flex w-full items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold tracking-tight text-slate-900">TalentTrust</span>
                  </div>
                  <WalletConnectButton />
                </header>
                <main className="flex-1 p-6" tabIndex={-1} id="main-content">
                  {children}
                </main>
              </div>
              <SettingsTrigger />
            </WalletProvider>
          </ToastProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
