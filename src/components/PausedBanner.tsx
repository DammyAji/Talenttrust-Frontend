'use client';

import { explorerUrl } from '@/lib/site';
import { useContractStatus } from './ContractStatusProvider';

export function PausedBanner() {
  const { status } = useContractStatus();

  if (status !== 'paused') return null;

  return (
    <div className="paused-banner" role="status" aria-live="polite">
      <div className="container paused-banner-inner">
        <span className="paused-banner-icon" aria-hidden="true">
          !
        </span>
        <p>
          <strong>Contract paused.</strong> Deposits, milestone releases, disputes and cancellations are
          temporarily disabled by the contract admin. Existing escrows stay readable.
        </p>
        <a href={explorerUrl} target="_blank" rel="noreferrer">
          View contract on stellar.expert
        </a>
      </div>
    </div>
  );
}
