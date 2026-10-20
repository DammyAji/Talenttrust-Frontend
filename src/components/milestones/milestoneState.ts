import type { EscrowContract } from '@/lib/api';

/**
 * The four possible states a milestone can be in.
 *
 * - released:      already paid out
 * - releasable:    contract is active AND escrow balance covers this milestone
 * - awaiting-funds: contract is active but not enough balance to cover this milestone
 * - locked:        contract is not in an active state (Completed, Disputed, Resolved, Cancelled)
 */
export type MilestoneStatus = 'released' | 'releasable' | 'awaiting-funds' | 'locked';

const ACTIVE_STATUSES = new Set<EscrowContract['status']>(['Created', 'Funded']);

/**
 * Derives the display state for a single milestone at the given index.
 *
 * The balance available to release is `fundedAmount - releasedAmount`.
 * A milestone is releasable when the contract is active, the milestone is
 * not yet released, and the available balance >= its amount.
 *
 * Out-of-order releases are fully supported: each milestone is evaluated
 * independently — a later milestone can be releasable even if an earlier
 * one is still pending.
 */
export function milestoneState(
  contract: EscrowContract,
  index: number,
): MilestoneStatus {
  const milestone = contract.milestones[index];

  // Guard: invalid index
  if (!milestone) {
    throw new RangeError(`No milestone at index ${index}`);
  }

  if (milestone.released) {
    return 'released';
  }

  if (!ACTIVE_STATUSES.has(contract.status)) {
    return 'locked';
  }

  const availableBalance = contract.fundedAmount - contract.releasedAmount;
  if (availableBalance >= milestone.amount) {
    return 'releasable';
  }

  return 'awaiting-funds';
}
