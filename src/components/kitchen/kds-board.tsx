'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChefHat, Clock, Flame, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useRealtime, playChime, unlockAudio, type RealtimeEvent } from '@/lib/client/use-realtime';
import { api, ApiError } from '@/lib/client/api-client';
import { cn } from '@/lib/utils';

export interface Ticket {
  id: string;
  status: 'NEW' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
  priority: number;
  receivedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  note: string | null;
  items: {
    id: string;
    itemName: string;
    variantName: string | null;
    quantity: number;
    optionsText: string | null;
    note: string | null;
  }[];
  order: {
    id: string;
    orderNumber: string;
    secretCode: string;
    type: string;
    note: string | null;
    guestCount: number;
    table: { name: string } | null;
    session: { code: string } | null;
  };
}

const COLUMNS = [
  { key: 'NEW', label: 'New', tone: 'border-chilli-500' },
  { key: 'ACCEPTED', label: 'Accepted', tone: 'border-blue-400' },
  { key: 'PREPARING', label: 'Preparing', tone: 'border-saffron-400' },
  { key: 'READY', label: 'Ready', tone: 'border-basil-500' },
] as const;

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  NEW: { status: 'ACCEPTED', label: 'Accept' },
  ACCEPTED: { status: 'PREPARING', label: 'Start cooking' },
  PREPARING: { status: 'READY', label: 'Mark ready' },
  READY: { status: 'SERVED', label: 'Served' },
};

/** Minutes after which a waiting ticket turns red. */
const WARN_MINUTES = 12;
const CRITICAL_MINUTES = 20;

