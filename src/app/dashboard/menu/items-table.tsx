'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertCircle, Pencil, Search, Star, Utensils } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { Input, Select, Toggle } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { ApiError, api } from '@/lib/client/api-client';
import { publicPriceLabel } from '@/lib/public/menu';
import type { CurrencyConfig } from '@/lib/format';
import { cldUrl } from '@/lib/cloudinary/url';

interface Item {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isAvailable: boolean;
  unavailableReason: string | null;
  isFeatured: boolean;
  isTodaysSpecial: boolean;
  priceDisplayMode: 'FIXED' | 'RANGE' | 'HIDDEN';
  basePrice: number | null;
  category: { id: string; name: string };
  variants: { id: string; name: string; price: number; isAvailable: boolean }[];
  media: { media: { secureUrl: string } }[];
}

export function MenuItemsTable({
  items,
  categories,
  currency,
  canManage,
  canToggle,
  canReport,
  initialFilters,
}: {
  items: Item[];
  categories: { id: string; name: string }[];
  currency: CurrencyConfig;
  canManage: boolean;
  canToggle: boolean;
  canReport: boolean;
  initialFilters: { q: string; category: string; status: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(items);
  const [filters, setFilters] = useState(initialFilters);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offDialog, setOffDialog] = useState<Item | null>(null);
  const [reason, setReason] = useState('');

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.category && row.category.id !== filters.category) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (q && !row.name.toLowerCase().includes(q) && !row.slug.includes(q)) return false;
      return true;
    });
  }, [rows, filters]);

  async function setAvailability(item: Item, next: boolean, why?: string) {
    setBusyId(item.id);
    // Optimistic: the switch is the whole point of this screen, so it must
    // feel instant on a phone in the middle of service.
    setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, isAvailable: next } : r)));
    try {
      await api.patch(`/api/menu/items/${item.id}/availability`, { isAvailable: next, reason: why ?? null });
      toast.success(`${item.name} is now ${next ? 'available' : 'off the menu'}`);
      router.refresh();
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, isAvailable: !next } : r)));
      toast.error(err instanceof ApiError ? err.message : 'Could not change availability');
    } finally {
      setBusyId(null);
      setOffDialog(null);
      setReason('');
    }
  }

  async function reportStockout(item: Item) {
    setBusyId(item.id);
    try {
      await api.post(`/api/menu/items/${item.id}/report-stockout`, { reason: 'Reported from the menu list' });
      toast.success('Manager notified', `A manager has been asked to switch “${item.name}” off.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the report');
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<Item>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (item) => (
        <div className="flex items-center gap-3">
          {item.media[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cldUrl(item.media[0].media.secureUrl, { width: 80, height: 80 })}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cream-200 text-espresso-300">
              <Utensils className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium text-espresso-900">
              <span className="truncate">{item.name}</span>
              {item.isTodaysSpecial ? <Star className="h-3.5 w-3.5 shrink-0 fill-saffron-400 text-saffron-400" /> : null}
            </p>
            <p className="truncate text-xs text-espresso-400">{item.category.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (item) => {
        const label = publicPriceLabel(item, item.variants, currency);
        return (
          <div>
            <p className="font-medium tabular-nums text-espresso-900">{label ?? <span className="italic text-espresso-400">Hidden</span>}</p>
            {item.variants.length > 1 ? (
              <p className="text-xs text-espresso-400">{item.variants.length} sizes</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <Badge tone={item.status === 'PUBLISHED' ? 'success' : item.status === 'DRAFT' ? 'warning' : 'neutral'}>
          {item.status.toLowerCase()}
        </Badge>
      ),
    },
    {
      key: 'availability',
      header: 'Available today',
      render: (item) =>
        canToggle ? (
          <div className="flex items-center gap-2">
            <Toggle
              checked={item.isAvailable}
              disabled={busyId === item.id}
              label={`Availability for ${item.name}`}
              onChange={(next) => {
                if (next) void setAvailability(item, true);
                else setOffDialog(item);
              }}
            />
            {!item.isAvailable && item.unavailableReason ? (
              <span className="text-xs text-espresso-400" title={item.unavailableReason}>
                {item.unavailableReason.slice(0, 24)}
              </span>
            ) : null}
          </div>
        ) : canReport ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === item.id || !item.isAvailable}
            onClick={() => void reportStockout(item)}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Report run out
          </Button>
        ) : (
          <Badge tone={item.isAvailable ? 'success' : 'danger'}>{item.isAvailable ? 'Available' : 'Off'}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (item) =>
        canManage ? (
          <Link href={`/dashboard/menu/${item.id}`} className="inline-flex">
            <Button size="sm" variant="ghost">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
        ) : null,
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-espresso-100 px-5 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso-400" />
          <Input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search items"
            className="pl-8"
          />
        </div>
        <Select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          className="w-auto"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="w-auto"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        emptyMessage="No menu items match these filters."
      />

      <ConfirmDialog
        open={Boolean(offDialog)}
        title={`Turn “${offDialog?.name}” off?`}
        tone="warning"
        confirmLabel="Turn off"
        pending={busyId === offDialog?.id}
        description={
          <div className="space-y-3">
            <p>
              The item stays on the website but shows as <strong>Unavailable</strong>, and staff will not be able to
              add it to an order until you turn it back on. Nothing is deleted.
            </p>
            <div>
              <label htmlFor="off-reason" className="mb-1 block text-xs font-medium text-espresso-700">
                Reason (optional)
              </label>
              <Input
                id="off-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Out of chicken until the evening delivery"
              />
            </div>
          </div>
        }
        onCancel={() => {
          setOffDialog(null);
          setReason('');
        }}
        onConfirm={() => offDialog && void setAvailability(offDialog, false, reason || undefined)}
      />
    </>
  );
}
