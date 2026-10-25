'use client';

import type { ReactNode } from 'react';
import type { EscrowContract } from '@/lib/api';
import { MilestoneTimeline } from '@/components/milestones/MilestoneTimeline';

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

export interface EscrowCardProps {
  contract: EscrowContract;
  busy?: boolean;
  /** An optimistic update is in flight: the card shows the expected result. */
  optimistic?: boolean;
  /** Card-local error for the last failed action, with an optional Retry. */
  error?: { message: string; detail?: string } | null;
  onRetry?: () => void;
  /** Extra controls rendered next to the status badge (e.g. a watch toggle). */
  headerActions?: ReactNode;
  /** Extra controls rendered after the built-in action buttons. */
  extraActions?: ReactNode;
  /** Replaces the built-in rating buttons / "Rated" note on completed escrows when provided. */
  ratingSlot?: ReactNode;
  onFund?: (contract: EscrowContract, amount: number) => void;
  onReleaseNext?: (contract: EscrowContract, milestoneIndex: number) => void;
  onDispute?: (contract: EscrowContract, trigger: HTMLButtonElement) => void;
  onCancel?: (contract: EscrowContract) => void;
  onResolve?: (contract: EscrowContract) => void;
  onRate?: (contract: EscrowContract, rating: number) => void;
}

export function EscrowCard({
  contract,
  busy = false,
  optimistic = false,
  error = null,
  onRetry,
  headerActions,
  extraActions,
  ratingSlot,
  onFund,
  onReleaseNext,
  onDispute,
  onCancel,
  onResolve,
  onRate,
}: EscrowCardProps) {
  const next = contract.milestones.find((m) => !m.released);
  const active = contract.status === 'Created' || contract.status === 'Funded';
  const pct = contract.totalAmount
    ? Math.min(100, Math.max(0, Math.round((contract.releasedAmount / contract.totalAmount) * 100)))
    : 0;
  const progressValueText = `${contract.releasedAmount} of ${contract.totalAmount} ${contract.token} released`;
  const headingId = `escrow-heading-${contract.id}`;

  return (
    <article
      className="card"
      id={`escrow-${contract.id}`}
      tabIndex={-1}
      aria-busy={busy}
      style={optimistic ? { opacity: 0.8 } : undefined}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 id={headingId} style={{ margin: 0 }}>
          #{contract.id} {contract.title}
        </h3>
        <div className="row" style={{ gap: 8 }}>
          {headerActions}
          <span className={`badge badge-${contract.status}`}>{contract.status}</span>
        </div>
      </div>

      <p className="small muted" style={{ margin: '6px 0 12px' }}>
        Client <span className="mono">{short(contract.client)}</span>{' '}
        <span aria-hidden="true">&rarr; Freelancer </span>
        <span className="sr-only">pays freelancer </span>
        <span className="mono">{short(contract.freelancer)}</span>
      </p>

      <div
        className="progress"
        role="progressbar"
        aria-label={`Escrow #${contract.id} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={progressValueText}
      >
        <span style={{ width: `${pct}%` }} />
      </div>

      <p className="small muted" style={{ margin: '8px 0 0' }}>
        Released {contract.releasedAmount} / {contract.totalAmount} {contract.token} &middot; In escrow{' '}
        {contract.fundedAmount - contract.releasedAmount} {contract.token}
      </p>

      <MilestoneTimeline
        contract={contract}
        busy={busy}
        showSummary={false}
        onRelease={(index) => onReleaseNext?.(contract, index)}
      />

      {error && (
        <div className="alert alert-error row" role="alert" title={error.detail} style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <span>{error.message}</span>
          {onRetry && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRetry}
              aria-label={`Retry failed action for escrow #${contract.id}`}
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="row">
        {active && contract.fundedAmount < contract.totalAmount && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            aria-label={`Fund ${contract.totalAmount - contract.fundedAmount} ${contract.token} for escrow #${contract.id} ${contract.title}`}
            aria-describedby={headingId}
            onClick={() => onFund?.(contract, contract.totalAmount - contract.fundedAmount)}
          >
            Fund {contract.totalAmount - contract.fundedAmount} {contract.token}
          </button>
        )}
        {active && next && contract.fundedAmount - contract.releasedAmount >= next.amount && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            aria-label={`Release next milestone for escrow #${contract.id} ${contract.title}`}
            aria-describedby={headingId}
            onClick={() => onReleaseNext?.(contract, next.index)}
          >
            Release next
          </button>
        )}
        {active && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              aria-label={`Dispute escrow #${contract.id} ${contract.title}`}
              aria-describedby={headingId}
              onClick={(event) => onDispute?.(contract, event.currentTarget)}
            >
              Dispute
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              aria-label={`Cancel escrow #${contract.id} ${contract.title}`}
              aria-describedby={headingId}
              onClick={() => onCancel?.(contract)}
            >
              Cancel
            </button>
          </>
        )}
        {contract.status === 'Disputed' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            aria-label={`Resolve 50/50 for escrow #${contract.id} ${contract.title}`}
            aria-describedby={headingId}
            onClick={() => onResolve?.(contract)}
          >
            Resolve 50/50
          </button>
        )}
        {contract.status === 'Completed' && ratingSlot !== undefined && ratingSlot}
        {contract.status === 'Completed' && ratingSlot === undefined && !contract.reputationIssued && (
          <>
            <span className="small muted">Rate freelancer:</span>
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                aria-label={`Rate freelancer ${r} out of 5 stars for escrow #${contract.id} ${contract.title}`}
                aria-describedby={headingId}
                onClick={() => onRate?.(contract, r)}
              >
                {r}
              </button>
            ))}
          </>
        )}
        {contract.status === 'Completed' && ratingSlot === undefined && contract.reputationIssued && (
          <span className="small muted">Rated. Thanks!</span>
        )}
        {extraActions}
      </div>
    </article>
  );
}
