import type { WatchEventType } from './watchlist';

export const NOTIFICATIONS_KEY = 'tt.notifications.v1';
export const NOTIFICATIONS_VERSION = 1;
export const NOTIFICATIONS_MAX = 100;

export interface NotificationItem {
  id: string;
  escrowId: number;
  type: WatchEventType;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

export interface NotificationsStore {
  version: number;
  items: NotificationItem[];
}

function emptyStore(): NotificationsStore {
  return { version: NOTIFICATIONS_VERSION, items: [] };
}

function isValidItem(value: unknown): value is NotificationItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.escrowId === 'number' &&
    typeof v.type === 'string' &&
    typeof v.title === 'string' &&
    typeof v.message === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.read === 'boolean'
  );
}

function isValidStore(value: unknown): value is NotificationsStore {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== NOTIFICATIONS_VERSION) return false;
  if (!Array.isArray(v.items)) return false;
  return v.items.every(isValidItem);
}

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function loadNotifications(): NotificationsStore {
  const s = storage();
  if (!s) return emptyStore();
  let raw: string | null = null;
  try {
    raw = s.getItem(NOTIFICATIONS_KEY);
  } catch {
    return emptyStore();
  }
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    if (!isValidStore(parsed)) {
      console.warn('Notification data was in an unknown format and has been reset.');
      saveNotifications(emptyStore());
      return emptyStore();
    }
    return { version: parsed.version, items: parsed.items.slice(0, NOTIFICATIONS_MAX) };
  } catch {
    console.warn('Notification data was corrupt and has been reset.');
    saveNotifications(emptyStore());
    return emptyStore();
  }
}

export function saveNotifications(store: NotificationsStore): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(NOTIFICATIONS_KEY, JSON.stringify({ version: NOTIFICATIONS_VERSION, items: store.items }));
    return true;
  } catch {
    console.warn('Could not persist notifications (storage full or unavailable).');
    return false;
  }
}

let seq = 0;
export function makeNotificationId(escrowId: number, type: string, now = Date.now()): string {
  seq += 1;
  return `${escrowId}:${type}:${now}:${seq}`;
}

export function appendNotification(
  store: NotificationsStore,
  item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'> & Partial<Pick<NotificationItem, 'id' | 'createdAt' | 'read'>>,
): NotificationsStore {
  const full: NotificationItem = {
    id: item.id ?? makeNotificationId(item.escrowId, item.type, item.createdAt),
    escrowId: item.escrowId,
    type: item.type,
    title: item.title,
    message: item.message,
    createdAt: item.createdAt ?? Date.now(),
    read: item.read ?? false,
  };
  const items = [full, ...store.items].slice(0, NOTIFICATIONS_MAX);
  return { version: NOTIFICATIONS_VERSION, items };
}

export function unreadCount(store: NotificationsStore): number {
  return store.items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}

export function markAllRead(store: NotificationsStore): NotificationsStore {
  return { version: NOTIFICATIONS_VERSION, items: store.items.map((i) => ({ ...i, read: true })) };
}

export function clearNotifications(): NotificationsStore {
  const next = emptyStore();
  saveNotifications(next);
  return next;
}
