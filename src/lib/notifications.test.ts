import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  appendNotification,
  clearNotifications,
  loadNotifications,
  markAllRead,
  NOTIFICATIONS_KEY,
  NOTIFICATIONS_MAX,
  NOTIFICATIONS_VERSION,
  saveNotifications,
  unreadCount,
  type NotificationsStore,
} from '@/lib/notifications';

const empty = (): NotificationsStore => ({ version: NOTIFICATIONS_VERSION, items: [] });

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('notifications store', () => {
  it('appends newest first, unread by default', () => {
    let store = empty();
    store = appendNotification(store, { escrowId: 1, type: 'funded', title: 'A', message: 'a' });
    store = appendNotification(store, { escrowId: 2, type: 'disputed', title: 'B', message: 'b' });
    expect(store.items[0].escrowId).toBe(2);
    expect(store.items[1].escrowId).toBe(1);
    expect(unreadCount(store)).toBe(2);
  });

  it('caps at 100 items', () => {
    let store = empty();
    for (let i = 0; i < 150; i += 1) {
      store = appendNotification(store, { escrowId: i, type: 'funded', title: `t${i}`, message: `m${i}` });
    }
    expect(store.items).toHaveLength(NOTIFICATIONS_MAX);
    expect(store.items[0].escrowId).toBe(149);
  });

  it('marks all as read', () => {
    let store = appendNotification(empty(), { escrowId: 1, type: 'funded', title: 'A', message: 'a' });
    store = markAllRead(store);
    expect(unreadCount(store)).toBe(0);
  });

  it('clears everything and persists the empty store', () => {
    saveNotifications(appendNotification(empty(), { escrowId: 1, type: 'funded', title: 'A', message: 'a' }));
    expect(loadNotifications().items).toHaveLength(1);
    clearNotifications();
    expect(loadNotifications().items).toHaveLength(0);
  });

  it('resets corrupt storage with a warning', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(NOTIFICATIONS_KEY, 'oops');
    expect(loadNotifications()).toEqual({ version: NOTIFICATIONS_VERSION, items: [] });
  });

  it('resets an unknown version', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify({ version: 5, items: [] }));
    expect(loadNotifications()).toEqual({ version: NOTIFICATIONS_VERSION, items: [] });
  });

  it('does not throw when storage is full', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(saveNotifications(empty())).toBe(false);
  });
});
