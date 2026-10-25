"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError, EscrowContract, Reputation, unwrapContract, unwrapReputation } from "@/lib/api";
import { StarRating } from "@/components/reputation/StarRating";
import {
  applyQuery,
  ContractQuery,
  DEFAULT_QUERY,
  filterContracts,
  parseQuery,
  toSearchParams,
} from "@/lib/contractQuery";
import { EscrowToolbar } from "./escrow/EscrowToolbar";
import { Pagination } from "./escrow/Pagination";
import { ExportMenu } from "./escrow/ExportMenu";
import { DisputeDialog } from "./disputes/DisputeDialog";
import { EscrowCard } from "./escrow/EscrowCard";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useOptionalContractStatus } from "@/components/ContractStatusProvider";
import { assertNotPaused } from "@/lib/stellar/status";
import { normalizeAddress } from "@/lib/stellar/address";
import { AddressInput, type AddressInputHandle } from "@/components/forms/AddressInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { WatchToggle } from "@/components/WatchToggle";
import { useOptionalToast } from "@/components/toast/ToastProvider";

const asContract = (payload: unknown): EscrowContract | null => {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as { data?: EscrowContract; id?: number };
  if (obj.data && typeof obj.data.id === "number") return obj.data;
  if (typeof obj.id === "number") return payload as EscrowContract;
  return null;
};

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

