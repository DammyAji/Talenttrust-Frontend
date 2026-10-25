'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { api, EscrowContract, unwrapContract } from '@/lib/api';
import { contractKey, isContractsListKey, CONTRACTS_PREFIX } from '@/lib/swr';

export type EscrowAction = 'create' | 'deposit' | 'release' | 'dispute' | 'cancel' | 'resolve' | 'reputation';

export interface EscrowRunOptions {
  /** Body sent to the POST endpoint (deposit amount, rating, etc.). */
  body?: unknown;
  /** Milestone index for the release action. */
  milestoneIndex?: number;
}

export interface EscrowActionResult {
  /** Raw API response, e.g. the Reputation returned by the rate endpoint. */
  response: unknown;
  /** The updated contract, when the endpoint returned one. */
  contract: EscrowContract | null;
}

function actionPath(id: number | 'new', action: EscrowAction, milestoneIndex?: number): string {
  switch (action) {
    case 'create':
      return CONTRACTS_PREFIX;
    case 'deposit':
      return `${CONTRACTS_PREFIX}/${id}/deposit`;
    case 'release':
      return `${CONTRACTS_PREFIX}/${id}/milestones/${milestoneIndex}/release`;
    case 'dispute':
      return `${CONTRACTS_PREFIX}/${id}/dispute`;
    case 'cancel':
      return `${CONTRACTS_PREFIX}/${id}/cancel`;
    case 'resolve':
      return `${CONTRACTS_PREFIX}/${id}/resolve`;
    case 'reputation':
      return `${CONTRACTS_PREFIX}/${id}/reputation`;
  }
}

interface ContractListResponse {
  data: EscrowContract[];
}

export function useEscrowMutation() {
  const { mutate } = useSWRConfig();

  const patchLists = useCallback(
    (updated: EscrowContract) => {
      return mutate(
        (key) => isContractsListKey(key),
        (current: ContractListResponse | undefined) => {
          if (!current?.data) return current;
          const exists = current.data.some((c) => c.id === updated.id);
          const data = exists
            ? current.data.map((c) => (c.id === updated.id ? updated : c))
            : [...current.data, updated];
          return { ...current, data };
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  const run = useCallback(
    async (id: number | 'new', action: EscrowAction, options?: EscrowRunOptions): Promise<EscrowActionResult> => {
      const response = await api(actionPath(id, action, options?.milestoneIndex), {
        method: 'POST',
        body: options?.body,
      });
      const contract = unwrapContract(response);
      if (contract) {
        await mutate(contractKey(contract.id), contract, { revalidate: false });
        await patchLists(contract);
      } else {
        // The endpoint did not return the updated contract (e.g. rate returns
        // a Reputation): refresh the lists so the card reflects server state.
        await mutate((key) => isContractsListKey(key), undefined, { revalidate: true });
      }
      return { response, contract };
    },
    [mutate, patchLists],
  );

  return { run };
}
