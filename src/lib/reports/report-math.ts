// src/lib/reports/report-math.ts
import { topProducts, utcDayKey, type TransactionItemInput } from '@/lib/domain/dashboard-metrics'
import { PAYMENT_METHODS, type PaymentBreakdown } from '@/lib/domain/payments'
import type { DayTotal, PaymentShare, RankedProduct } from './types'

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

type Amount = { amount: number | null }
type DatedAmount = Amount & { created_at: string | null }

function toNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Variation en % arrondie à l'entier ; null quand la référence est absente ou nulle. */
export function variationPct(current: number, reference: number | null | undefined): number | null {
  if (reference === null || reference === undefined || reference === 0) return null
  return Math.round(((current - reference) / reference) * 100)
}

/** Pourcentages entiers dont la somme fait exactement 100 (méthode du plus fort reste). */
export function largestRemainderPercents(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map(v => (v / total) * 100)
  const result = raw.map(r => Math.floor(r))
  let remaining = 100 - result.reduce((sum, v) => sum + v, 0)
  const order = raw
    .map((r, i) => ({ i, fraction: r - result[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  for (const { i } of order) {
    if (remaining <= 0) break
    result[i] += 1
    remaining -= 1
  }
  return result
}

export function toPaymentShares(breakdown: PaymentBreakdown): PaymentShare[] {
  const positive = PAYMENT_METHODS
    .map(method => ({ method, amount: toNumber(breakdown[method]) }))
    .filter(share => share.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const pcts = largestRemainderPercents(positive.map(share => share.amount))
  return positive.map((share, i) => ({ ...share, pct: pcts[i] }))
}

export type MonthBounds = { key: string; start: string; end: string; daysInMonth: number }

export function monthBounds(monthKey: string): MonthBounds {
  const match = MONTH_KEY.exec(monthKey)
  if (!match) throw new Error(`Mois invalide : ${monthKey} (format attendu AAAA-MM)`)
  const year = Number(match[1])
  const month = Number(match[2])
  return {
    key: monthKey,
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, month, 1)).toISOString(),
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  }
}

export function shiftMonth(monthKey: string, delta: number): string {
  const start = new Date(monthBounds(monthKey).start)
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1)).toISOString().slice(0, 7)
}

export function previousMonthKey(now: Date): string {
  return shiftMonth(now.toISOString().slice(0, 7), -1)
}

/** 0 = lundi … 6 = dimanche (jour UTC). */
export function isoWeekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

export function sumAmounts(rows: Amount[]): number {
  return rows.reduce((sum, row) => sum + toNumber(row.amount), 0)
}

export function sumForUtcDay(rows: DatedAmount[], dayKey: string): number {
  return sumAmounts(rows.filter(row => row.created_at !== null && utcDayKey(new Date(row.created_at)) === dayKey))
}

export function dailyTotals(rows: DatedAmount[], monthKey: string): DayTotal[] {
  const { start, daysInMonth } = monthBounds(monthKey)
  const first = new Date(start)
  const days: DayTotal[] = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    weekday: isoWeekdayIndex(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))),
    amount: 0,
  }))
  for (const row of rows) {
    if (!row.created_at) continue
    const date = new Date(row.created_at)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== monthKey) continue
    days[date.getUTCDate() - 1].amount += toNumber(row.amount)
  }
  return days
}

/** CA moyen par jour de la semaine, calculé sur les seuls jours ouverts (CA > 0). */
export function weekdayAverages(days: DayTotal[]): (number | null)[] {
  const sums = new Array<number>(7).fill(0)
  const counts = new Array<number>(7).fill(0)
  for (const day of days) {
    if (day.amount <= 0) continue
    sums[day.weekday] += day.amount
    counts[day.weekday] += 1
  }
  return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : null))
}

export function rankProducts(items: TransactionItemInput[]): RankedProduct[] {
  return topProducts(items, Number.MAX_SAFE_INTEGER)
    .sort((a, b) => b.amount - a.amount || b.quantity - a.quantity)
}
