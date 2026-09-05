import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dec } from '@/lib/money';

/**
 * Daily stock ledger — the movement of every item, per location.
 *
 * The point of this report is auditability. Anyone checking the books needs to
 * answer one question per item per store: "you started with X, this much came
 * in, this much went out — does the closing figure agree with what is on the
 * shelf?" So each location is reported SEPARATELY: a warehouse and a kitchen
 * store are different physical places and merging them hides exactly the
 * discrepancy an audit is looking for.
 *
 * Opening is not stored anywhere; it is derived. The StockMovement table is
 * append-only, so the balance at any past instant can be reconstructed by
 * winding the current balance backwards through the movements since then —
 * which also means no one can quietly change history to make a day balance.
 */

export interface LedgerRow {
  itemId: string;
  itemName: string;
  unit: string;
  opening: number;
  /** Deliveries received from suppliers. */
  purchaseIn: number;
  /** Arrived from another store of ours. */
  transferIn: number;
  /** Came back from a store that did not use it. */
  returnIn: number;
  /** Stock count / opening entries that raised the figure. */
  adjustmentIn: number;
  /** Sent to another store of ours. */
  transferOut: number;
  /** Used up cooking (recipes on completed orders, or recorded by hand). */
  consumption: number;
  /** Spoiled, dropped, burnt, expired. */
  wastage: number;
  /** Sent back to a supplier or another store. */
  returnOut: number;
  /** Stock count entries that lowered the figure. */
  adjustmentOut: number;
  totalIn: number;
  totalOut: number;
  closing: number;
  /** Closing valued at the item's current moving-average cost. */
  closingValue: number;
  unitCost: number;
}

export interface LedgerLocation {
  warehouseId: string;
  warehouseName: string;
  kind: string;
  rows: LedgerRow[];
  totals: { in: number; out: number; closingValue: number };
}

const n = (v: Prisma.Decimal | number | string | null | undefined) => Number(dec(v ?? 0));
const r3 = (v: number) => Number(v.toFixed(3));
const r2 = (v: number) => Number(v.toFixed(2));

interface Bucket {
  purchaseIn: number;
  transferIn: number;
  returnIn: number;
  adjustmentIn: number;
  transferOut: number;
  consumption: number;
  wastage: number;
  returnOut: number;
  adjustmentOut: number;
  /** Net change after the range end, used to wind the current balance back. */
  netAfter: number;
}

const emptyBucket = (): Bucket => ({
  purchaseIn: 0,
  transferIn: 0,
  returnIn: 0,
  adjustmentIn: 0,
  transferOut: 0,
  consumption: 0,
  wastage: 0,
  returnOut: 0,
  adjustmentOut: 0,
  netAfter: 0,
});