export function EscrowDashboard() {
  const confirm = useConfirm();
  const toast = useOptionalToast();
  const contractStatus = useOptionalContractStatus()?.status;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const [search, setSearch] = useState(query.q);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const disputeTriggerRef = useRef<HTMLButtonElement>(null);
  const [disputeContract, setDisputeContract] = useState<EscrowContract | null>(
    null,
  );
  const [contracts, setContracts] = useState<EscrowContract[] | null>(null);
  const [error, setError] = useState<{
    message: string;
    detail?: string;
  } | null>(null);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [rated, setRated] = useState<Record<number, Reputation>>({});
  const [ratingErrors, setRatingErrors] = useState<Record<number, string>>({});
  const loadController = useRef<AbortController | null>(null);
  const [crossFieldError, setCrossFieldError] = useState<string | null>(null);
  const clientRef = useRef<AddressInputHandle>(null);
  const freelancerRef = useRef<AddressInputHandle>(null);
  const [form, setForm] = useState({
    title: 'Website redesign',
    client: '',
    freelancer: '',
    milestones: 'Design: 300, Build: 700',
  });

  // Status is filtered by the API, the rest is done client-side
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const qs = query.status
        ? `?status=${encodeURIComponent(query.status)}`
        : "";
      const res = await api<{ data: EscrowContract[] }>(
        `/api/v1/contracts${qs}`,
        { signal: controller.signal },
      );
      setContracts(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "aborted") return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      setError({
        message:
          e instanceof ApiError
            ? e.userMessage
            : `Could not reach the API: ${detail}`,
        detail,
      });
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

  const result = useMemo(
    () => applyQuery(contracts ?? [], query),
    [contracts, query],
  );
  const visible = useMemo(
    () => (contracts ? filterContracts(contracts, query) : null),
    [contracts, query],
  );
  const filtered = query.status !== "" || query.q !== "";

  const goToPage = (page: number) => {
    update({ page });
    headingRef.current?.focus();
  };

  const clearFilters = () => {
    setSearch("");
    update(DEFAULT_QUERY);
  };

  const act = async (
    id: number | "new",
    fn: () => Promise<unknown>,
    messages?: { pending: string; success: string },
    onSuccess?: (result: unknown) => void,
  ) => {
    try {
      assertNotPaused({ status: contractStatus });
    } catch (e) {
      setError({ message: (e as Error).message });
      setAnnouncement(`Error: ${(e as Error).message}`);
      return;
    }

    setBusy(id);
    setError(null);
    if (messages) setAnnouncement(messages.pending);
    try {
      const result = await fn();
      // Write the returned contract into local state; only fall back to a
      // full reload when the response does not contain a contract.
      const updated = unwrapContract(result);
      if (updated) {
        setContracts((prev) => {
          if (!prev) return [updated];
          const exists = prev.some((c) => c.id === updated.id);
          return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
        });
      } else {
        // Endpoints that don't return a contract (e.g. rate) require a refresh.
        await load();
      }
      if (messages) setAnnouncement(messages.success);
      onSuccess?.(result);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "aborted") return;
      const detail = e instanceof ApiError ? e.message : (e as Error).message;
      const message = e instanceof ApiError ? e.userMessage : detail;
      setError({ message, detail });
      setAnnouncement(`Error: ${message}`);
      toast.error(detail);
    } finally {
      setBusy(null);
    }
  };

  // Rating has its own flow: the endpoint returns a Reputation (not a contract)
  // and errors are shown inline on the card so they survive a list refresh.
  const rate = async (c: EscrowContract, rating: number) => {
    try {
      assertNotPaused({ status: contractStatus });
    } catch (e) {
      setRatingErrors((prev) => ({ ...prev, [c.id]: (e as Error).message }));
      return;
    }
    setBusy(c.id);
    setRatingErrors((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
    setAnnouncement("Submitting rating…");
    try {
      const reputation = await api<Reputation>(`/api/v1/contracts/${c.id}/reputation`, {
        method: "POST",
        body: { rating },
      }).then(unwrapReputation);
      if (reputation) setRated((prev) => ({ ...prev, [c.id]: reputation }));
      await load();
      setAnnouncement("Rating submitted");
      toast.success(`Rating submitted for escrow #${c.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.kind === "aborted") return;
      // Show the API detail (e.g. "already rated") inline on the card.
      const message = (e as Error).message;
      setRatingErrors((prev) => ({ ...prev, [c.id]: message }));
      setAnnouncement(`Error: ${message}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const viewEscrow = (id: number) => {
    const el = document.getElementById(`escrow-${id}`);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    setCrossFieldError(null);

    const clientOk = clientRef.current?.validate() ?? false;
    const freelancerOk = freelancerRef.current?.validate() ?? false;
    if (!clientOk) {
      clientRef.current?.focus();
      return;
    }
    if (!freelancerOk) {
      freelancerRef.current?.focus();
      return;
    }

    const client = normalizeAddress(form.client);
    const freelancer = normalizeAddress(form.freelancer);
    if (client === freelancer) {
      setCrossFieldError('Client and freelancer must be different addresses.');
      freelancerRef.current?.focus();
      return;
    }

    const milestones = form.milestones
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part, i) => {
        const [title, amount] = part.includes(":")
          ? part.split(":")
          : [`Milestone ${i + 1}`, part];
        return { title: title.trim(), amount: Number(amount) };
      });
    act("new", () =>
      api('/api/v1/contracts', {
        method: 'POST',
        body: { title: form.title, client, freelancer, milestones },
      }),
      { pending: "Creating escrow…", success: "Escrow created" },
      (result) => {
        const created = asContract(result);
        if (created?.id) {
          toast.success(`Escrow #${created.id} created`, {
            action: { label: "View escrow", onClick: () => viewEscrow(created.id) },
          });
        } else {
          toast.success("Escrow created");
        }
      },
    );
  };

  return (
    <div className="dash">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="escrow-live-announcer"
      >
        {announcement}
      </div>

      <section aria-labelledby="create-escrow-heading">
        <h2 id="create-escrow-heading" className="sr-only">
          Create escrow
        </h2>
        <form
          className="card form"
          onSubmit={create}
          aria-labelledby="new-escrow"
          aria-busy={busy === "new"}
        >
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
          <AddressInput
            ref={clientRef}
            id="client"
            label="Client address"
            value={form.client}
            onChange={(client) => setForm((current) => ({ ...current, client }))}
            placeholder="G... Stellar account address"
            description="56 characters, starting with G. Checksum is verified before submitting."
          />
          <AddressInput
            ref={freelancerRef}
            id="freelancer"
            label="Freelancer address"
            value={form.freelancer}
            onChange={(freelancer) => {
              setCrossFieldError(null);
              setForm((current) => ({ ...current, freelancer }));
            }}
            placeholder="G... Stellar account address"
            description="Must be a different account from the client."
            error={crossFieldError}
          />
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
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy === "new"}
          >
            {busy === "new" ? "Creating..." : "Create escrow"}
          </button>
        </form>
      </section>

      <section className="stack" style={{ minWidth: 0 }} aria-labelledby="escrow-list">
        <div className="row list-actions">
          <ExportMenu contracts={visible} />
        </div>
        {error && (
          <div className="alert alert-error" role="alert" title={error.detail}>
            {error.message}
          </div>
        )}
        <h2
          id="escrow-list"
          className="list-heading"
          ref={headingRef}
          tabIndex={-1}
        >
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
        <p
          className="small muted"
          role="status"
          aria-live="polite"
          style={{ margin: 0 }}
        >
          {contracts !== null &&
            !error &&
            result.total > 0 &&
            `Showing ${result.from}–${result.to} of ${result.total} escrows`}
        </p>
        {contracts === null && (
          <div className="skeleton-cards" role="status" aria-live="polite">
            <span className="sr-only">Loading…</span>
            {[0, 1, 2].map((i) => (
              <EscrowCardSkeleton key={i} />
            ))}
          </div>
        )}
        {contracts !== null &&
          result.total === 0 &&
          !error &&
          (filtered ? (
            <div
              className="card row empty"
              style={{ justifyContent: "space-between" }}
            >
              <span className="muted">No escrows match these filters.</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="card muted">
              No escrows yet. Create the first one.
            </div>
          ))}
        {result.items.map((c) => (
          <EscrowCard
            key={c.id}
            contract={c}
            busy={busy === c.id}
            headerActions={<WatchToggle contract={c} />}
            extraActions={
              (c.status === "Completed" || c.status === "Resolved" || c.status === "Cancelled") && (
                <Link href={`/contracts/${c.id}/statement`} className="btn btn-secondary btn-sm">
                  Statement
                </Link>
              )
            }
            onFund={(contract, amount) =>
              act(
                contract.id,
                () =>
                  api(`/api/v1/contracts/${contract.id}/deposit`, {
                    method: "POST",
                    body: { amount },
                  }),
                { pending: `Funding escrow #${contract.id}…`, success: `Escrow #${contract.id} funded` },
                () => toast.success(`Escrow #${contract.id} funded`),
              )
            }
            onReleaseNext={(contract, milestoneIndex) =>
              act(
                contract.id,
                () =>
                  api(`/api/v1/contracts/${contract.id}/milestones/${milestoneIndex}/release`, {
                    method: "POST",
                  }),
                { pending: "Releasing milestone…", success: "Milestone released" },
                () => toast.success(`Escrow #${contract.id}: milestone released`),
              )
            }
            onDispute={(contract, trigger) => {
              disputeTriggerRef.current = trigger;
              setDisputeContract(contract);
            }}
            onCancel={async (contract) => {
              const held = contract.fundedAmount - contract.releasedAmount;
              const confirmed = await confirm({
                title: `Cancel escrow #${contract.id}?`,
                description: `Refund ${held} ${contract.token} to the client and close escrow #${contract.id}. This cannot be undone.`,
                tone: "danger",
                confirmLabel: "Cancel escrow",
                cancelLabel: "Keep escrow",
                requireText: held > 0 ? String(contract.id) : undefined,
              });
              if (confirmed) {
                act(
                  contract.id,
                  () => api(`/api/v1/contracts/${contract.id}/cancel`, { method: "POST" }),
                  { pending: "Cancelling escrow…", success: "Escrow cancelled" },
                  () => toast.success(`Escrow #${contract.id} cancelled`),
                );
              }
            }}
            onResolve={(contract) =>
              act(
                contract.id,
                () =>
                  api(`/api/v1/contracts/${contract.id}/resolve`, {
                    method: "POST",
                    body: { freelancerBps: 5000 },
                  }),
                { pending: "Resolving dispute…", success: "Dispute resolved" },
                () => toast.success(`Escrow #${contract.id} resolved`),
              )
            }
            ratingSlot={
              c.status === "Completed" ? (
                <>
                  {!c.reputationIssued && !rated[c.id] && (
                    <StarRating onSubmit={(rating) => rate(c, rating)} disabled={busy === c.id} />
                  )}
                  {rated[c.id] && (
                    <p className="small rate-note">
                      New average: {rated[c.id].averageRating} / 5 across {rated[c.id].completedContracts}{" "}
                      <Link href={`/reputation?address=${encodeURIComponent(c.freelancer)}`}>View reputation</Link>
                    </p>
                  )}
                  {c.reputationIssued && !rated[c.id] && <span className="small muted">Rated. Thanks!</span>}
                  {ratingErrors[c.id] && (
                    <div className="alert alert-error small" role="alert" style={{ flex: "1 1 100%", margin: 0 }}>
                      {ratingErrors[c.id]}
                    </div>
                  )}
                </>
              ) : undefined
            }
          />
        ))}
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          onPageChange={goToPage}
        />
      </section>
      {disputeContract && (
        <DisputeDialog
          contract={disputeContract}
          triggerRef={disputeTriggerRef}
          onClose={() => setDisputeContract(null)}
          onSuccess={async () => {
            const id = disputeContract.id;
            await load();
            toast.success(`Escrow #${id} disputed`);
          }}
        />
      )}
    </div>
  );
}
