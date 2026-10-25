'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { isConnected, getAddress, signTransaction } from '@stellar/freighter-api';

export interface WalletContextValue {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const connected = await isConnected();
      if (!connected) throw new Error('Freighter is not installed or connected.');
      const { address } = await getAddress();
      setAddress(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  const signTx = useCallback(async (xdr: string, networkPassphrase: string): Promise<string> => {
    const result = await signTransaction(xdr, { networkPassphrase });
    if (typeof result === 'string') return result;
    const r = result as { signedTxXdr?: string };
    if (r.signedTxXdr) return r.signedTxXdr;
    throw new Error('Freighter did not return a signed transaction.');
  }, []);

  return (
    <WalletContext.Provider value={{ address, isConnecting, error, connect, disconnect, signTx }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}

export default WalletContext;
