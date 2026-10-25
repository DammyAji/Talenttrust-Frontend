import { computeGuards } from '../OnChainEscrowActions';
import type { OnChainEscrow } from '@/lib/stellar/escrow';

const CLIENT = 'GCLIENT111';
const FREELANCER = 'GFREELANCER111';

function make(overrides: Partial<OnChainEscrow> = {}): OnChainEscrow {
  return {
    id: 1,
    client: CLIENT,
    freelancer: FREELANCER,
    token: 'GTOKEN',
    totalAmount: 100_000_000n,
    fundedAmount: 0n,
    releasedAmount: 0n,
    status: 'Created',
    milestones: [
      { title: 'Design', amount: 50_000_000n, released: false },
      { title: 'Dev', amount: 50_000_000n, released: false },
    ],
    ...overrides,
  };
}

describe('computeGuards — button visibility', () => {
  test('client + Created: canFund, canCancel, no release (not funded)', () => {
    const g = computeGuards(make({ status: 'Created' }), CLIENT);
    expect(g.canFund).toBe(true);
    expect(g.canCancel).toBe(true);
    expect(g.canReleaseMilestone(0)).toBe(false);
  });

  test('client + Funded + full balance: canRelease both milestones', () => {
    const g = computeGuards(
      make({ status: 'Funded', fundedAmount: 100_000_000n }),
      CLIENT
    );
    expect(g.canReleaseMilestone(0)).toBe(true);
    expect(g.canReleaseMilestone(1)).toBe(true);
    expect(g.canCancel).toBe(true);
  });

  test('client + Funded + insufficient balance: no release', () => {
    const g = computeGuards(
      make({
        status: 'Funded',
        fundedAmount: 10_000_000n,
        milestones: [{ title: 'Big', amount: 50_000_000n, released: false }],
      }),
      CLIENT
    );
    expect(g.canReleaseMilestone(0)).toBe(false);
  });

  test('client + Funded + milestone already released: no release', () => {
    const g = computeGuards(
      make({
        status: 'Funded',
        fundedAmount: 100_000_000n,
        milestones: [{ title: 'Done', amount: 50_000_000n, released: true }],
      }),
      CLIENT
    );
    expect(g.canReleaseMilestone(0)).toBe(false);
  });

  test('client + fully funded: canFund = false', () => {
    const g = computeGuards(
      make({ status: 'Funded', fundedAmount: 100_000_000n, totalAmount: 100_000_000n }),
      CLIENT
    );
    expect(g.canFund).toBe(false);
  });

  test('client + Completed: no actions', () => {
    const g = computeGuards(
      make({ status: 'Completed', fundedAmount: 100_000_000n }),
      CLIENT
    );
    expect(g.canFund).toBe(false);
    expect(g.canReleaseMilestone(0)).toBe(false);
    expect(g.canCancel).toBe(false);
  });

  test('client + Cancelled: no actions', () => {
    const g = computeGuards(make({ status: 'Cancelled' }), CLIENT);
    expect(g.canFund).toBe(false);
    expect(g.canCancel).toBe(false);
  });

  test('client + Disputed: no actions', () => {
    const g = computeGuards(
      make({ status: 'Disputed', fundedAmount: 100_000_000n }),
      CLIENT
    );
    expect(g.canFund).toBe(false);
    expect(g.canReleaseMilestone(0)).toBe(false);
    expect(g.canCancel).toBe(false);
  });

  test('freelancer: no actions on Funded', () => {
    const g = computeGuards(
      make({ status: 'Funded', fundedAmount: 100_000_000n }),
      FREELANCER
    );
    expect(g.canFund).toBe(false);
    expect(g.canReleaseMilestone(0)).toBe(false);
    expect(g.canCancel).toBe(false);
  });

  test('anonymous (null address): no actions', () => {
    const g = computeGuards(make(), null);
    expect(g.canFund).toBe(false);
    expect(g.canCancel).toBe(false);
  });

  test('null escrow: no actions', () => {
    const g = computeGuards(null, CLIENT);
    expect(g.canFund).toBe(false);
    expect(g.canCancel).toBe(false);
  });

  test('out-of-bounds milestone index: false', () => {
    const g = computeGuards(
      make({ status: 'Funded', fundedAmount: 100_000_000n }),
      CLIENT
    );
    expect(g.canReleaseMilestone(99)).toBe(false);
  });
});
