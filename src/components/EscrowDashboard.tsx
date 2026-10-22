'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { api, EscrowContract } from '@/lib/api';
import { contractsReducer, OptimisticAction } from '@/lib/optimistic';

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

// ─────────────────────────────────────────────────────────────────────────────
// EscrowCard — extracted so per-card state is cleanly isolated
// ─────────────────────────────────────────────────────────────────────────────

interface EscrowCardProps {
  c: EscrowContract;
  /** Whether an optimistic update is in-flight for this card */
  optimistic: boolean;
  onRelease: (index: number) => void;
  onDeposit: () => void;
  /** Blocking actions (not optimistic) */
  onDispute: () => void;
  onCancel: () => void;
  onResolve: () => void;
  onRate: (rating: number) => void;
  blockingBusy: boolean;
  cardError: string | null;
  onRetry: () => void;
}

function EscrowCard({
  c,
  optimistic,
  onRelease,
  onDeposit,
  onDispute,
  onCancel,
  onResolve,
  onRate,
  blockingBusy,
  cardError,
  onRetry,
}: EscrowCardProps) {
  const active = c.status === 'Created' || c.status === 'Funded';
  const next = c.milestones.find((m) => !m.released);
  const pct = c.totalAmount ? Math.round((c.releasedAmount / c.totalAmount) * 100) : 0;

  return (
    <article
      className="card"
      aria-busy={optimistic ? 'true' : undefined}
      style={optimistic ? { opacity: 0.8 } : undefined}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>
          #{c.id} {c.title}
        </h3>
        <span className={`badge badge-${c.status}`}>{c.status}</span>
      </div>

      <p className="small muted" style={{ margin: '6px 0 12px' }}>
        Client <span className="mono">{short(c.client)}</span> &rarr; Freelancer{' '}
        <span className="mono">{short(c.freelancer)}</span>
      </p>

      <div className="progress" aria-label={`${pct}% released`}>
        <span style={{ width: `${pct}%` }} />
      </div>

      <p className="small muted" style={{ margin: '8px 0 0' }}>
        Released {c.releasedAmount} / {c.totalAmount} {c.token} &middot; In escrow{' '}
        {c.fundedAmount - c.releasedAmount} {c.token}
      </p>

      <ul className="milestones">
        {c.milestones.map((m) => (
          <li key={m.index} style={optimistic && !m.released ? { opacity: 0.6 } : undefined}>
            <span className="truncate">
              <span aria-hidden="true">{m.released ? '✓' : '○'}</span>{' '}
              <span className="sr-only">{m.released ? 'Released:' : 'Pending:'}</span>
              {m.title}
            </span>
            <span className="mono">
              {m.amount} {c.token}
            </span>
          </li>
        ))}
      </ul>

      {/* Card-local error with Retry */}
      {cardError && (
        <div className="alert alert-error" role="alert" style={{ marginTop: 10 }}>
          <span>{cardError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRetry}
            style={{ marginLeft: 10 }}
            aria-label={`Retry failed action for contract #${c.id}`}
          >
            Retry
          </button>
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        {active && c.fundedAmount < c.totalAmount && (
          <button
            className="btn btn-primary btn-sm"
            disabled={optimistic || blockingBusy}
            onClick={onDeposit}
            aria-label={`Fund ${c.totalAmount - c.fundedAmount} ${c.token} for contract #${c.id}`}
          >
            {optimistic ? 'Funding…' : `Fund ${c.totalAmount - c.fundedAmount} ${c.token}`}
          </button>
        )}
        {active && next && c.fundedAmount - c.releasedAmount >= next.amount && (
          <button
            className="btn btn-primary btn-sm"
            disabled={optimistic || blockingBusy}
            onClick={() => onRelease(next.index)}
            aria-label={`Release "${next.title}" (${next.amount} ${c.token}) for contract #${c.id}`}
          >
            {optimistic ? `Releasing…` : `Release next`}
          </button>
        )}
        {active && (
          <>
            <button
              className="btn btn-secondary btn-sm"
              disabled={optimistic || blockingBusy}
              onClick={onDispute}
              aria-label={`Dispute contract #${c.id}`}
            >
              Dispute
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={optimistic || blockingBusy}
              onClick={onCancel}
              aria-label={`Cancel contract #${c.id}`}
            >
              Cancel
            </button>
          </>
        )}
        {c.status === 'Disputed' && (
          <button
            className="btn btn-primary btn-sm"
            disabled={blockingBusy}
            onClick={onResolve}
            aria-label={`Resolve contract #${c.id} 50/50`}
          >
            Resolve 50/50
          </button>
        )}
        {c.status === 'Completed' && !c.reputationIssued && (
          <>
            <span className="small muted">Rate freelancer:</span>
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                className="btn btn-secondary btn-sm"
                disabled={blockingBusy}
                onClick={() => onRate(r)}
                aria-label={`Rate ${r} star${r > 1 ? 's' : ''} for contract #${c.id}`}
              >
                {r}
              </button>
            ))}
          </>
        )}
        {c.status === 'Completed' && c.reputationIssued && (
          <span className="small muted">Rated. Thanks!</span>
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EscrowDashboard
// ─────────────────────────────────────────────────────────────────────────────

export function EscrowDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [search, setSearch] = useState(query.q);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  // Per-card errors: contractId → error message
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});
  // Blocking busy state for non-optimistic actions (Cancel, Dispute, Resolve, rate)
  const [blockingBusy, setBlockingBusy] = useState<number | 'new' | null>(null);
  // Tracks the last retry action per card so Retry can re-dispatch
  const retryRef = useRef<Record<number, () => void>>({});
  // Live-region announcements (polite)
  const [announcement, setAnnouncement] = useState('');

  // useOptimistic — wraps contracts with local optimistic state
  const [optimisticContracts, dispatchOptimistic] = useOptimistic(
    contracts ?? [],
    contractsReducer,
  );

  // Tracks which contractIds currently have an in-flight optimistic action
  const [optimisticIds, setOptimisticIds] = useState<Set<number>>(new Set());

  const [, startTransition] = useTransition();

  const [form, setForm] = useState({
    title: 'Website redesign',
    client: 'GCLIENT' + 'X'.repeat(49),
    freelancer: 'GFREELANCER' + 'Y'.repeat(45),
    milestones: 'Design: 300, Build: 700',
  });

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const res = await api<{ data: EscrowContract[] }>('/api/v1/contracts');
      setContracts(res.data.sort((a, b) => b.id - a.id));
      setGlobalError(null);
    } catch (e) {
      setGlobalError(`Could not reach the API: ${(e as Error).message}`);
      setContracts([]);
    }
  }, [query.status]);

  useEffect(() => {
    load();
    return () => loadController.current?.abort();
  }, [load]);

  // ── Optimistic action helper ──────────────────────────────────────────────

  /**
   * Dispatches an optimistic action, executes the API call inside a
   * transition, then on success replaces the card with the server response.
   * On failure the optimistic state is discarded automatically by React 19
   * and we show a card-local error with a Retry button.
   */
  const optimisticAct = useCallback(
    (
      contractId: number,
      action: OptimisticAction,
      announcement: string,
      apiFn: () => Promise<unknown>,
    ) => {
      // Prevent double-submit while in flight
      if (optimisticIds.has(contractId)) return;

      setCardErrors((prev) => {
        const next = { ...prev };
        delete next[contractId];
        return next;
      });
      setAnnouncement(announcement);

      // Register Retry
      retryRef.current[contractId] = () =>
        optimisticAct(contractId, action, announcement, apiFn);

      setOptimisticIds((prev) => new Set([...prev, contractId]));

      startTransition(() => {
        dispatchOptimistic(action);
      });

      apiFn()
        .then(() => load())
        .catch((e) => {
          setCardErrors((prev) => ({
            ...prev,
            [contractId]: (e as Error).message || 'Action failed. Please retry.',
          }));
          setAnnouncement(`Action failed for contract #${contractId}.`);
        })
        .finally(() => {
          setOptimisticIds((prev) => {
            const next = new Set(prev);
            next.delete(contractId);
            return next;
          });
        });
    },
    [optimisticIds, dispatchOptimistic, load],
  );

  // ── Blocking action helper (Cancel, Dispute, Resolve, rate) ───────────────

  const blockingAct = useCallback(
    async (id: number | 'new', fn: () => Promise<unknown>) => {
      setBlockingBusy(id);
      setGlobalError(null);
      try {
        await fn();
        await load();
      } catch (e) {
        setGlobalError((e as Error).message);
      } finally {
        setBlockingBusy(null);
      }
    },
    [load],
  );

  // ── Create form ───────────────────────────────────────────────────────────

  const create = (e: FormEvent) => {
    e.preventDefault();
    const milestones = form.milestones
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [title, amount] = part.includes(':')
          ? part.split(':')
          : [`Milestone ${i + 1}`, part];
        return { title: title.trim(), amount: Number(amount) };
      });
    blockingAct('new', () =>
      api('/api/v1/contracts', {
        method: 'POST',
        body: { title: form.title, client: form.client, freelancer: form.freelancer, milestones },
      }),
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dash">
      {/* Polite live region for optimistic action announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-region">
        {announcement}
      </div>

      <form className="card form" onSubmit={create} aria-labelledby="new-escrow">
        <h3 id="new-escrow">New escrow</h3>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="client">Client address</label>
          <input
            id="client"
            className="input mono"
            value={form.client}
            onChange={(e) => setForm({ ...form, client: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="freelancer">Freelancer address</label>
          <input
            id="freelancer"
            className="input mono"
            value={form.freelancer}
            onChange={(e) => setForm({ ...form, freelancer: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="milestones">Milestones</label>
          <input
            id="milestones"
            className="input"
            value={form.milestones}
            onChange={(e) => setForm({ ...form, milestones: e.target.value })}
            required
          />
          <span className="small muted">Comma separated, as Title: amount</span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={blockingBusy === 'new'}>
          {blockingBusy === 'new' ? 'Creating...' : 'Create escrow'}
        </button>
      </form>

      <div className="stack" style={{ minWidth: 0 }}>
        {globalError && (
          <div className="alert alert-error" role="alert">
            {globalError}
          </div>
        )}
        <h2 id="escrow-list" className="list-heading" ref={headingRef} tabIndex={-1}>
          Escrows
        </h2>
        <EscrowToolbar
          status={query.status}
          sort={query.sort}
          search={search}
          onStatusChange={(status) => update({ status })}
          onSortChange={(sort) => update({ sort })}
          onSearchChange={setSearch}
        />
        <p className="small muted" role="status" aria-live="polite" style={{ margin: 0 }}>
          {contracts !== null && !error && result.total > 0 && `Showing ${result.from}–${result.to} of ${result.total} escrows`}
        </p>
        {contracts === null && <div className="card muted">Loading escrows...</div>}
        {contracts?.length === 0 && !globalError && (
          <div className="card muted">No escrows yet. Create the first one.</div>
        )}

        {optimisticContracts.map((c) => (
          <EscrowCard
            key={c.id}
            c={c}
            optimistic={optimisticIds.has(c.id)}
            cardError={cardErrors[c.id] ?? null}
            blockingBusy={blockingBusy === c.id}
            onRelease={(index) =>
              optimisticAct(
                c.id,
                { type: 'release', contractId: c.id, milestoneIndex: index },
                `Releasing milestone ${index + 1}…`,
                () =>
                  api(`/api/v1/contracts/${c.id}/milestones/${index}/release`, {
                    method: 'POST',
                  }),
              )
            }
            onDeposit={() =>
              optimisticAct(
                c.id,
                { type: 'deposit', contractId: c.id, amount: c.totalAmount - c.fundedAmount },
                `Funding contract #${c.id}…`,
                () =>
                  api(`/api/v1/contracts/${c.id}/deposit`, {
                    method: 'POST',
                    body: { amount: c.totalAmount - c.fundedAmount },
                  }),
              )
            }
            onDispute={() =>
              blockingAct(c.id, () =>
                api(`/api/v1/contracts/${c.id}/dispute`, {
                  method: 'POST',
                  body: { raisedBy: c.client, reason: 'Raised from dashboard' },
                }),
              )
            }
            onCancel={() =>
              blockingAct(c.id, () =>
                api(`/api/v1/contracts/${c.id}/cancel`, { method: 'POST' }),
              )
            }
            onResolve={() =>
              blockingAct(c.id, () =>
                api(`/api/v1/contracts/${c.id}/resolve`, {
                  method: 'POST',
                  body: { freelancerBps: 5000 },
                }),
              )
            }
            onRate={(rating) =>
              blockingAct(c.id, () =>
                api(`/api/v1/contracts/${c.id}/reputation`, {
                  method: 'POST',
                  body: { rating },
                }),
              )
            }
            onRetry={() => retryRef.current[c.id]?.()}
          />
        ))}
      </div>
    </div>
  );
}
