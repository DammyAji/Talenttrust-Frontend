'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useNotifications, useOptionalNotifications } from '@/components/NotificationsProvider';
import type { NotificationItem } from '@/lib/notifications';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

/** Renders nothing when there is no NotificationsProvider (e.g. isolated component tests). */
export function NotificationBell() {
  return useOptionalNotifications() ? <NotificationBellPanel /> : null;
}

function NotificationBellPanel() {
  const { items, unread, markAllRead, clear, announcement } = useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="bell">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-secondary btn-sm bell-button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="bell-icon">
          &#128276;
        </span>
        {unread > 0 && (
          <span className="bell-badge" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      {open && (
        <div className="bell-panel" id={panelId} ref={panelRef} role="dialog" aria-label="Notifications">
          <div className="bell-panel-head">
            <strong>Notifications</strong>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead} disabled={unread === 0}>
                Mark all read
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clear} disabled={items.length === 0}>
                Clear
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="bell-empty">
              <p style={{ margin: '0 0 6px' }}>No notifications yet.</p>
              <p className="small muted" style={{ margin: 0 }}>
                Watch an escrow from the <Link href="/contracts">Escrows dashboard</Link> to be alerted when it is funded,
                a milestone is released, or a dispute is opened.
              </p>
            </div>
          ) : (
            <ul className="bell-list">
              {items.map((item: NotificationItem) => (
                <li key={item.id} className={item.read ? 'bell-item' : 'bell-item bell-item-unread'}>
                  <Link href="/contracts">
                    <span className="bell-item-title">
                      {item.title}
                      {!item.read && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="small muted">{item.message}</span>
                    <time className="small muted" dateTime={new Date(item.createdAt).toISOString()}>
                      {timeAgo(item.createdAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
