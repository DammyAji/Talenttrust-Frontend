import { api, ApiError, EscrowContract } from './api';
import {
  diffSnapshots,
  loadStore,
  snapshotOf,
  saveStore,
  WatchEvent,
  WatchStore,
  WatchedEscrow,
} from './watchlist';

export const POLL_INTERVAL_MS = 60000;
export const POLL_CONCURRENCY = 3;

export interface PollDeps {
  fetchContract: (id: number) => Promise<EscrowContract>;
  onEvents: (id: number, events: WatchEvent[], current: EscrowContract) => void;
  onRemoved: (id: number) => void;
  loadStore?: () => WatchStore;
  saveStore?: (store: WatchStore) => void;
}

export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export async function pollOnce(deps: PollDeps): Promise<void> {
  const read = deps.loadStore ?? loadStore;
  const write = deps.saveStore ?? saveStore;
  const store = read();
  const watched: WatchedEscrow[] = [...store.items];

  const removals: number[] = [];
  const updates: Map<number, WatchedEscrow> = new Map();

  await runPool(watched, POLL_CONCURRENCY, async (item) => {
    try {
      const contract = await deps.fetchContract(item.id);
      const nextSnapshot = snapshotOf(contract);
      const events = diffSnapshots(item.lastSnapshot, nextSnapshot);
      if (events.length > 0) deps.onEvents(item.id, events, contract);
      if (
        events.length > 0 ||
        contract.status !== item.lastSnapshot.status ||
        contract.fundedAmount !== item.lastSnapshot.fundedAmount ||
        nextSnapshot.releasedIdx.length !== item.lastSnapshot.releasedIdx.length
      ) {
        updates.set(item.id, { id: item.id, lastSnapshot: nextSnapshot });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        removals.push(item.id);
        deps.onRemoved(item.id);
      }
    }
  });

  if (removals.length > 0 || updates.size > 0) {
    const current = read();
    const items = current.items
      .filter((i) => !removals.includes(i.id))
      .map((i) => updates.get(i.id) ?? i);
    write({ version: current.version, items });
  }
}

export interface PollerOptions extends PollDeps {
  intervalMs?: number;
  isVisible?: () => boolean;
  setIntervalFn?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  addVisibilityListener?: (fn: () => void) => () => void;
}

export function startPoller(options: PollerOptions): () => void {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const setIntervalFn = options.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
  const clearIntervalFn = options.clearIntervalFn ?? ((h) => clearInterval(h));
  const isVisible = options.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState === 'visible');

  let running = false;
  const tick = async () => {
    if (running || !isVisible()) return;
    running = true;
    try {
      await pollOnce(options);
    } finally {
      running = false;
    }
  };

  const handle = setIntervalFn(tick, intervalMs);
  const removeListener = options.addVisibilityListener
    ? options.addVisibilityListener(() => {
        if (isVisible()) void tick();
      })
    : undefined;

  return () => {
    clearIntervalFn(handle);
    removeListener?.();
  };
}

export async function fetchContractById(id: number, signal?: AbortSignal): Promise<EscrowContract> {
  const res = await api<{ data: EscrowContract }>(`/api/v1/contracts/${id}`, { signal });
  return res.data;
}