export async function stockLedger(
  range: { from: Date; to: Date },
  options: { warehouseId?: string | null } = {},
): Promise<LedgerLocation[]> {
  const [warehouses, movements, balances] = await Promise.all([
    prisma.warehouse.findMany({
      where: options.warehouseId ? { id: options.warehouseId } : {},
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true },
    }),
    // Everything from the start of the range onwards: inside the range builds
    // the report, after it winds today's balance back to the closing figure.
    prisma.stockMovement.findMany({
      where: { createdAt: { gte: range.from } },
      orderBy: { createdAt: 'asc' },
      select: {
        type: true,
        itemId: true,
        fromWarehouseId: true,
        toWarehouseId: true,
        quantity: true,
        createdAt: true,
      },
    }),
    prisma.stockBalance.findMany({
      select: {
        itemId: true,
        warehouseId: true,
        quantity: true,
        item: {
          select: {
            id: true,
            name: true,
            avgUnitCost: true,
            deletedAt: true,
            unit: { select: { code: true } },
          },
        },
      },
    }),
  ]);

  const wanted = new Set(warehouses.map((w) => w.id));

  // key: `${warehouseId}::${itemId}`
  const buckets = new Map<string, Bucket>();
  const itemMeta = new Map<string, { name: string; unit: string; unitCost: number }>();

  for (const b of balances) {
    if (b.item.deletedAt) continue;
    itemMeta.set(b.itemId, {
      name: b.item.name,
      unit: b.item.unit.code,
      unitCost: n(b.item.avgUnitCost),
    });
  }

  function bucketFor(warehouseId: string, itemId: string): Bucket {
    const key = `${warehouseId}::${itemId}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      buckets.set(key, bucket);
    }
    return bucket;
  }

  const itemsNeedingMeta = new Set<string>();

  for (const m of movements) {
    const qty = n(m.quantity);
    const inRange = m.createdAt <= range.to;

    if (m.toWarehouseId && wanted.has(m.toWarehouseId)) {
      const bucket = bucketFor(m.toWarehouseId, m.itemId);
      if (!inRange) {
        bucket.netAfter += qty;
      } else {
        itemsNeedingMeta.add(m.itemId);
        switch (m.type) {
          case 'PURCHASE_RECEIVE':
            bucket.purchaseIn += qty;
            break;
          case 'TRANSFER':
            bucket.transferIn += qty;
            break;
          case 'RETURN':
            bucket.returnIn += qty;
            break;
          default:
            // ADJUSTMENT and OPENING both raise the figure from nowhere.
            bucket.adjustmentIn += qty;
        }
      }
    }

    if (m.fromWarehouseId && wanted.has(m.fromWarehouseId)) {
      const bucket = bucketFor(m.fromWarehouseId, m.itemId);
      if (!inRange) {
        bucket.netAfter -= qty;
      } else {
        itemsNeedingMeta.add(m.itemId);
        switch (m.type) {
          case 'TRANSFER':
            bucket.transferOut += qty;
            break;
          case 'CONSUMPTION':
            bucket.consumption += qty;
            break;
          case 'WASTAGE':
            bucket.wastage += qty;
            break;
          case 'RETURN':
            bucket.returnOut += qty;
            break;
          default:
            bucket.adjustmentOut += qty;
        }
      }
    }
  }

  // Any item that moved but has no balance row (fully consumed and cleaned up)
  // still needs a name to show in the report.
  const missing = [...itemsNeedingMeta].filter((id) => !itemMeta.has(id));
  if (missing.length > 0) {
    const extra = await prisma.inventoryItem.findMany({
      where: { id: { in: missing } },
      select: { id: true, name: true, avgUnitCost: true, unit: { select: { code: true } } },
    });
    for (const item of extra) {
      itemMeta.set(item.id, { name: item.name, unit: item.unit.code, unitCost: n(item.avgUnitCost) });
    }
  }

  const currentBalance = new Map<string, number>();
  for (const b of balances) {
    currentBalance.set(`${b.warehouseId}::${b.itemId}`, n(b.quantity));
  }

  return warehouses.map((warehouse) => {
    const rows: LedgerRow[] = [];

    // Every item that either moved here in the range or still sits here.
    const itemIds = new Set<string>();
    for (const key of buckets.keys()) {
      const [warehouseId, itemId] = key.split('::');
      if (warehouseId === warehouse.id && itemId) itemIds.add(itemId);
    }
    for (const b of balances) {
      if (b.warehouseId === warehouse.id && n(b.quantity) !== 0 && !b.item.deletedAt) itemIds.add(b.itemId);
    }

    for (const itemId of itemIds) {
      const meta = itemMeta.get(itemId);
      if (!meta) continue;
      const bucket = buckets.get(`${warehouse.id}::${itemId}`) ?? emptyBucket();

      const totalIn = bucket.purchaseIn + bucket.transferIn + bucket.returnIn + bucket.adjustmentIn;
      const totalOut =
        bucket.transferOut + bucket.consumption + bucket.wastage + bucket.returnOut + bucket.adjustmentOut;

      const now = currentBalance.get(`${warehouse.id}::${itemId}`) ?? 0;
      const closing = now - bucket.netAfter;
      const opening = closing - (totalIn - totalOut);

      // Nothing happened and nothing is here — not worth a line.
      if (totalIn === 0 && totalOut === 0 && closing === 0 && opening === 0) continue;

      rows.push({
        itemId,
        itemName: meta.name,
        unit: meta.unit,
        unitCost: r2(meta.unitCost),
        opening: r3(opening),
        purchaseIn: r3(bucket.purchaseIn),
        transferIn: r3(bucket.transferIn),
        returnIn: r3(bucket.returnIn),
        adjustmentIn: r3(bucket.adjustmentIn),
        transferOut: r3(bucket.transferOut),
        consumption: r3(bucket.consumption),
        wastage: r3(bucket.wastage),
        returnOut: r3(bucket.returnOut),
        adjustmentOut: r3(bucket.adjustmentOut),
        totalIn: r3(totalIn),
        totalOut: r3(totalOut),
        closing: r3(closing),
        closingValue: r2(closing * meta.unitCost),
      });
    }

    rows.sort((a, b) => a.itemName.localeCompare(b.itemName));

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      kind: warehouse.kind,
      rows,
      totals: {
        in: r3(rows.reduce((sum, row) => sum + row.totalIn, 0)),
        out: r3(rows.reduce((sum, row) => sum + row.totalOut, 0)),
        closingValue: r2(rows.reduce((sum, row) => sum + row.closingValue, 0)),
      },
    };
  });
}
