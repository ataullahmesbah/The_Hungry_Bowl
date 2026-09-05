'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  severity: string;
  userEmail: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

export function AuditTable({
  entries,
  entities,
  timezone,
  locale,
}: {
  entries: Entry[];
  entities: { entity: string; count: number }[];
  timezone: string;
  locale: string;
}) {
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');
  const [severity, setSeverity] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entity && entry.entity !== entity) return false;
      if (severity && entry.severity !== severity) return false;
      if (!q) return true;
      return (
        entry.action.toLowerCase().includes(q) ||
        entry.entity.toLowerCase().includes(q) ||
        entry.userEmail?.toLowerCase().includes(q) ||
        entry.user?.name.toLowerCase().includes(q)
      );
    });
  }, [entries, search, entity, severity]);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-espresso-100 px-5 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Action, record or person" className="pl-8" />
        </div>
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="w-auto" aria-label="Filter by record type">
          <option value="">All records</option>
          {entities.map((e) => (
            <option key={e.entity} value={e.entity}>
              {e.entity} ({e.count})
            </option>
          ))}
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-auto" aria-label="Filter by importance">
          <option value="">Any importance</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-espresso-400">Nothing matches these filters.</p>
      ) : (
        <ul className="divide-y divide-espresso-100">
          {filtered.map((entry) => {
            const open = expanded === entry.id;
            const hasDetail = entry.before != null || entry.after != null;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : entry.id)}
                  disabled={!hasDetail}
                  className={cn(
                    'flex w-full items-start gap-3 px-5 py-3 text-left',
                    hasDetail && 'hover:bg-cream-50',
                  )}
                >
                  <span className="mt-0.5 text-espresso-300">
                    {hasDetail ? (
                      open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )
                    ) : (
                      <span className="block h-4 w-4" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-espresso-900">{entry.action}</span>
                      <Badge
                        tone={
                          entry.severity === 'HIGH' ? 'danger' : entry.severity === 'MEDIUM' ? 'warning' : 'neutral'
                        }
                      >
                        {entry.severity.toLowerCase()}
                      </Badge>
                      <Badge tone="neutral">{entry.entity}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-espresso-400">
                      {entry.user?.name ?? entry.userEmail ?? 'system'} ·{' '}
                      {formatDateTime(entry.createdAt, timezone, locale)}
                    </span>
                  </span>
                </button>

                {open && hasDetail ? (
                  <div className="grid gap-3 border-t border-espresso-100 bg-cream-50 px-5 py-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-espresso-400">Before</p>
                      <pre className="overflow-x-auto rounded bg-white p-3 text-[11px] leading-relaxed text-espresso-700 scroll-slim">
                        {entry.before ? JSON.stringify(entry.before, null, 2) : '—'}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-espresso-400">After</p>
                      <pre className="overflow-x-auto rounded bg-white p-3 text-[11px] leading-relaxed text-espresso-700 scroll-slim">
                        {entry.after ? JSON.stringify(entry.after, null, 2) : '—'}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
