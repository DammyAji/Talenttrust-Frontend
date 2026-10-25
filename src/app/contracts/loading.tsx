import { Skeleton } from '@/components/ui/Skeleton';

export default function ContractsLoading() {
  return (
    <div className="container">
      <div className="page-head">
        <Skeleton variant="block" width="min(320px, 60%)" height={44} radius={10} />
        <div style={{ marginTop: 14 }}>
          <Skeleton width="min(560px, 100%)" />
        </div>
      </div>
      <div className="dash" role="status" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <div className="card form">
          <Skeleton width="40%" height="1.2em" />
          {[0, 1, 2, 3].map((i) => (
            <div className="field" key={i}>
              <Skeleton width="30%" />
              <Skeleton variant="block" width="100%" height={44} />
            </div>
          ))}
          <Skeleton variant="block" width={140} height={42} />
        </div>
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="skeleton-cards">
            {[0, 1, 2].map((i) => (
              <EscrowCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EscrowCardSkeleton() {
  return (
    <div className="card skeleton-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Skeleton width="55%" height="1.2em" />
        <Skeleton width={84} height={22} radius={999} />
      </div>
      <Skeleton width="75%" />
      <Skeleton variant="block" width="100%" height={8} radius={999} />
      <Skeleton width="60%" />
      <div className="stack" style={{ gap: 8, margin: '12px 0' }}>
        <Skeleton width="80%" />
        <Skeleton width="65%" />
      </div>
      <div className="row">
        <Skeleton variant="block" width={110} height={34} />
        <Skeleton variant="block" width={110} height={34} />
      </div>
    </div>
  );
}
