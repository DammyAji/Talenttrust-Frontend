'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { readContractStatus, type ContractStatus } from '@/lib/stellar/status';

export const CONTRACT_STATUS_POLL_MS = 60_000;

interface ContractStatusState {
  status: ContractStatus;
  version: number | null;
  checkedAt: string | null;
}

export interface ContractStatusContextValue extends ContractStatusState {
  refresh: () => Promise<void>;
}

const ContractStatusContext = createContext<ContractStatusContextValue | null>(null);

const INITIAL_STATE: ContractStatusState = {
  status: 'loading',
  version: null,
  checkedAt: null,
};

export function ContractStatusProvider({
  children,
  pollIntervalMs = CONTRACT_STATUS_POLL_MS,
}: {
  children: React.ReactNode;
  pollIntervalMs?: number;
}) {
  const [state, setState] = useState<ContractStatusState>(INITIAL_STATE);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const result = await readContractStatus();
      if (!mounted.current) return;
      setState({
        status: result.paused ? 'paused' : 'operational',
        version: result.version,
        checkedAt: result.checkedAt,
      });
    } catch {
      if (!mounted.current) return;
      setState((previous) => ({ ...previous, status: 'unknown' }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    await check();
  }, [check]);

  useEffect(() => {
    mounted.current = true;

    const stopPolling = () => {
      if (interval.current !== null) {
        clearInterval(interval.current);
        interval.current = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      interval.current = setInterval(() => {
        void check();
      }, pollIntervalMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        void check();
        startPolling();
      }
    };

    void check();
    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted.current = false;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [check, pollIntervalMs]);

  const value = useMemo<ContractStatusContextValue>(
    () => ({ ...state, refresh }),
    [state, refresh],
  );

  return <ContractStatusContext.Provider value={value}>{children}</ContractStatusContext.Provider>;
}

export function useContractStatus(): ContractStatusContextValue {
  const context = useContext(ContractStatusContext);
  if (!context) {
    throw new Error('useContractStatus must be used within a ContractStatusProvider');
  }
  return context;
}

/** Like useContractStatus, but returns null when rendered outside a provider. */
export function useOptionalContractStatus(): ContractStatusContextValue | null {
  return useContext(ContractStatusContext);
}
