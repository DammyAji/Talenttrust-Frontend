'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, EscrowContract } from '@/lib/api';
import { MilestoneTimeline } from './milestones/MilestoneTimeline';

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

export function EscrowDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [search, setSearch] = useState(query.q);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const [form, setForm] = useState({
    title: 'Website redesign',
    client: 'GCLIENT' + 'X'.repeat(49),
    freelancer: 'GFREELANCER' + 'Y'.repeat(45),
    milestones: 'Design: 300, Build: 700',
  });

  // Status is filtered by the API, the rest is done client-side
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const qs = query.status ? `?status=${encodeURIComponent(query.status)}` : '';
      const res = await api<{ data: EscrowContract[] }>(`/api/v1/contracts${qs}`, { signal: controller.signal });
      setContracts(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'aborted') return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      setError({ message: e instanceof ApiError ? e.userMessage : `Could not reach the API: ${detail}`, detail });
      setContracts([]);
    }
  }, [query.status]);

  useEffect(() => {
    load();
    return () => loadController.current?.abort();
  }, [load]);

  const update = useCallback(
    (patch: Partial<ContractQuery>) => {
      const qs = toSearchParams({ ...query, page: 1, ...patch }).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [query, router, pathname],
  );

  useEffect(() => {
    setSearch(query.q);
  }, [query.q]);

  useEffect(() => {
    if (search.trim() === query.q) return;
    const t = setTimeout(() => update({ q: search.trim() }), 250);
    return () => clearTimeout(t);
  }, [search, query.q, update]);

  const result = useMemo(() => applyQuery(contracts ?? [], query), [contracts, query]);
  const filtered = query.status !== '' || query.q !== '';

  const goToPage = (page: number) => {
    update({ page });
    headingRef.current?.focus();
  };

  const clearFilters = () => {
    setSearch('');
    update(DEFAULT_QUERY);
  };

  const act = async (id: number | 'new', fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'aborted') return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      setError({ message: e instanceof ApiError ? e.userMessage : detail, detail });
    } finally {
      setBusy(null);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const milestones = form.milestones
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [title, amount] = part.includes(':') ? part.split(':') : [`Milestone ${i + 1}`, part];
        return { title: title.trim(), amount: Number(amount) };
      });
    act('new', () =>
      api('/api/v1/contracts', {
        method: 'POST',
        body: { title: form.title, client: form.client, freelancer: form.freelancer, milestones },
      }),
    );
  };

  return (
    <div className="dash">
      <form className="card form" onSubmit={create} aria-labelledby="new-escrow">
        <h3 id="new-escrow">New escrow</h3>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="client">Client address</label>
          <input id="client" className="input mono" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="freelancer">Freelancer address</label>
          <input id="freelancer" className="input mono" value={form.freelancer} onChange={(e) => setForm({ ...form, freelancer: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="milestones">Milestones</label>
          <input id="milestones" className="input" value={form.milestones} onChange={(e) => setForm({ ...form, milestones: e.target.value })} required />
          <span className="small muted">Comma separated, as Title: amount</span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy === 'new'}>
          {busy === 'new' ? 'Creating...' : 'Create escrow'}
        </button>
      </form>

      <div className="stack" style={{ minWidth: 0 }}>
        {error && (
          <div className="alert alert-error" role="alert" title={error.detail}>
            {error.message}
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
        {contracts?.length === 0 && !error && <div className="card muted">No escrows yet. Create the first one.</div>}
        {contracts?.map((c) => {
          const active = c.status === 'Created' || c.status === 'Funded';
          const pct = c.totalAmount ? Math.round((c.releasedAmount / c.totalAmount) * 100) : 0;
          return (
            <article className="card" key={c.id}>
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
              <MilestoneTimeline
                contract={c}
                onRelease={(index) =>
                  act(c.id, () =>
                    api(`/api/v1/contracts/${c.id}/milestones/${index}/release`, { method: 'POST' }),
                  )
                }
                busy={busy === c.id}
              />
              <div className="row">
                {active && c.fundedAmount < c.totalAmount && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, () =>
                        api(`/api/v1/contracts/${c.id}/deposit`, { method: 'POST', body: { amount: c.totalAmount - c.fundedAmount } }),
                      )
                    }
                  >
                    Fund {c.totalAmount - c.fundedAmount} {c.token}
                  </button>
                )}
                {active && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === c.id}
                      onClick={() =>
                        act(c.id, () =>
                          api(`/api/v1/contracts/${c.id}/dispute`, { method: 'POST', body: { raisedBy: c.client, reason: 'Raised from dashboard' } }),
                        )
                      }
                    >
                      Dispute
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busy === c.id}
                      onClick={() => act(c.id, () => api(`/api/v1/contracts/${c.id}/cancel`, { method: 'POST' }))}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {c.status === 'Disputed' && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === c.id}
                    onClick={() =>
                      act(c.id, () => api(`/api/v1/contracts/${c.id}/resolve`, { method: 'POST', body: { freelancerBps: 5000 } }))
                    }
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
                        disabled={busy === c.id}
                        onClick={() => act(c.id, () => api(`/api/v1/contracts/${c.id}/reputation`, { method: 'POST', body: { rating: r } }))}
                      >
                        {r}
                      </button>
                    ))}
                  </>
                )}
                {c.status === 'Completed' && c.reputationIssued && <span className="small muted">Rated. Thanks!</span>}
              </div>
            </article>
          );
        })}
        <Pagination page={result.page} pageCount={result.pageCount} onPageChange={goToPage} />
      </div>
    </div>
  );
}
