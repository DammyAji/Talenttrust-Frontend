import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  diffSnapshots,
  loadStore,
  saveStore,
  snapshotOf,
  unwatch,
  watch,
  WATCH_STORE_KEY,
  WATCH_STORE_VERSION,
  type Snapshot,
} from '@/lib/watchlist';
import type { EscrowContract } from '@/lib/api';

const contract = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 1,
  title: 'Design',
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [
    { index: 0, title: 'A', amount: 100, released: false },
    { index: 1, title: 'B', amount: 200, released: false },
  ],
  totalAmount: 300,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
  ...over,
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  status: 'Created',
  releasedIdx: [],
  fundedAmount: 0,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('snapshotOf', () => {
  it('collects released milestone indices and funded amount', () => {
    const c = contract({
      status: 'Funded',
      fundedAmount: 300,
      milestones: [
        { index: 0, title: 'A', amount: 100, released: true },
        { index: 1, title: 'B', amount: 200, released: false },
      ],
    });
    expect(snapshotOf(c)).toEqual({ status: 'Funded', releasedIdx: [0], fundedAmount: 300 });
  });
});

describe('diffSnapshots', () => {
  it('returns no events when nothing changed', () => {
    expect(diffSnapshots(snap({ status: 'Funded', fundedAmount: 300 }), snap({ status: 'Funded', fundedAmount: 300 }))).toEqual([]);
  });

  it('returns no events for the first snapshot (prev null)', () => {
    expect(diffSnapshots(null, snap({ status: 'Funded', fundedAmount: 100 }))).toEqual([]);
  });

  it('emits funded when the funded amount increases', () => {
    const events = diffSnapshots(snap({ fundedAmount: 0 }), snap({ fundedAmount: 300 }));
    expect(events.map((e) => e.type)).toEqual(['funded']);
  });

  it('emits one event per newly released milestone, including multiples between polls', () => {
    const events = diffSnapshots(
      snap({ status: 'Funded', fundedAmount: 300, releasedIdx: [] }),
      snap({ status: 'Funded', fundedAmount: 300, releasedIdx: [0, 1] }),
    );
    expect(events.filter((e) => e.type === 'milestone_released')).toHaveLength(2);
  });

  it('does not re-emit already released milestones', () => {
    const events = diffSnapshots(
      snap({ status: 'Funded', releasedIdx: [0] }),
      snap({ status: 'Funded', releasedIdx: [0] }),
    );
    expect(events).toEqual([]);
  });

  it('emits disputed on transition to Disputed', () => {
    expect(diffSnapshots(snap({ status: 'Funded' }), snap({ status: 'Disputed' })).map((e) => e.type)).toEqual(['disputed']);
  });

  it('emits resolved on transition to Resolved', () => {
    expect(diffSnapshots(snap({ status: 'Disputed' }), snap({ status: 'Resolved' })).map((e) => e.type)).toEqual(['resolved']);
  });

  it('emits cancelled on transition to Cancelled', () => {
    expect(diffSnapshots(snap({ status: 'Funded' }), snap({ status: 'Cancelled' })).map((e) => e.type)).toEqual(['cancelled']);
  });

  it('emits completed on transition to Completed', () => {
    expect(diffSnapshots(snap({ status: 'Funded' }), snap({ status: 'Completed' })).map((e) => e.type)).toEqual(['completed']);
  });

  it('combines a release and a completion between polls', () => {
    const events = diffSnapshots(
      snap({ status: 'Funded', fundedAmount: 300, releasedIdx: [0] }),
      snap({ status: 'Completed', fundedAmount: 300, releasedIdx: [0, 1] }),
    );
    expect(events.map((e) => e.type).sort()).toEqual(['completed', 'milestone_released']);
  });
});

describe('watch store persistence', () => {
  it('watches and reads back a snapshot', () => {
    watch(7, snap({ status: 'Funded', fundedAmount: 300 }));
    expect(loadStore().items).toHaveLength(1);
    expect(loadStore().items[0]).toEqual({ id: 7, lastSnapshot: { status: 'Funded', releasedIdx: [], fundedAmount: 300 } });
  });

  it('unwatches an id', () => {
    watch(7, snap());
    expect(unwatch(7).items).toHaveLength(0);
  });

  it('resets corrupt JSON with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(WATCH_STORE_KEY, '{not valid json');
    expect(loadStore()).toEqual({ version: WATCH_STORE_VERSION, items: [] });
    expect(warn).toHaveBeenCalled();
  });

  it('resets an unknown version', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(WATCH_STORE_KEY, JSON.stringify({ version: 99, items: [{ id: 1, lastSnapshot: snap() }] }));
    expect(loadStore()).toEqual({ version: WATCH_STORE_VERSION, items: [] });
    expect(warn).toHaveBeenCalled();
  });

  it('resets a structurally invalid item', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(WATCH_STORE_KEY, JSON.stringify({ version: WATCH_STORE_VERSION, items: [{ id: 'x' }] }));
    expect(loadStore().items).toEqual([]);
  });

  it('survives a quota-exceeded write without throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => saveStore({ version: WATCH_STORE_VERSION, items: [] })).not.toThrow();
    expect(saveStore({ version: WATCH_STORE_VERSION, items: [] })).toBe(false);
  });

  it('returns an empty store when storage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(loadStore()).toEqual({ version: WATCH_STORE_VERSION, items: [] });
  });
});
