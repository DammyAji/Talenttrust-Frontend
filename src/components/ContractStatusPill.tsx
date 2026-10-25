'use client';

import { useContractStatus } from './ContractStatusProvider';

export function ContractStatusPill() {
  const { status, version, refresh } = useContractStatus();
  const versionLabel = version === null ? '—' : version;

  const label =
    status === 'operational'
      ? `Contract v${versionLabel} · Operational`
      : status === 'paused'
        ? `Contract v${versionLabel} · Paused`
        : status === 'loading'
          ? `Contract v${versionLabel} · Checking…`
          : 'Status unavailable';

  return (
    <div className={`contract-status contract-status-${status}`}>
      <span className="contract-status-dot" aria-hidden="true" />
      <span aria-live="polite" role="status">
        {label}
      </span>
      {status === 'unknown' && (
        <button
          type="button"
          className="contract-status-retry"
          onClick={() => void refresh()}
          aria-label="Retry contract status check"
        >
          Retry
        </button>
      )}
    </div>
  );
}
