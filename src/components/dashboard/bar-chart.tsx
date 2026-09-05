'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional second line under the label, e.g. an order count. */
  meta?: string;
}

/**
 * Horizontal magnitude bars.
 *
 * Every bar carries the same hue on purpose. The job here is comparing
 * magnitude, not telling series apart, so spending the identity channel on
 * colour would re-encode what bar length already shows — and a rainbow of
 * categories would be unreadable under colour-vision deficiency. Saffron-600
 * is used rather than saffron-500 because only the darker step clears 3:1
 * against a white card.
 *
 * Values are direct-labelled, so the chart is still readable if colour is lost
 * entirely (print, forced-colors, a monochrome screen).
 */
export function BarList({
  data,
  formatValue,
  emphasisIndex,
  maxRows,
  emptyMessage = 'Nothing to show for this period.',
}: {
  data: BarDatum[];
  formatValue: (value: number) => string;
  /** Highlight one row and recede the rest. */
  emphasisIndex?: number;
  maxRows?: number;
  emptyMessage?: string;
}) {
  const rows = maxRows ? data.slice(0, maxRows) : data;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-espresso-400">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row, index) => {
        const width = Math.max(1.5, (Math.abs(row.value) / max) * 100);
        const receded = emphasisIndex !== undefined && emphasisIndex !== index;
        return (
          <li key={`${row.label}-${index}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-espresso-700">
                {row.label}
                {row.meta ? <span className="ml-2 text-xs text-espresso-400">{row.meta}</span> : null}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-espresso-900">
                {formatValue(row.value)}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-cream-200">
              <div
                className={cn('h-full rounded-full transition-all', receded ? 'bg-espresso-400' : 'bg-saffron-600')}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Vertical columns for a time series — days of the week, hours of the day.
 * Hovering a column reveals its exact value, so the axis stays uncluttered.
 */
export function ColumnChart({
  data,
  formatValue,
  height = 160,
}: {
  data: BarDatum[];
  formatValue: (value: number) => string;
  height?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-espresso-400">Nothing to show for this period.</p>;
  }

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((datum, index) => {
          const pct = (datum.value / max) * 100;
          const active = hovered === index;
          return (
            <div
              key={`${datum.label}-${index}`}
              className="group relative flex flex-1 flex-col justify-end"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
              role="img"
              aria-label={`${datum.label}: ${formatValue(datum.value)}`}
            >
              {active ? (
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-espresso-900 px-2.5 py-1.5 text-xs text-cream-50 shadow-lg">
                  <span className="block font-medium">{formatValue(datum.value)}</span>
                  <span className="block text-espresso-200">{datum.label}</span>
                </div>
              ) : null}
              <div
                className={cn(
                  'w-full rounded-t transition-colors',
                  active ? 'bg-saffron-700' : 'bg-saffron-600',
                )}
                style={{ height: `${Math.max(2, pct)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1">
        {data.map((datum, index) => (
          <span
            key={`${datum.label}-label-${index}`}
            className="flex-1 truncate text-center text-[10px] text-espresso-400"
          >
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}
