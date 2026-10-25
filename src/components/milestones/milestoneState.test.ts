import { describe, it, expect } from 'vitest';
import { milestoneState } from './milestoneState';
import type { EscrowContract } from '@/lib/api';

/** Minimal contract factory for test clarity */
function makeContract(
  overrides: Partial<EscrowContract> & {
    milestonesData?: Array<{ index: number; title: string; amount: number; released: boolean }>;
  } = {},
): EscrowContract {
  const milestones = overrides.milestonesData ?? [
    { index: 0, title: 'Design', amount: 300, released: false },
    { index: 1, title: 'Build', amount: 700, released: false },
    { index: 2, title: 'Deploy', amount: 200, released: false },
  ];
  return {
    id: 1,
    title: 'Test contract',
    client: 'GCLIENT',
    freelancer: 'GFREELANCER',
    token: 'XLM',
    milestones,
    totalAmount: milestones.reduce((s, m) => s + m.amount, 0),
    fundedAmount: overrides.fundedAmount ?? 0,
    releasedAmount: overrides.releasedAmount ?? 0,
    status: overrides.status ?? 'Created',
    reputationIssued: overrides.reputationIssued ?? false,
  };
}

describe('milestoneState', () => {
  // ──────────────────────────────────────────────
  // released state
  // ──────────────────────────────────────────────
  it('returns "released" when milestone.released is true', () => {
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 1200,
      releasedAmount: 300,
      milestonesData: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: false },
        { index: 2, title: 'Deploy', amount: 200, released: false },
      ],
    });
    expect(milestoneState(contract, 0)).toBe('released');
  });

  it('returns "released" regardless of contract status when milestone is already released', () => {
    const contract = makeContract({
      status: 'Completed',
      fundedAmount: 300,
      releasedAmount: 300,
      milestonesData: [
        { index: 0, title: 'Design', amount: 300, released: true },
      ],
    });
    expect(milestoneState(contract, 0)).toBe('released');
  });

  // ──────────────────────────────────────────────
  // releasable state
  // ──────────────────────────────────────────────
  it('returns "releasable" when contract is Funded and balance exactly equals milestone amount', () => {
    // exact-balance boundary: funded - released == amount  => releasable
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 300,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('releasable');
  });

  it('returns "releasable" when balance strictly exceeds milestone amount', () => {
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 1200,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('releasable');
    expect(milestoneState(contract, 1)).toBe('releasable');
    expect(milestoneState(contract, 2)).toBe('releasable');
  });

  it('returns "releasable" when contract status is Created (not yet funded but balance available)', () => {
    // Created is also an active status
    const contract = makeContract({
      status: 'Created',
      fundedAmount: 300,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('releasable');
  });

  // ──────────────────────────────────────────────
  // out-of-order release scenarios
  // ──────────────────────────────────────────────
  it('supports out-of-order: milestone 2 is releasable even when milestone 1 is unreleased', () => {
    // Balance covers milestone at index 2 (amount=200), even though index 1 (amount=700) is not released
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 500,
      releasedAmount: 300, // Design was released
      milestonesData: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: false },
        { index: 2, title: 'Deploy', amount: 200, released: false },
      ],
    });
    // available = 500 - 300 = 200; Deploy.amount = 200 => releasable
    expect(milestoneState(contract, 2)).toBe('releasable');
    // Build.amount = 700 > 200 => awaiting-funds
    expect(milestoneState(contract, 1)).toBe('awaiting-funds');
  });

  it('supports releasing milestone 3 before milestone 2 (fully funded)', () => {
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 1200,
      releasedAmount: 300, // Design was released
      milestonesData: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: false },
        { index: 2, title: 'Deploy', amount: 200, released: false },
      ],
    });
    // available = 1200 - 300 = 900; covers both Build(700) and Deploy(200)
    expect(milestoneState(contract, 1)).toBe('releasable');
    expect(milestoneState(contract, 2)).toBe('releasable');
  });

  // ──────────────────────────────────────────────
  // awaiting-funds state
  // ──────────────────────────────────────────────
  it('returns "awaiting-funds" when balance is one unit below milestone amount', () => {
    // exact boundary: balance is 299, amount is 300 => NOT releasable
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 299,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('awaiting-funds');
  });

  it('returns "awaiting-funds" when contract is Funded but balance is zero', () => {
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 0,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('awaiting-funds');
  });

  it('returns "awaiting-funds" when contract is Created but underfunded', () => {
    const contract = makeContract({
      status: 'Created',
      fundedAmount: 100,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('awaiting-funds');
  });

  // ──────────────────────────────────────────────
  // locked state
  // ──────────────────────────────────────────────
  it('returns "locked" for a Completed contract with an unreleased milestone', () => {
    // Edge case: completed but one milestone wasn't released (e.g. dispute resolution)
    const contract = makeContract({
      status: 'Completed',
      fundedAmount: 1200,
      releasedAmount: 1000,
      milestonesData: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: true },
        { index: 2, title: 'Deploy', amount: 200, released: false },
      ],
    });
    expect(milestoneState(contract, 2)).toBe('locked');
  });

  it('returns "locked" for a Disputed contract', () => {
    const contract = makeContract({
      status: 'Disputed',
      fundedAmount: 1200,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('locked');
    expect(milestoneState(contract, 1)).toBe('locked');
    expect(milestoneState(contract, 2)).toBe('locked');
  });

  it('returns "locked" for a Resolved contract', () => {
    const contract = makeContract({
      status: 'Resolved',
      fundedAmount: 1200,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 1)).toBe('locked');
  });

  it('returns "locked" for a Cancelled contract', () => {
    const contract = makeContract({
      status: 'Cancelled',
      fundedAmount: 0,
      releasedAmount: 0,
    });
    expect(milestoneState(contract, 0)).toBe('locked');
  });

  // ──────────────────────────────────────────────
  // invalid input
  // ──────────────────────────────────────────────
  it('throws RangeError for an out-of-range index', () => {
    const contract = makeContract();
    expect(() => milestoneState(contract, 99)).toThrow(RangeError);
    expect(() => milestoneState(contract, -1)).toThrow(RangeError);
  });

  // ──────────────────────────────────────────────
  // exact-balance boundary (spec explicitly listed)
  // ──────────────────────────────────────────────
  it('exact-balance boundary: funded - released === milestone.amount is releasable', () => {
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 1000,
      releasedAmount: 700, // 1000 - 700 = 300 = Design.amount exactly
      milestonesData: [
        { index: 0, title: 'Design', amount: 300, released: false },
      ],
    });
    expect(milestoneState(contract, 0)).toBe('releasable');
  });

  it('exact-balance boundary minus one: funded - released === milestone.amount - 1 is awaiting-funds', () => {
    const contract = makeContract({
      status: 'Funded',
      fundedAmount: 1000,
      releasedAmount: 701, // 1000 - 701 = 299 < 300
      milestonesData: [
        { index: 0, title: 'Design', amount: 300, released: false },
      ],
    });
    expect(milestoneState(contract, 0)).toBe('awaiting-funds');
  });
});
