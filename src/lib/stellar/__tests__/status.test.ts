import { beforeEach, describe, expect, it, vi } from 'vitest';

const { simulateContractCall } = vi.hoisted(() => ({
  simulateContractCall: vi.fn(),
}));

vi.mock('../rpc', () => ({ simulateContractCall }));

import {
  assertNotPaused,
  ContractPausedError,
  readContractStatus,
} from '@/lib/stellar/status';

describe('readContractStatus', () => {
  beforeEach(() => {
    simulateContractCall.mockReset();
  });

  it('reports an operational contract and its version', async () => {
    simulateContractCall.mockResolvedValueOnce(false).mockResolvedValueOnce(1);

    const result = await readContractStatus();

    expect(simulateContractCall).toHaveBeenNthCalledWith(1, 'is_paused');
    expect(simulateContractCall).toHaveBeenNthCalledWith(2, 'version');
    expect(result).toMatchObject({ paused: false, version: 1 });
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });

  it('reports a paused contract', async () => {
    simulateContractCall.mockResolvedValueOnce(true).mockResolvedValueOnce(2);

    await expect(readContractStatus()).resolves.toMatchObject({ paused: true, version: 2 });
  });

  it('rejects when the RPC is unreachable so callers can show unknown', async () => {
    simulateContractCall.mockRejectedValue(new Error('RPC unavailable'));

    await expect(readContractStatus()).rejects.toThrow('RPC unavailable');
  });
});

describe('assertNotPaused', () => {
  beforeEach(() => {
    simulateContractCall.mockReset();
  });

  it('throws a typed error for paused status', () => {
    expect(() => assertNotPaused({ paused: true })).toThrow(ContractPausedError);
    expect(() => assertNotPaused({ status: 'paused' })).toThrow(ContractPausedError);
  });

  it('allows operational, loading and unknown status', () => {
    expect(() => assertNotPaused({ status: 'operational' })).not.toThrow();
    expect(() => assertNotPaused({ status: 'loading' })).not.toThrow();
    expect(() => assertNotPaused({ status: 'unknown' })).not.toThrow();
  });

  it('can read the live status before a signing flow', async () => {
    simulateContractCall.mockResolvedValueOnce(true).mockResolvedValueOnce(3);

    await expect(assertNotPaused()).rejects.toBeInstanceOf(ContractPausedError);
  });
});
