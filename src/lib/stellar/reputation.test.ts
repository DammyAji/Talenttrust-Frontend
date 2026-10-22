/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom/vitest" />

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import { computeAverageRating, readOnChainReputation } from './reputation';
import { simulateRead } from './rpc';

vi.mock('./rpc', () => ({
  simulateRead: vi.fn(),
}));

describe('computeAverageRating', () => {
  it('returns 0 when there are no contracts', () => {
    expect(computeAverageRating(0, 0)).toBe(0);
    expect(computeAverageRating(10, 0)).toBe(0);
  });

  it('returns the rating for a single contract', () => {
    expect(computeAverageRating(5, 1)).toBe(5);
    expect(computeAverageRating(3, 1)).toBe(3);
  });

  it('rounds non-integer averages to 2 decimals', () => {
    expect(computeAverageRating(7, 2)).toBe(3.5);
    expect(computeAverageRating(11, 3)).toBe(3.67);
    expect(computeAverageRating(1, 3)).toBe(0.33);
    expect(computeAverageRating(2, 3)).toBe(0.67);
  });
});

describe('readOnChainReputation', () => {
  const mockSimulateRead = vi.mocked(simulateRead);
  const validAddress = 'GA7YQ4C7BSRU6L2Y52ISFRMUPN3FRLYGXDN2S7VCKKRHGOVP5RQZHCEG';

  beforeEach(() => {
    mockSimulateRead.mockReset();
  });

  const scvU32 = (n: number) => ({ type: 'scvU32', value: n });
  const scvI32 = (n: number) => ({ type: 'scvI32', value: n });
  const scvSymbol = (s: string) => ({ type: 'scvSymbol', value: s });
  const scvMap = (entries: { key: unknown; val: unknown }[]) => ({ type: 'scvMap', value: entries });
  const scvVec = (items: unknown[]) => ({ type: 'scvVec', value: items });

  it('parses a map result with symbol keys', async () => {
    mockSimulateRead.mockResolvedValue(
      scvMap([
        { key: scvSymbol('completed_contracts'), val: scvU32(5) },
        { key: scvSymbol('total_rating'), val: scvI32(25) },
      ]) as unknown as xdr.ScVal,
    );
    const rep = await readOnChainReputation(validAddress);
    expect(rep).toEqual({
      address: validAddress,
      completedContracts: 5,
      totalRating: 25,
      averageRating: 5,
    });
    expect(mockSimulateRead).toHaveBeenCalledWith('get_reputation', [validAddress]);
  });

  it('parses a vec result in field order', async () => {
    mockSimulateRead.mockResolvedValue(scvVec([scvU32(2), scvI32(7)]) as unknown as xdr.ScVal);
    const rep = await readOnChainReputation(validAddress);
    expect(rep.completedContracts).toBe(2);
    expect(rep.totalRating).toBe(7);
    expect(rep.averageRating).toBe(3.5);
  });

  it('returns a zero average when there are no contracts', async () => {
    mockSimulateRead.mockResolvedValue(
      scvMap([
        { key: scvSymbol('completed_contracts'), val: scvU32(0) },
        { key: scvSymbol('total_rating'), val: scvI32(0) },
      ]) as unknown as xdr.ScVal,
    );
    const rep = await readOnChainReputation(validAddress);
    expect(rep.completedContracts).toBe(0);
    expect(rep.totalRating).toBe(0);
    expect(rep.averageRating).toBe(0);
  });

  it('propagates simulation errors', async () => {
    mockSimulateRead.mockRejectedValue(new Error('ledger read failed'));
    await expect(readOnChainReputation(validAddress)).rejects.toThrow('ledger read failed');
  });
});
