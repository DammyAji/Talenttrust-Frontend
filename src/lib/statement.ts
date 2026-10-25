import type { Dispute, EscrowContract } from './api';

export type LedgerParty = 'freelancer' | 'client' | 'escrow';

export interface LedgerLine {
  label: string;
  to: LedgerParty;
  amount: number;
  note?: string;
}

export interface StatementTotals {
  total: number;
  toFreelancer: number;
  toClient: number;
  held: number;
}

export interface Statement {
  id: number;
  title: string;
  status: EscrowContract['status'];
  token: string;
  client: string;
  freelancer: string;
  createdAt?: string;
  updatedAt?: string;
  dispute: Dispute | null;
  lines: LedgerLine[];
  totals: StatementTotals;
  inProgress: boolean;
}

const TERMINAL: EscrowContract['status'][] = ['Completed', 'Resolved', 'Cancelled'];

export const isTerminalStatus = (status: EscrowContract['status']): boolean => TERMINAL.includes(status);

/**
 * Builds the reconciliation ledger for an escrow statement.
 *
 * Totals always reconcile to `contract.totalAmount`:
 *   toFreelancer + toClient + held + unfunded = totalAmount
 * where `held` is anything still sitting in escrow and `unfunded` is the part
 * of the nominal budget that was never deposited (possible when an escrow is
 * cancelled or otherwise settled before it was fully funded).
 *
 * Dispute settlement mirrors the backend: the freelancer receives
 * `Math.floor(held * freelancerBps / 10000)` and the client is refunded the
 * remainder, so rounding dust stays with the client.
 */
export function buildStatement(contract: EscrowContract): Statement {
  const lines: LedgerLine[] = [];
  const token = contract.token;

  for (const m of [...contract.milestones].sort((a, b) => a.index - b.index)) {
    if (!m.released) continue;
    lines.push({
      label: `Milestone ${m.index + 1}: ${m.title}`,
      to: 'freelancer',
      amount: m.amount,
      note: 'Milestone released',
    });
  }

  const held = Math.max(0, contract.fundedAmount - contract.releasedAmount);
  const unfunded = Math.max(0, contract.totalAmount - contract.fundedAmount);

  if (contract.status === 'Resolved') {
    const bps = contract.dispute?.freelancerBps ?? 0;
    const freelancerShare = Math.floor((held * bps) / 10000);
    const clientRefund = held - freelancerShare;
    lines.push({
      label: 'Dispute settlement to freelancer',
      to: 'freelancer',
      amount: freelancerShare,
      note: `${bps / 100}% of held balance`,
    });
    lines.push({ label: 'Refund to client', to: 'client', amount: clientRefund, note: 'Remainder of held balance' });
  } else if (contract.status === 'Cancelled') {
    lines.push({
      label: 'Refund to client',
      to: 'client',
      amount: held,
      note: 'Funds released before cancellation are not refunded',
    });
  } else if (!isTerminalStatus(contract.status) && held > 0) {
    lines.push({ label: 'Held in escrow', to: 'escrow', amount: held });
  }

  if (unfunded > 0) {
    lines.push({ label: 'Unfunded remainder', to: 'escrow', amount: unfunded, note: 'Never deposited' });
  }

  const toFreelancer = sum(lines, 'freelancer');
  const toClient = sum(lines, 'client');
  const heldTotal = sum(lines, 'escrow');

  return {
    id: contract.id,
    title: contract.title,
    status: contract.status,
    token,
    client: contract.client,
    freelancer: contract.freelancer,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    dispute: contract.dispute ?? null,
    lines,
    totals: {
      total: contract.totalAmount,
      toFreelancer,
      toClient,
      held: heldTotal,
    },
    inProgress: !isTerminalStatus(contract.status),
  };
}

function sum(lines: LedgerLine[], party: LedgerParty): number {
  return lines.reduce((n, l) => n + (l.to === party ? l.amount : 0), 0);
}

export function ledgerSum(statement: Statement): number {
  return statement.lines.reduce((n, l) => n + l.amount, 0);
}
