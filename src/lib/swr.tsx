'use client';

import type { ReactNode } from 'react';
import { SWRConfig, type SWRConfiguration } from 'swr';
import { api, ApiError } from './api';

export type ContractFilters = Record<string, string | number | boolean> | null;

export type ContractsListKey = ['/api/v1/contracts', ContractFilters];

export const CONTRACTS_PREFIX = '/api/v1/contracts';

export function contractsListKey(filters?: ContractFilters): ContractsListKey {
  return [CONTRACTS_PREFIX, filters ?? null];
}

export function contractKey(id: number | string): string {
  return `${CONTRACTS_PREFIX}/${id}`;
}

export function isContractsListKey(key: unknown): key is ContractsListKey {
  return Array.isArray(key) && key[0] === CONTRACTS_PREFIX;
}

export async function fetcher(key: ContractsListKey | string): Promise<unknown> {
  const [path, params] = typeof key === 'string' ? [key, null] as const : key;
  // Disable api()-level retries: SWR owns the retry strategy via shouldRetryOnError.
  if (params) {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(name, String(value));
    }
    const query = search.toString();
    return api(query ? `${path}?${query}` : path, { retries: 0 });
  }
  return api(path, { retries: 0 });
}

/** 4xx responses are terminal: retrying the same request cannot succeed. */
export function shouldRetryOnError(error: Error): boolean {
  return !(error instanceof ApiError && typeof error.status === 'number' && error.status >= 400 && error.status < 500);
}

const defaultConfig: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 5000,
  shouldRetryOnError,
};

export function SwrProvider({ children, value }: { children: ReactNode; value?: SWRConfiguration }) {
  return <SWRConfig value={{ ...defaultConfig, ...value }}>{children}</SWRConfig>;
}
