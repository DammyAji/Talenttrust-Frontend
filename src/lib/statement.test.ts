import { describe, it, expect } from 'vitest';
import { buildStatement, ledgerSum, isTerminalStatus } from '@/lib/statement';
import type { EscrowContract } from '@/lib/api';

const base = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 7,
  title: 'Website redesign',
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [
    { index: 0, title: 'Design', amount: 300, released: false },
    { index: 1, title: 'Build', amount: 700, released: false },
  ],
  totalAmount: 1000,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-05T12:30:00.000Z',
  ...over,
});

describe('buildStatement — active contract', () => {
  it('is valid and marks the statement in progress', () => {
    const s = buildStatement(base({ status: 'Funded', fundedAmount: 1000 }));
    expect(s.inProgress).toBe(true);
    expect(isTerminalStatus(s.status)).toBe(false);
    expect(s.lines.some((l) => l.label === 'Held in escrow')).toBe(true);
    expect(s.totals.toFreelancer).toBe(0);
    expect(s.totals.held).toBe(1000);
    expect(s.totals.total).toBe(1000);
  });

  it('lists released milestones alongside the held balance', () => {
    const s = buildStatement(
      base({
        status: 'Funded',
        fundedAmount: 1000,
        releasedAmount: 300,
        milestones: [
          { index: 0, title: 'Design', amount: 300, released: true },
          { index: 1, title: 'Build', amount: 700, released: false },
        ],
      }),
    );
    expect(s.totals.toFreelancer).toBe(300);
    expect(s.totals.held).toBe(700);
    expect(s.totals.total).toBe(1000);
  });
});

describe('buildStatement — Completed', () => {
  it('accounts every released milestone to the freelancer and reconciles', () => {
    const s = buildStatement(
      base({
        status: 'Completed',
        fundedAmount: 1000,
        releasedAmount: 1000,
        milestones: [
          { index: 0, title: 'Design', amount: 300, released: true },
          { index: 1, title: 'Build', amount: 700, released: true },
        ],
      }),
    );
    expect(s.inProgress).toBe(false);
    expect(s.totals.toFreelancer).toBe(1000);
    expect(s.totals.toClient).toBe(0);
    expect(s.totals.held).toBe(0);
    expect(ledgerSum(s)).toBe(s.totals.total);
    expect(s.totals.total).toBe(1000);
  });
});

describe('buildStatement — Resolved', () => {
  it('splits the held balance by bps with Math.floor rounding and reconciles', () => {
    const s = buildStatement(
      base({
        status: 'Resolved',
        fundedAmount: 1000,
        releasedAmount: 300,
        milestones: [
          { index: 0, title: 'Design', amount: 300, released: true },
          { index: 1, title: 'Build', amount: 700, released: false },
        ],
        dispute: { raisedBy: 'GCLIENT', reason: 'scope', freelancerBps: 5000, resolvedAt: '2026-02-01T09:00:00.000Z' },
      }),
    );
    const held = 700;
    const freelancerShare = Math.floor((held * 5000) / 10000);
    const refund = held - freelancerShare;
    expect(freelancerShare).toBe(350);
    expect(refund).toBe(350);
    expect(s.totals.toFreelancer).toBe(300 + 350);
    expect(s.totals.toClient).toBe(350);
    expect(s.totals.held).toBe(0);
    expect(ledgerSum(s)).toBe(s.totals.total);
  });

  it('mirrors Math.floor for an odd held balance', () => {
    const s = buildStatement(
      base({
        status: 'Resolved',
        fundedAmount: 1000,
        releasedAmount: 899,
        milestones: [{ index: 0, title: 'Design', amount: 899, released: true }],
        dispute: { raisedBy: 'GCLIENT', reason: 'scope', freelancerBps: 5000, resolvedAt: null },
      }),
    );
    const held = 101;
    const freelancerShare = Math.floor((held * 5000) / 10000);
    expect(freelancerShare).toBe(50);
    expect(s.lines.find((l) => l.label === 'Dispute settlement to freelancer')?.amount).toBe(50);
    expect(s.lines.find((l) => l.label === 'Refund to client')?.amount).toBe(51);
    expect(s.totals.toClient).toBe(51);
    expect(ledgerSum(s)).toBe(s.totals.total);
  });
});

describe('buildStatement — Cancelled', () => {
  it('refunds the held balance to the client and reconciles', () => {
    const s = buildStatement(
      base({
        status: 'Cancelled',
        fundedAmount: 1000,
        releasedAmount: 300,
        milestones: [
          { index: 0, title: 'Design', amount: 300, released: true },
          { index: 1, title: 'Build', amount: 700, released: false },
        ],
      }),
    );
    expect(s.totals.toFreelancer).toBe(300);
    expect(s.totals.toClient).toBe(700);
    expect(s.totals.held).toBe(0);
    expect(ledgerSum(s)).toBe(s.totals.total);
  });

  it('accounts for an unfunded remainder so totals reconcile', () => {
    const s = buildStatement(
      base({
        status: 'Cancelled',
        fundedAmount: 400,
        releasedAmount: 0,
        milestones: [
          { index: 0, title: 'Design', amount: 300, released: false },
          { index: 1, title: 'Build', amount: 700, released: false },
        ],
      }),
    );
    expect(s.totals.toClient).toBe(400);
    expect(s.totals.held).toBe(600);
    expect(ledgerSum(s)).toBe(1000);
  });
});
