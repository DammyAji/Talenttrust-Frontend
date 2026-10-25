import { Skeleton } from '@/components/ui/Skeleton';

export default function ReputationLoading() {
  return (
    <div className="container">
      <div className="page-head">
        <Skeleton variant="block" width="min(320px, 60%)" height={44} radius={10} />
        <div style={{ marginTop: 14 }}>
          <Skeleton width="min(560px, 100%)" />
        </div>
      </div>
      <div className="stack" style={{ maxWidth: 720, paddingBottom: 64 }} role="status" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <div className="card form">
          <div className="field">
            <Skeleton width="30%" />
            <div className="row">
              <Skeleton variant="block" width="100%" height={44} />
              <Skeleton variant="block" width={120} height={42} />
            </div>
          </div>
        </div>
        <div className="grid grid-3">
          {[0, 1, 2].map((i) => (
            <div className="card" key={i}>
              <Skeleton width="50%" />
              <div style={{ marginTop: 12 }}>
                <Skeleton variant="block" width="60%" height={32} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
