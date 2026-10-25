import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/api';
import { pollOnce, runPool, startPoller, POLL_CONCURRENCY } from '@/lib/poller';
import type { EscrowContract } from '@/lib/api';
import type { WatchStore } from '@/lib/watchlist';
import type { WatchEvent } from '@/lib/watchlist';

const contract = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 1,
  title: 'Design',
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [],
  totalAmount: 300,
  fundedAmount: 300,
  releasedAmount: 0,
  status: 'Funded',
  reputationIssued: false,
  ...over,
});

const storeWith = (ids: number[]): WatchStore => ({
  version: 1,
  items: ids.map((id) => ({ id, lastSnapshot: { status: 'Created', releasedIdx: [], fundedAmount: 0 } })),
});

describe('runPool', () => {
  it('never runs more than the limit concurrently', async () => {
    let inFlight = 0;
    let max = 0;
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBe(3);
  });

  it('handles a limit larger than the item count', async () => {
    const seen: number[] = [];
    await runPool([1, 2], 10, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2]);
  });
});

describe('pollOnce', () => {
  it('emits events and updates the snapshot', async () => {
    const onEvents = vi.fn();
    const save = vi.fn();
    await pollOnce({
      fetchContract: async () =>
        contract({ status: 'Funded', fundedAmount: 300, milestones: [{ index: 0, title: 'A', amount: 300, released: true }] }),
      onEvents,
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: save,
    });
    expect(onEvents).toHaveBeenCalledTimes(1);
    const [id, events] = onEvents.mock.calls[0] as [number, WatchEvent[]];
    expect(id).toBe(1);
    expect(events.map((e) => e.type).sort()).toEqual(['funded', 'milestone_released']);
    expect(save).toHaveBeenCalled();
  });

  it('marks a 404 watched id as removed rather than erroring', async () => {
    const onRemoved = vi.fn();
    const save = vi.fn();
    await pollOnce({
      fetchContract: async () => {
        throw new ApiError({ kind: 'http', status: 404, code: 'contract_not_found' });
      },
      onEvents: vi.fn(),
      onRemoved,
      loadStore: () => storeWith([9]),
      saveStore: save,
    });
    expect(onRemoved).toHaveBeenCalledWith(9);
    const written = save.mock.calls[0][0] as WatchStore;
    expect(written.items).toHaveLength(0);
  });

  it('ignores non-404 errors', async () => {
    const onRemoved = vi.fn();
    await pollOnce({
      fetchContract: async () => {
        throw new ApiError({ kind: 'network' });
      },
      onEvents: vi.fn(),
      onRemoved,
      loadStore: () => storeWith([9]),
      saveStore: vi.fn(),
    });
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('does nothing with an empty watchlist', async () => {
    const fetchContract = vi.fn();
    await pollOnce({ fetchContract, onEvents: vi.fn(), onRemoved: vi.fn(), loadStore: () => storeWith([]), saveStore: vi.fn() });
    expect(fetchContract).not.toHaveBeenCalled();
  });

  it('bounds concurrency across many watched ids', async () => {
    let inFlight = 0;
    let max = 0;
    await pollOnce({
      fetchContract: async () => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return contract();
      },
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1, 2, 3, 4, 5, 6]),
      saveStore: vi.fn(),
    });
    expect(max).toBeLessThanOrEqual(POLL_CONCURRENCY);
  });
});

describe('startPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('polls on the interval while visible', async () => {
    const fetchContract = vi.fn().mockResolvedValue(contract());
    const stop = startPoller({
      fetchContract,
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
      intervalMs: 1000,
      isVisible: () => true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchContract).toHaveBeenCalledTimes(2);
  });

  it('pauses when the tab is hidden', async () => {
    const fetchContract = vi.fn().mockResolvedValue(contract());
    let visible = false;
    startPoller({
      fetchContract,
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
      intervalMs: 1000,
      isVisible: () => visible,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchContract).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(1);
  });

  it('does not overlap runs when a poll is still in flight', async () => {
    let resolveFetch: (c: EscrowContract) => void = () => {};
    const fetchContract = vi.fn(
      () =>
        new Promise<EscrowContract>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    startPoller({
      fetchContract,
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
      intervalMs: 1000,
      isVisible: () => true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(1);
    resolveFetch(contract());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(2);
  });
});
