import { simulateRead } from './rpc';
import { xdr } from '@stellar/stellar-sdk';

export interface OnChainReputation {
  address: string;
  completedContracts: number;
  totalRating: number;
  averageRating: number;
}

/** Average rating out of 5, rounded to 2 decimals. 0 when there are no contracts. */
export function computeAverageRating(totalRating: number, completedContracts: number): number {
  if (!completedContracts) {
    return 0;
  }
  return Math.round((totalRating / completedContracts) * 100) / 100;
}

function scValToUnknown(val: xdr.ScVal): unknown {
  switch (val.type) {
    case 'scvMap': {
      const out: Record<string, unknown> = {};
      for (const entry of val.value ?? []) {
        const key = scValToUnknown(entry.key);
        out[typeof key === 'string' ? key : String(key)] = scValToUnknown(entry.val);
      }
      return out;
    }
    case 'scvVec':
      return (val.value ?? []).map(scValToUnknown);
    case 'scvSymbol':
    case 'scvString':
      return val.value;
    case 'scvU32':
    case 'scvI32':
    case 'scvU64':
    case 'scvI64':
      return Number(val.value);
    default:
      return val;
  }
}

function parseReputation(result: xdr.ScVal): { completedContracts: number; totalRating: number } {
  const parsed = scValToUnknown(result);
  let completedContracts = 0;
  let totalRating = 0;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    completedContracts = Math.max(0, Number(record.completed_contracts ?? record.completedContracts ?? 0) || 0);
    totalRating = Math.max(0, Number(record.total_rating ?? record.totalRating ?? 0) || 0);
  } else if (Array.isArray(parsed)) {
    completedContracts = Math.max(0, Number(parsed[0] ?? 0) || 0);
    totalRating = Math.max(0, Number(parsed[1] ?? 0) || 0);
  }
  return { completedContracts, totalRating };
}

/**
 * Read a freelancer's reputation from the escrow contract via a read-only
 * simulation of get_reputation(freelancer).
 */
export async function readOnChainReputation(address: string): Promise<OnChainReputation> {
  const result = await simulateRead('get_reputation', [address]);
  const { completedContracts, totalRating } = parseReputation(result);
  return {
    address,
    completedContracts,
    totalRating,
    averageRating: computeAverageRating(totalRating, completedContracts),
  };
}
