'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EscrowContract } from '@/lib/api';
import {
  appendNotification,
  clearNotifications,
  loadNotifications,
  markAllRead,
  NotificationsStore,
  saveNotifications,
  unreadCount,
} from '@/lib/notifications';
import {
  loadStore,
  saveStore,
  snapshotOf,
  unwatch,
  WATCH_STORE_KEY,
  watch,
  WatchEvent,
  WatchStore,
} from '@/lib/watchlist';
import {
  fetchContractById,
  POLL_INTERVAL_MS,
  PollerOptions,
  startPoller,
} from '@/lib/poller';
import { NOTIFICATIONS_KEY } from '@/lib/notifications';

interface NotificationsContextValue {
  items: NotificationsStore['items'];
  unread: number;
  watchedIds: number[];
  isWatched: (id: number) => boolean;
  toggleWatch: (contract: EscrowContract) => void;
  markAllRead: () => void;
  clear: () => void;
  announcement: string;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export interface NotificationsProviderProps {
  children: React.ReactNode;
  poller?: Partial<Omit<PollerOptions, 'onEvents' | 'onRemoved'>>;
}

export function NotificationsProvider({ children, poller }: NotificationsProviderProps) {
  const [notifications, setNotifications] = useState<NotificationsStore>({ version: 1, items: [] });
  const [watchStore, setWatchStore] = useState<WatchStore>({ version: 1, items: [] });
  const [announcement, setAnnouncement] = useState('');
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const refresh = useCallback(() => {
    setNotifications(loadNotifications());
    setWatchStore(loadStore());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATCH_STORE_KEY || e.key === NOTIFICATIONS_KEY || e.key === null) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  // Background poller.
  useEffect(() => {
    const stop = startPoller({
      ...poller,
      intervalMs: poller?.intervalMs ?? POLL_INTERVAL_MS,
      fetchContract: poller?.fetchContract ?? ((id) => fetchContractById(id)),
      loadStore: poller?.loadStore ?? loadStore,
      saveStore: poller?.saveStore ?? saveStore,
      onEvents: (id: number, events: WatchEvent[], contract: EscrowContract) => {
        let next = notificationsRef.current;
        for (const event of events) {
          next = appendNotification(next, {
            escrowId: id,
            type: event.type,
            title: event.title,
            message: `${contract.title ? `#${id} ${contract.title}: ` : `#${id}: `}${event.message}`,
          });
        }
        saveNotifications(next);
        notificationsRef.current = next;
        setNotifications(next);
        const last = events[events.length - 1];
        if (last) setAnnouncement(`${last.title}. ${unreadCount(next)} unread.`);
      },
      onRemoved: (id: number) => {
        const next = unwatch(id);
        setWatchStore(next);
        const message = `Escrow #${id} is no longer available and was removed from your watchlist.`;
        const withNotice = appendNotification(notificationsRef.current, {
          escrowId: id,
          type: 'cancelled',
          title: 'Escrow removed',
          message,
        });
        saveNotifications(withNotice);
        notificationsRef.current = withNotice;
        setNotifications(withNotice);
        setAnnouncement(message);
      },
      addVisibilityListener:
        poller?.addVisibilityListener ??
        ((fn) => {
          document.addEventListener('visibilitychange', fn);
          return () => document.removeEventListener('visibilitychange', fn);
        }),
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWatch = useCallback((contract: EscrowContract) => {
    setWatchStore((current) => {
      const watchedNow = current.items.some((i) => i.id === contract.id);
      const next = watchedNow ? unwatch(contract.id) : watch(contract.id, snapshotOf(contract));
      return next;
    });
  }, []);

  const doMarkAllRead = useCallback(() => {
    const next = markAllRead(notificationsRef.current);
    saveNotifications(next);
    notificationsRef.current = next;
    setNotifications(next);
    setAnnouncement('All notifications marked as read.');
  }, []);

  const doClear = useCallback(() => {
    const next = clearNotifications();
    notificationsRef.current = next;
    setNotifications(next);
    setAnnouncement('Notifications cleared.');
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items: notifications.items,
      unread: unreadCount(notifications),
      watchedIds: watchStore.items.map((i) => i.id),
      isWatched: (id: number) => watchStore.items.some((i) => i.id === id),
      toggleWatch,
      markAllRead: doMarkAllRead,
      clear: doClear,
      announcement,
    }),
    [notifications, watchStore, toggleWatch, doMarkAllRead, doClear, announcement],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}

/** Like useNotifications, but returns null when rendered outside a provider. */
export function useOptionalNotifications(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}
