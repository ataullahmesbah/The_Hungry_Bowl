'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/client/api-client';
import { cn } from '@/lib/utils';

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const LEVEL_DOT: Record<NotificationRow['level'], string> = {
  INFO: 'bg-blue-500',
  SUCCESS: 'bg-basil-500',
  WARNING: 'bg-saffron-500',
  CRITICAL: 'bg-chilli-500',
};

export function NotificationBell({ pollMs = 20000 }: { pollMs?: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ unread: number; items: NotificationRow[] }>('/api/notifications?limit=15');
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // A transient failure should not spam the console on every tick.
    }
  }, []);

  useEffect(() => {
    void load();
    // Pause polling while the tab is hidden so a phone left on a table does
    // not keep hitting the server all night.
    function start() {
      if (timer.current) return;
      timer.current = setInterval(() => void load(), pollMs);
    }
    function stop() {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void load();
        start();
      } else {
        stop();
      }
    }
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, pollMs]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: new Date().toISOString() })));
    try {
      await api.patch('/api/notifications', {});
    } catch {
      void load();
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-espresso-600 hover:bg-cream-200"
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-chilli-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-espresso-100 bg-white shadow-lg sm:w-96">
            <div className="flex items-center justify-between border-b border-espresso-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-espresso-900">Notifications</p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-xs font-medium text-saffron-700 hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              ) : null}
            </div>

            <div className="max-h-96 overflow-y-auto scroll-slim">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-espresso-400">Nothing new right now.</p>
              ) : (
                <ul className="divide-y divide-espresso-100">
                  {items.map((item) => {
                    const content = (
                      <div className={cn('flex gap-3 px-4 py-3', !item.readAt && 'bg-saffron-50')}>
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', LEVEL_DOT[item.level])} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-espresso-900">{item.title}</p>
                          {item.body ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-espresso-400">{item.body}</p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-espresso-400">
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                    return (
                      <li key={item.id}>
                        {item.href ? (
                          <Link href={item.href} onClick={() => setOpen(false)} className="block hover:bg-cream-100">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
