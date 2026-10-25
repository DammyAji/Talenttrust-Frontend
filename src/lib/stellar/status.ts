import { simulateContractCall, type ScValResult } from './rpc';

export type ContractStatus = 'loading' | 'operational' | 'paused' | 'unknown';

export interface ContractStatusResult {
  paused: boolean;
  version: number;
  checkedAt: string;
}

export class ContractPausedError extends Error {
  readonly code = 'CONTRACT_PAUSED';

  constructor(
    readonly version?: number,
    readonly checkedAt?: string,
  ) {
    super('The TalentTrust contract is paused. On-chain actions are temporarily disabled.');
    this.name = 'ContractPausedError';
  }
}

function toBoolean(value: ScValResult): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  throw new Error('Unexpected is_paused response');
}

function toVersion(value: ScValResult): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('Unexpected version response');
}

export async function readContractStatus(): Promise<ContractStatusResult> {
  const [paused, version] = await Promise.all([
    simulateContractCall('is_paused'),
    simulateContractCall('version'),
  ]);

  return {
    paused: toBoolean(paused),
    version: toVersion(version),
    checkedAt: new Date().toISOString(),
  };
}

type PauseState = {
  paused?: boolean;
  status?: ContractStatus;
};

export function assertNotPaused(state: PauseState): void;
export function assertNotPaused(): Promise<void>;
export function assertNotPaused(state?: PauseState): void | Promise<void> {
  if (state) {
    if (state.paused === true || state.status === 'paused') throw new ContractPausedError();
    return;
  }

  return readContractStatus().then((result) => {
    if (result.paused) throw new ContractPausedError(result.version, result.checkedAt);
  });
}
