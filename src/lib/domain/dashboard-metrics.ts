import { calculateCaisseMetrics } from './caisse-metrics'
import { PAYMENT_METHODS, type CanonicalPaymentMethod, type PaymentDetails } from './payments'

export type DashboardTransaction = {
  amount: number | null
  created_at: string | null
  payment_method: string | null
  payment_details?: PaymentDetails | null
  label_type: string | null
}

export type HourlyBucket = { hour: number; count: number; amount: number }
export type CumulativePoint = { hour: number; today: number | null; yesterday: number }
export type YesterdayComparison = { today: number; yesterday: number; deltaPct: number | null }
export type SalesSummary = { count: number; revenue: number }
export type PaymentSlice = { method: CanonicalPaymentMethod; amount: number; pct: number }
export type TransactionItemInput = { name: string | null; quantity: number | null; unit_price: number | null; subtotal: number | null }
export type TopProduct = { name: string; quantity: number; amount: number }
export type WasteLogInput = { quantity_change: number | null; cost_per_unit: number | null }
export type WasteSummary = { value: number; count: number; missingCost: number }

const DAY_MS = 24 * 60 * 60 * 1000

function toNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function previousUtcDayKey(date: Date): string {
  return utcDayKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1)))
}

export function transactionsSince(txs: DashboardTransaction[], startDay: string): DashboardTransaction[] {
  return txs.filter(tx => {
    const d = parseDate(tx.created_at)
    return d !== null && utcDayKey(d) >= startDay
  })
}

export function hourlyBuckets(txs: DashboardTransaction[], dayKey: string): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, amount: 0 }))
  for (const tx of txs) {
    const d = parseDate(tx.created_at)
    if (!d || utcDayKey(d) !== dayKey) continue
    const bucket = buckets[d.getUTCHours()]
    bucket.count += 1
    bucket.amount += toNumber(tx.amount)
  }
  return buckets
}

export function buildCumulativeSeries(
  txs: DashboardTransaction[],
  now: Date,
  defaultRange: { from: number; to: number } = { from: 6, to: 22 }
): CumulativePoint[] {
  const today = hourlyBuckets(txs, utcDayKey(now))
  const yesterday = hourlyBuckets(txs, previousUtcDayKey(now))
  const activeHours = [...today, ...yesterday].filter(b => b.count > 0).map(b => b.hour)
  const from = Math.min(defaultRange.from, ...activeHours)
  const to = Math.max(defaultRange.to, ...activeHours)
  const currentHour = now.getUTCHours()

  const points: CumulativePoint[] = []
  let cumulToday = 0
  let cumulYesterday = 0
  for (let hour = 0; hour <= to; hour++) {
    cumulToday += today[hour].amount
    cumulYesterday += yesterday[hour].amount
    if (hour >= from) {
      points.push({ hour, today: hour <= currentHour ? cumulToday : null, yesterday: cumulYesterday })
    }
  }
  return points
}

export function compareWithYesterday(txs: DashboardTransaction[], now: Date): YesterdayComparison {
  const todayKey = utcDayKey(now)
  const yesterdayKey = previousUtcDayKey(now)
  const cutoff = now.getTime() - DAY_MS
  let today = 0
  let yesterday = 0
  for (const tx of txs) {
    const d = parseDate(tx.created_at)
    if (!d) continue
    const key = utcDayKey(d)
    if (key === todayKey && d.getTime() <= now.getTime()) today += toNumber(tx.amount)
    else if (key === yesterdayKey && d.getTime() <= cutoff) yesterday += toNumber(tx.amount)
  }
  const deltaPct = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null
  return { today, yesterday, deltaPct }
}

export function summarizeSales(txs: DashboardTransaction[]): SalesSummary {
  let count = 0
  let revenue = 0
  for (const tx of txs) {
    const amount = toNumber(tx.amount)
    revenue += amount
    if (amount > 0) count += 1
  }
  return { count, revenue }
}

export function paymentSlices(txs: DashboardTransaction[]): PaymentSlice[] {
  const { paymentBreakdown } = calculateCaisseMetrics(
    txs.map(tx => ({
      amount: tx.amount,
      payment_method: tx.payment_method,
      payment_details: tx.payment_details ?? null,
      label_type: tx.label_type,
    })),
    []
  )
  const positive = PAYMENT_METHODS
    .map(method => ({ method, amount: paymentBreakdown[method] }))
    .filter(slice => slice.amount > 0)
  const total = positive.reduce((sum, slice) => sum + slice.amount, 0)
  return positive
    .map(slice => ({ ...slice, pct: total > 0 ? (slice.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export function topProducts(items: TransactionItemInput[], limit = 5): TopProduct[] {
  const byName = new Map<string, TopProduct>()
  for (const item of items) {
    const name = item.name?.trim() || 'Article'
    const quantity = toNumber(item.quantity)
    const amount = item.subtotal !== null && item.subtotal !== undefined
      ? toNumber(item.subtotal)
      : quantity * toNumber(item.unit_price)
    const current = byName.get(name) ?? { name, quantity: 0, amount: 0 }
    current.quantity += quantity
    current.amount += amount
    byName.set(name, current)
  }
  return [...byName.values()]
    .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount)
    .slice(0, limit)
}

export function wasteSummary(logs: WasteLogInput[]): WasteSummary {
  let value = 0
  let missingCost = 0
  for (const log of logs) {
    const cost = toNumber(log.cost_per_unit)
    if (cost <= 0) {
      missingCost += 1
      continue
    }
    value += Math.abs(toNumber(log.quantity_change)) * cost
  }
  return { value, count: logs.length, missingCost }
}
