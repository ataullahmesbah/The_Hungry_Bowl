import { Prisma } from '@prisma/client';

type Numeric = number | string | Prisma.Decimal;

export function dec(value: Numeric): Prisma.Decimal {
  return new Prisma.Decimal(value as never);
}

export function num(value: Numeric | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(new Prisma.Decimal(value as never).toString());
}

/** Round half-up to `places` decimals, the convention restaurant bills use. */
export function round(value: Numeric, places = 2): Prisma.Decimal {
  return dec(value).toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP);
}

export interface BillLineInput {
  unitPrice: Numeric;
  quantity: number;
  addOnTotal?: Numeric;
}

export interface BillInput {
  lines: BillLineInput[];
  discountAmount?: Numeric;
  taxPercent?: Numeric;
  serviceChargePercent?: Numeric;
  /** Round the grand total to the nearest whole currency unit. */
  roundTotal?: boolean;
}

export interface BillResult {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  serviceChargeAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  roundingAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

export function lineTotal(line: BillLineInput): Prisma.Decimal {
  const addOns = dec(line.addOnTotal ?? 0);
  return round(dec(line.unitPrice).plus(addOns).times(line.quantity));
}

/**
 * The only place a bill total is ever computed.
 *
 * Client input is never trusted for money: the browser sends item ids and
 * quantities, the server looks up the prices and runs this. Service charge is
 * applied to the discounted subtotal, then tax on top of both — change the
 * order here if a client's local tax rules differ.
 */
export function computeBill(input: BillInput): BillResult {
  const subtotal = input.lines.reduce((acc, line) => acc.plus(lineTotal(line)), dec(0));

  const rawDiscount = dec(input.discountAmount ?? 0);
  const discountAmount = round(rawDiscount.greaterThan(subtotal) ? subtotal : rawDiscount);

  const net = subtotal.minus(discountAmount);

  const serviceChargeAmount = round(net.times(dec(input.serviceChargePercent ?? 0)).dividedBy(100));
  const taxAmount = round(net.plus(serviceChargeAmount).times(dec(input.taxPercent ?? 0)).dividedBy(100));

  const beforeRounding = round(net.plus(serviceChargeAmount).plus(taxAmount));

  let roundingAmount = dec(0);
  let totalAmount = beforeRounding;
  if (input.roundTotal) {
    totalAmount = beforeRounding.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    roundingAmount = round(totalAmount.minus(beforeRounding));
  }

  return { subtotal: round(subtotal), discountAmount, serviceChargeAmount, taxAmount, roundingAmount, totalAmount };
}

export function paymentState(total: Numeric, paid: Numeric): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' {
  const t = dec(total);
  const p = dec(paid);
  if (p.lessThanOrEqualTo(0)) return 'UNPAID';
  if (p.greaterThanOrEqualTo(t)) return 'PAID';
  return 'PARTIALLY_PAID';
}
