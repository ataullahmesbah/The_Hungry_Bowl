'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RealtimeEvent {
  id: number;
  channel: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

type Driver = 'poll' | 'sse';

/**
 * Subscribe to the realtime bus.
 *
 * The transport is deliberately swappable. Polling is the default because it
 * behaves identically on every host; a deployment on a long-running server can
 * switch to SSE by setting REALTIME_DRIVER=sse, and this hook falls back to
 * polling on its own if the stream is unavailable. Nothing above this hook
 * knows or cares which one is in use.
 *
 * Polling pauses while the tab is hidden, so a tablet left on a table
 * overnight does not keep hitting the server.
 */
export function useRealtime(
  channels: string[],
  onEvent: (event: RealtimeEvent) => void,
  options: { driver?: Driver; pollMs?: number; enabled?: boolean } = {},
) {
  const { driver = 'poll', pollMs = 5000, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  const cursor = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const source = useRef<EventSource | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  const channelParam = channels.join(',');

  const poll = useCallback(async () => {
    try {
      const params = new URLSearchParams({ cursor: String(cursor.current), channels: channelParam });
      const response = await fetch(`/api/realtime/events?${params}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        setConnected(false);
        return;
      }
      const body = await response.json();
      const data = body?.data as { cursor: number; events: RealtimeEvent[] } | undefined;
      if (!data) return;

      setConnected(true);
      cursor.current = data.cursor;
      if (data.events.length > 0) {
        setLastEventAt(new Date());
        for (const event of data.events) handler.current(event);
      }
    } catch {
      setConnected(false);
    }
  }, [channelParam]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    function startPolling() {
      if (timer.current) return;
      void poll();
      timer.current = setInterval(() => void poll(), pollMs);
    }

    function stopPolling() {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    }

    function startSse() {
      const params = new URLSearchParams({ cursor: String(cursor.current), channels: channelParam });
      const es = new EventSource(`/api/realtime/stream?${params}`);
      source.current = es;

      es.addEventListener('ready', () => setConnected(true));
      es.addEventListener('message', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as RealtimeEvent;
          cursor.current = data.id;
          setLastEventAt(new Date());
          handler.current(data);
        } catch {
          // ignore a malformed frame rather than tearing down the stream
        }
      });
      es.onerror = () => {
        // The stream is unavailable (serverless timeout, proxy, driver off) —
        // fall back to polling rather than leaving the screen stale.
        es.close();
        source.current = null;
        setConnected(false);
        if (!cancelled) startPolling();
      };
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (source.current) return;
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (driver === 'sse' && typeof EventSource !== 'undefined') startSse();
    else startPolling();

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stopPolling();
      source.current?.close();
      source.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, driver, pollMs, poll, channelParam]);

  return { connected, lastEventAt };
}

/**
 * Audio for the kitchen display.
 *
 * Browsers refuse to play sound until the page has been interacted with: a
 * fresh AudioContext starts "suspended" and every note is silently dropped.
 * That is why a chime tied only to an incoming ticket never plays — the cook
 * has not touched the screen. So we keep ONE context for the page, resume it
 * from a real click (the Sound toggle), and reuse it from then on. Creating a
 * new context per beep would also hit the browser's per-page context limit
 * after a busy service.
 */
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

/**
 * Call this from a click handler before relying on playChime(). Returns false
 * when the browser still will not allow audio, so the UI can say so instead of
 * leaving the kitchen waiting for a beep that never comes.
 */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
}

/** Short two-note beep for a new kitchen ticket, synthesised — no audio file to ship. */
export function playChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.start();
    // The context stays open for the next ticket; only the note is discarded.
    oscillator.stop(ctx.currentTime + 0.36);
  } catch {
    // Audio is a nicety; never let it break the screen.
  }
}
