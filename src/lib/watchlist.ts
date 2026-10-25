import type { EscrowContract } from './api';

export const WATCH_STORE_KEY = 'tt.watch.v1';
export const WATCH_STORE_VERSION = 1;
export const WATCH_MAX_ITEMS = 200;

export interface Snapshot {
  status: EscrowContract['status'];
  releasedIdx: number[];
  fundedAmount: number;
}

export interface WatchedEscrow {
  id: number;
  lastSnapshot: Snapshot;
}

export interface WatchStore {
  version: number;
  items: WatchedEscrow[];
}

export type WatchEventType =
  | 'funded'
  | 'milestone_released'
  | 'disputed'
  | 'resolved'
  | 'cancelled'
  | 'completed';

export interface WatchEvent {
  type: WatchEventType;
  title: string;
  message: string;
}

export function snapshotOf(contract: EscrowContract): Snapshot {
  return {
    status: contract.status,
    releasedIdx: contract.milestones.filter((m) => m.released).map((m) => m.index).sort((a, b) => a - b),
    fundedAmount: contract.fundedAmount,
  };
}

const sameMembers = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function diffSnapshots(prev: Snapshot | null, next: Snapshot): WatchEvent[] {
  if (!prev) return [];

  const events: WatchEvent[] = [];

  if (next.fundedAmount > prev.fundedAmount) {
    events.push({
      type: 'funded',
      title: 'Escrow funded',
      message: `The client added funds to escrow (now ${next.fundedAmount} total funded).`,
    });
  }

  const newlyReleased = next.releasedIdx.filter((i) => !prev.releasedIdx.includes(i));
  for (const idx of newlyReleased) {
    events.push({
      type: 'milestone_released',
      title: 'Milestone released',
      message: `Milestone ${idx + 1} was released to the freelancer.`,
    });
  }

  if (next.status !== prev.status) {
    switch (next.status) {
      case 'Disputed':
        events.push({
          type: 'disputed',
          title: 'Dispute opened',
          message: 'A dispute was opened and the escrow is frozen until it is resolved.',
        });
        break;
      case 'Resolved':
        events.push({
          type: 'resolved',
          title: 'Dispute resolved',
          message: 'The dispute was resolved and the held balance was split between the parties.',
        });
        break;
      case 'Cancelled':
        events.push({
          type: 'cancelled',
          title: 'Escrow cancelled',
          message: 'The escrow was cancelled and any unreleased funds were refunded to the client.',
        });
        break;
      case 'Completed':
        events.push({
          type: 'completed',
          title: 'Escrow completed',
          message: 'Every milestone was released. The engagement is complete.',
        });
        break;
      default:
        break;
    }
  }

  return events;
}

function emptyStore(): WatchStore {
  return { version: WATCH_STORE_VERSION, items: [] };
}

function isValidStore(value: unknown): value is WatchStore {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== WATCH_STORE_VERSION) return false;
  if (!Array.isArray(v.items)) return false;
  return v.items.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const it = item as Record<string, unknown>;
    const snap = it.lastSnapshot as Record<string, unknown> | undefined;
    if (typeof it.id !== 'number' || !snap || typeof snap !== 'object') return false;
    if (typeof snap.status !== 'string') return false;
    if (!Array.isArray(snap.releasedIdx)) return false;
    if (typeof snap.fundedAmount !== 'number') return false;
    return true;
  });
}

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadStore(): WatchStore {
  const s = storage();
  if (!s) return emptyStore();
  let raw: string | null = null;
  try {
    raw = s.getItem(WATCH_STORE_KEY);
  } catch {
    return emptyStore();
  }
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    if (!isValidStore(parsed)) {
      console.warn('Watchlist data was in an unknown format and has been reset.');
      saveStore(emptyStore());
      return emptyStore();
    }
    return { version: parsed.version, items: parsed.items.slice(0, WATCH_MAX_ITEMS) };
  } catch {
    console.warn('Watchlist data was corrupt and has been reset.');
    saveStore(emptyStore());
    return emptyStore();
  }
}

export function saveStore(store: WatchStore): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(WATCH_STORE_KEY, JSON.stringify({ version: WATCH_STORE_VERSION, items: store.items }));
    return true;
  } catch {
    console.warn('Could not persist the watchlist (storage full or unavailable).');
    return false;
  }
}

export function isWatched(id: number): boolean {
  return loadStore().items.some((i) => i.id === id);
}

export function watch(id: number, snapshot: Snapshot): WatchStore {
  const store = loadStore();
  const items = store.items.filter((i) => i.id !== id);
  items.unshift({ id, lastSnapshot: snapshot });
  const next: WatchStore = { version: WATCH_STORE_VERSION, items: items.slice(0, WATCH_MAX_ITEMS) };
  saveStore(next);
  return next;
}

export function unwatch(id: number): WatchStore {
  const store = loadStore();
  const next: WatchStore = { version: WATCH_STORE_VERSION, items: store.items.filter((i) => i.id !== id) };
  saveStore(next);
  return next;
}
