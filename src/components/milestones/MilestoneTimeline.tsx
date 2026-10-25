'use client';

import { useId } from 'react';
import type { EscrowContract } from '@/lib/api';
import { milestoneState, type MilestoneStatus } from './milestoneState';

export interface MilestoneTimelineProps {
  contract: EscrowContract;
  /** Called with the milestone index when the user clicks Release on a releasable milestone. */
  onRelease: (index: number) => void;
  /** Disables all release buttons while an action is in flight. */
  busy?: boolean;
  /** Show the cumulative released/total summary bar (hide it when the parent already shows progress). */
  showSummary?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Status metadata (icon + readable label + colour token)
// ──────────────────────────────────────────────────────────────────────────────
const STATUS_META: Record<
  MilestoneStatus,
  { icon: string; label: string; colorVar: string; ariaLabel: string }
> = {
  released: {
    icon: '✓',
    label: 'Released',
    colorVar: 'var(--ok)',
    ariaLabel: 'Released',
  },
  releasable: {
    icon: '▶',
    label: 'Ready to release',
    colorVar: 'var(--brand)',
    ariaLabel: 'Ready to release',
  },
  'awaiting-funds': {
    icon: '⧗',
    label: 'Awaiting funds',
    colorVar: 'var(--warn)',
    ariaLabel: 'Awaiting funds',
  },
  locked: {
    icon: '✕',
    label: 'Locked',
    colorVar: 'var(--bad)',
    ariaLabel: 'Locked',
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export function MilestoneTimeline({ contract, onRelease, busy = false, showSummary = true }: MilestoneTimelineProps) {
  // Unique per instance: several timelines render on the dashboard at once.
  const headingId = useId();
  const { milestones, totalAmount, releasedAmount, token } = contract;
  const pct = totalAmount > 0 ? Math.round((releasedAmount / totalAmount) * 100) : 0;

  return (
    <section className="mt-timeline" aria-labelledby={headingId}>
      <h4 id={headingId} className="mt-title">
        Milestones
      </h4>

      {/* Step list */}
      <ol className="mt-list" aria-label="Milestone timeline">
        {milestones.map((milestone, idx) => {
          const status = milestoneState(contract, idx);
          const meta = STATUS_META[status];
          const isLast = idx === milestones.length - 1;

          return (
            <li key={milestone.index} className="mt-step">
              {/* Connector line above (skip for first item) */}
              {idx > 0 && (
                <div
                  className="mt-connector"
                  aria-hidden="true"
                  data-done={milestones[idx - 1]?.released ? 'true' : 'false'}
                />
              )}

              <div className="mt-step-inner">
                {/* Index badge */}
                <div
                  className="mt-index"
                  aria-hidden="true"
                  style={{ '--status-color': meta.colorVar } as React.CSSProperties}
                >
                  <span className="mt-index-icon">{meta.icon}</span>
                </div>

                {/* Content */}
                <div className="mt-content">
                  <div className="mt-row">
                    <span className="mt-step-title">{milestone.title}</span>
                    <span className="mt-amount">
                      {milestone.amount} {token}
                    </span>
                  </div>

                  {/* Status chip — text + icon so never colour-only */}
                  <span
                    className="mt-status-chip"
                    style={{ '--status-color': meta.colorVar } as React.CSSProperties}
                  >
                    <span aria-hidden="true">{meta.icon}</span>
                    <span>{meta.label}</span>
                    {/* Hidden, always-present screen-reader text */}
                    <span className="sr-only">
                      Milestone {idx + 1}, {milestone.title}: {meta.ariaLabel}
                    </span>
                  </span>

                  {/* Per-milestone release button — only shown for releasable milestones */}
                  {status === 'releasable' && (
                    <button
                      type="button"
                      className="mt-release-btn"
                      disabled={busy}
                      onClick={() => onRelease(milestone.index)}
                      aria-label={`Release "${milestone.title}" (${milestone.amount} ${token})`}
                    >
                      {busy
                        ? 'Releasing…'
                        : `Release "${milestone.title}" (${milestone.amount} ${token})`}
                    </button>
                  )}
                </div>
              </div>

              {/* Connector line below (skip for last item) */}
              {!isLast && (
                <div
                  className="mt-connector mt-connector-below"
                  aria-hidden="true"
                  data-done={milestone.released ? 'true' : 'false'}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Cumulative progress summary */}
      {showSummary && (
      <div className="mt-summary">
        <div className="mt-summary-text">
          <span>
            Released{' '}
            <strong>
              {releasedAmount} {token}
            </strong>{' '}
            of{' '}
            <strong>
              {totalAmount} {token}
            </strong>
          </span>
          <span className="mt-pct">{pct}%</span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% of contract value released`}
          className="mt-progressbar"
        >
          <span className="mt-progressbar-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
        </div>
      </div>
      )}
    </section>
  );
}
