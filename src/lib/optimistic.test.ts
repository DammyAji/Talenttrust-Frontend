import { describe, it, expect } from 'vitest';
import { applyRelease, applyDeposit, contractsReducer } from './optimistic';
import type { EscrowContract } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — match the seeded contract shapes used by the backend
// ─────────────────────────────────────────────────────────────────────────────

function makeContract(overrides: Partial<EscrowContract> = {}): EscrowContract {
  return {
    id: 1,
    title: 'Website redesign',
    client: 'GCLIENT',
    freelancer: 'GFREELANCER',
    token: 'XLM',
    milestones: [
      { index: 0, title: 'Design', amount: 300, released: false },
      { index: 1, title: 'Build', amount: 700, released: false },
      { index: 2, title: 'Deploy', amount: 200, released: false },
    ],
    totalAmount: 1200,
    fundedAmount: 1200,
    releasedAmount: 0,
    status: 'Funded',
    reputationIssued: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// applyRelease
// ─────────────────────────────────────────────────────────────────────────────

describe('applyRelease', () => {
  it('marks the target milestone as released', () => {
    const result = applyRelease(makeContract(), 0);
    expect(result.milestones[0].released).toBe(true);
    expect(result.milestones[1].released).toBe(false);
    expect(result.milestones[2].released).toBe(false);
  });

  it('increments releasedAmount by the milestone amount', () => {
    const result = applyRelease(makeContract(), 0);
    expect(result.releasedAmount).toBe(300);
  });

  it('increments releasedAmount correctly for middle milestone', () => {
    const result = applyRelease(makeContract(), 1);
    expect(result.releasedAmount).toBe(700);
  });

  it('does not mutate the original contract (immutability)', () => {
    const original = makeContract();
    applyRelease(original, 0);
    expect(original.releasedAmount).toBe(0);
    expect(original.milestones[0].released).toBe(false);
  });

  it('does not mutate the milestones array of the original', () => {
    const original = makeContract();
    const result = applyRelease(original, 0);
    expect(result.milestones).not.toBe(original.milestones);
  });

  it('sets status to Completed when every milestone is released', () => {
    const contract = makeContract({
      milestones: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: true },
        { index: 2, title: 'Deploy', amount: 200, released: false },
      ],
      releasedAmount: 1000,
    });
    const result = applyRelease(contract, 2);
    expect(result.status).toBe('Completed');
    expect(result.releasedAmount).toBe(1200);
  });

  it('keeps status Funded when not all milestones are released', () => {
    const result = applyRelease(makeContract(), 0);
    expect(result.status).toBe('Funded');
  });

  it('is idempotent — releasing an already-released milestone returns unchanged contract', () => {
    const contract = makeContract({
      milestones: [
        { index: 0, title: 'Design', amount: 300, released: true },
        { index: 1, title: 'Build', amount: 700, released: false },
        { index: 2, title: 'Deploy', amount: 200, released: false },
      ],
      releasedAmount: 300,
    });
    const result = applyRelease(contract, 0);
    expect(result).toBe(contract); // referential equality — exact same object
  });

  it('supports out-of-order release: milestone 2 before milestone 1', () => {
    const result = applyRelease(makeContract(), 2);
    expect(result.milestones[2].released).toBe(true);
    expect(result.milestones[0].released).toBe(false);
    expect(result.milestones[1].released).toBe(false);
    expect(result.releasedAmount).toBe(200);
    expect(result.status).toBe('Funded');
  });

  it('throws RangeError for a negative index', () => {
    expect(() => applyRelease(makeContract(), -1)).toThrow(RangeError);
  });

  it('throws RangeError for an index beyond milestones length', () => {
    expect(() => applyRelease(makeContract(), 99)).toThrow(RangeError);
  });

  it('works with a single-milestone contract', () => {
    const contract = makeContract({
      milestones: [{ index: 0, title: 'Full', amount: 500, released: false }],
      totalAmount: 500,
      fundedAmount: 500,
      releasedAmount: 0,
    });
    const result = applyRelease(contract, 0);
    expect(result.status).toBe('Completed');
    expect(result.releasedAmount).toBe(500);
  });

  it('matches backend outcome: seeded 3-milestone contract, release index 1 first', () => {
    const contract = makeContract(); // fully funded
    const result = applyRelease(contract, 1);
    // Backend mirrors: milestone[1].released=true, releasedAmount=700, status stays Funded
    expect(result.milestones[1].released).toBe(true);
    expect(result.releasedAmount).toBe(700);
    expect(result.status).toBe('Funded');
    // Other milestones untouched
    expect(result.milestones[0].released).toBe(false);
    expect(result.milestones[2].released).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyDeposit
// ─────────────────────────────────────────────────────────────────────────────

describe('applyDeposit', () => {
  it('increments fundedAmount by the deposit amount', () => {
    const contract = makeContract({ status: 'Created', fundedAmount: 0 });
    const result = applyDeposit(contract, 500);
    expect(result.fundedAmount).toBe(500);
  });

  it('does not mutate the original contract (immutability)', () => {
    const original = makeContract({ status: 'Created', fundedAmount: 0 });
    applyDeposit(original, 500);
    expect(original.fundedAmount).toBe(0);
  });

  it('sets status to Funded when fundedAmount reaches totalAmount exactly', () => {
    const contract = makeContract({ status: 'Created', fundedAmount: 0 });
    const result = applyDeposit(contract, 1200); // totalAmount = 1200
    expect(result.status).toBe('Funded');
    expect(result.fundedAmount).toBe(1200);
  });

  it('sets status to Funded when fundedAmount exceeds totalAmount', () => {
    const contract = makeContract({ status: 'Created', fundedAmount: 0 });
    const result = applyDeposit(contract, 1500);
    expect(result.status).toBe('Funded');
    expect(result.fundedAmount).toBe(1500);
  });

  it('keeps status Created when still underfunded after deposit', () => {
    const contract = makeContract({ status: 'Created', fundedAmount: 0 });
    const result = applyDeposit(contract, 500);
    expect(result.status).toBe('Created');
  });

  it('handles partial top-up: 600 already funded, deposit remaining 600', () => {
    const contract = makeContract({ status: 'Created', fundedAmount: 600 });
    const result = applyDeposit(contract, 600);
    expect(result.fundedAmount).toBe(1200);
    expect(result.status).toBe('Funded');
  });

  it('exact-boundary minus one: deposit leaves one unit short → stays Created', () => {
    const contract = makeContract({ status: 'Created', fundedAmount: 0 });
    const result = applyDeposit(contract, 1199);
    expect(result.status).toBe('Created');
    expect(result.fundedAmount).toBe(1199);
  });

  it('throws RangeError for amount = 0', () => {
    expect(() => applyDeposit(makeContract(), 0)).toThrow(RangeError);
  });

  it('throws RangeError for negative amount', () => {
    expect(() => applyDeposit(makeContract(), -100)).toThrow(RangeError);
  });

  it('matches backend outcome: seeded Created contract, deposit full amount', () => {
    const contract = makeContract({ status: 'Created', fundedAmount: 0 });
    const result = applyDeposit(contract, 1200);
    expect(result.fundedAmount).toBe(1200);
    expect(result.status).toBe('Funded');
    // Milestones unchanged
    expect(result.milestones).toEqual(contract.milestones);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// contractsReducer
// ─────────────────────────────────────────────────────────────────────────────

describe('contractsReducer', () => {
  const contract1 = makeContract({ id: 1 });
  const contract2 = makeContract({ id: 2, title: 'Second contract' });
  const state = [contract1, contract2];

  it('applies release action to the correct contract only', () => {
    const result = contractsReducer(state, { type: 'release', contractId: 1, milestoneIndex: 0 });
    expect(result[0].milestones[0].released).toBe(true);
    expect(result[1]).toBe(contract2); // untouched — same reference
  });

  it('applies deposit action to the correct contract only', () => {
    const c1created = makeContract({ id: 1, status: 'Created', fundedAmount: 0 });
    const result = contractsReducer([c1created, contract2], { type: 'deposit', contractId: 1, amount: 1200 });
    expect(result[0].fundedAmount).toBe(1200);
    expect(result[0].status).toBe('Funded');
    expect(result[1]).toBe(contract2);
  });

  it('is a no-op for an unknown contractId', () => {
    const result = contractsReducer(state, { type: 'release', contractId: 999, milestoneIndex: 0 });
    expect(result[0]).toBe(contract1);
    expect(result[1]).toBe(contract2);
  });

  it('is a no-op when reducer throws (invalid milestoneIndex)', () => {
    const result = contractsReducer(state, { type: 'release', contractId: 1, milestoneIndex: 99 });
    expect(result[0]).toBe(contract1); // unchanged
  });

  it('is a no-op when reducer throws (invalid deposit amount)', () => {
    const result = contractsReducer(state, { type: 'deposit', contractId: 1, amount: -50 });
    expect(result[0]).toBe(contract1);
  });

  it('returns a new array reference on any match', () => {
    const result = contractsReducer(state, { type: 'release', contractId: 1, milestoneIndex: 0 });
    expect(result).not.toBe(state);
  });
});