export function KdsBoard({
  initialTickets,
  driver,
  pollMs,
  soundEnabled: soundDefault,
  fullscreen = false,
  canAccept,
}: {
  initialTickets: Ticket[];
  driver: 'poll' | 'sse';
  pollMs: number;
  soundEnabled: boolean;
  fullscreen?: boolean;
  canAccept: boolean;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  // Always starts off: a browser will not play audio until the page has been
  // clicked, so the toggle below is what actually enables it. `soundDefault`
  // only tells us whether the restaurant wants it, and drives the reminder.
  const [sound, setSound] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // One shared clock so every timer on the wall ticks together.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const rows = await api.get<Ticket[]>('/api/kitchen/tickets');
      setTickets(rows);
    } catch {
      // The realtime hook already surfaces connection state.
    }
  }, []);

  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === 'order.placed' || event.type === 'order.items_added') {
        if (sound) playChime();
      }
      void refresh();
    },
    [refresh, sound],
  );

  const { connected } = useRealtime(['kitchen', 'orders'], onEvent, { driver, pollMs });

  /**
   * Turning the sound ON is the click browsers need before they will allow any
   * audio at all, so we unlock the context here and immediately play a test
   * beep. Hearing it is the confirmation; silence means the device or the tab
   * is muted, and we say so rather than leaving the kitchen guessing.
   */
  async function toggleSound() {
    if (sound) {
      setSound(false);
      return;
    }
    const ok = await unlockAudio();
    if (!ok) {
      setError('This browser will not play sound here. Check that the tab and the device are not muted, then try again.');
      return;
    }
    setError(null);
    setSound(true);
    playChime();
  }

  async function move(ticket: Ticket, status: string) {
    setBusyId(ticket.id);
    setError(null);
    // Optimistic: a cook tapping "ready" should not wait on a round trip.
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status: status as Ticket['status'] } : t)));
    try {
      await api.patch(`/api/kitchen/tickets/${ticket.id}/status`, { status });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the ticket.');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    const map: Record<string, Ticket[]> = { NEW: [], ACCEPTED: [], PREPARING: [], READY: [] };
    for (const ticket of tickets) {
      if (map[ticket.status]) map[ticket.status]!.push(ticket);
    }
    return map;
  }, [tickets]);

  return (
    <div className={cn(fullscreen && 'kds-dark min-h-screen')}>
      <header
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
          fullscreen ? 'border-b border-espresso-800' : 'mb-4',
        )}
      >
        <div className="flex items-center gap-2.5">
          <ChefHat className={cn('h-5 w-5', fullscreen ? 'text-saffron-400' : 'text-espresso-600')} />
          <h1 className={cn('text-lg font-semibold', fullscreen ? 'text-cream-50' : 'text-espresso-900')}>
            Kitchen display
          </h1>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
              connected
                ? fullscreen
                  ? 'bg-basil-500/20 text-basil-500'
                  : 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700',
            )}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'live' : 'reconnecting'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleSound()}
            title={
              sound
                ? 'New tickets will beep. Click to turn the sound off.'
                : 'Click to turn the sound on — you will hear a test beep.'
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
              fullscreen ? 'bg-espresso-800 text-cream-200 hover:bg-espresso-700' : 'bg-cream-200 text-espresso-700',
            )}
          >
            {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {sound ? 'Sound on' : soundDefault ? 'Turn sound on' : 'Sound off'}
          </button>
          {fullscreen ? (
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen();
              }}
              className="rounded-lg bg-espresso-800 px-3 py-1.5 text-xs font-medium text-cream-200 hover:bg-espresso-700"
            >
              Full screen
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mx-4 mb-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className={cn('grid gap-3 px-4 pb-6', 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4')}>
        {COLUMNS.map((column) => (
          <section key={column.key} className="min-w-0">
            <h2
              className={cn(
                'mb-2 flex items-center justify-between rounded-lg border-l-4 px-3 py-2 text-sm font-semibold',
                column.tone,
                fullscreen ? 'bg-espresso-900 text-cream-100' : 'bg-white text-espresso-900',
              )}
            >
              {column.label}
              <span className="tabular-nums opacity-60">{grouped[column.key]?.length ?? 0}</span>
            </h2>

            <ul className="space-y-2.5">
              {(grouped[column.key] ?? []).map((ticket) => {
                const waited = Math.floor((now - new Date(ticket.receivedAt).getTime()) / 60000);
                const level = waited >= CRITICAL_MINUTES ? 'critical' : waited >= WARN_MINUTES ? 'warn' : 'ok';
                const action = NEXT_ACTION[ticket.status];
                const blocked = ticket.status === 'NEW' && !canAccept;

                return (
                  <li
                    key={ticket.id}
                    className={cn(
                      'rounded-[--radius-card] border-2 p-3 transition-colors',
                      fullscreen ? 'bg-espresso-900' : 'bg-white',
                      level === 'critical'
                        ? 'border-chilli-500 animate-ring'
                        : level === 'warn'
                          ? 'border-saffron-400'
                          : fullscreen
                            ? 'border-espresso-800'
                            : 'border-espresso-100',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn('text-lg font-bold leading-tight', fullscreen ? 'text-cream-50' : 'text-espresso-900')}>
                          #{ticket.order.orderNumber}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 font-mono text-sm font-bold',
                              fullscreen ? 'bg-saffron-500 text-espresso-950' : 'bg-espresso-900 text-saffron-300',
                            )}
                          >
                            {ticket.order.secretCode}
                          </span>
                          <span className={cn('text-sm', fullscreen ? 'text-cream-300' : 'text-espresso-500')}>
                            {ticket.order.table?.name ?? ticket.order.type.toLowerCase().replace('_', '-')}
                          </span>
                        </p>
                      </div>

                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold tabular-nums',
                          level === 'critical'
                            ? 'bg-chilli-500 text-white'
                            : level === 'warn'
                              ? 'bg-saffron-400 text-espresso-950'
                              : fullscreen
                                ? 'bg-espresso-800 text-cream-300'
                                : 'bg-cream-200 text-espresso-600',
                        )}
                      >
                        {level === 'critical' ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {waited}m
                      </span>
                    </div>

                    <ul className={cn('mt-2.5 space-y-1.5 border-t pt-2.5', fullscreen ? 'border-espresso-800' : 'border-espresso-100')}>
                      {ticket.items.map((item) => (
                        <li key={item.id}>
                          <p className={cn('text-sm font-medium', fullscreen ? 'text-cream-100' : 'text-espresso-900')}>
                            <span className="tabular-nums">{item.quantity}×</span> {item.itemName}
                            {item.variantName ? (
                              <span className={fullscreen ? 'text-cream-300' : 'text-espresso-500'}> · {item.variantName}</span>
                            ) : null}
                          </p>
                          {item.optionsText ? (
                            <p className={cn('pl-5 text-xs', fullscreen ? 'text-saffron-300' : 'text-saffron-700')}>
                              {item.optionsText}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>

                    {ticket.order.note ? (
                      <p
                        className={cn(
                          'mt-2 flex items-start gap-1.5 rounded px-2 py-1.5 text-xs',
                          fullscreen ? 'bg-saffron-500/15 text-saffron-200' : 'bg-saffron-50 text-saffron-900',
                        )}
                      >
                        <Flame className="mt-0.5 h-3 w-3 shrink-0" />
                        {ticket.order.note}
                      </p>
                    ) : null}

                    {action ? (
                      <button
                        type="button"
                        disabled={busyId === ticket.id || blocked}
                        onClick={() => void move(ticket, action.status)}
                        className={cn(
                          'mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-40',
                          ticket.status === 'PREPARING'
                            ? 'bg-basil-500 text-white hover:bg-basil-600'
                            : fullscreen
                              ? 'bg-saffron-500 text-espresso-950 hover:bg-saffron-400'
                              : 'bg-espresso-900 text-cream-50 hover:bg-espresso-800',
                        )}
                      >
                        <Check className="h-4 w-4" />
                        {blocked ? 'Manager must accept' : action.label}
                      </button>
                    ) : null}
                  </li>
                );
              })}

              {(grouped[column.key]?.length ?? 0) === 0 ? (
                <li
                  className={cn(
                    'rounded-[--radius-card] border border-dashed px-3 py-8 text-center text-xs',
                    fullscreen ? 'border-espresso-800 text-espresso-400' : 'border-espresso-200 text-espresso-400',
                  )}
                >
                  Nothing here
                </li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
