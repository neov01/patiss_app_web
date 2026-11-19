// src/lib/reports/monthly-report-data.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateCaisseMetrics } from '@/lib/domain/caisse-metrics'
import { summarizeSales, type DashboardTransaction, type TransactionItemInput } from '@/lib/domain/dashboard-metrics'
import { reportAppUrl } from './constants'
import { fetchAllRows, type PageResult } from './fetch-all-rows'
import { buildMonthlyInsights, type InsightInput } from './report-insights'
import {
  dailyTotals,
  monthBounds,
  rankProducts,
  shiftMonth,
  sumAmounts,
  toPaymentShares,
  weekdayAverages,
  type MonthBounds,
} from './report-math'
import type { MonthlyReportData } from './types'

export type OrgSummary = { id: string; name: string | null; currency_symbol: string | null }
export type OrderRow = { id: string; customer_id: string | null; customer_name: string | null; total_amount: number | null }
type TxRow = DashboardTransaction & { is_historical: boolean | null }

const TX_COLUMNS = 'amount, created_at, payment_method, payment_details, label_type, is_historical'

export function summarizeCustomers(orders: OrderRow[], newCount: number): MonthlyReportData['customers'] {
  const byCustomer = new Map<string, { name: string; orders: number; amount: number }>()
  for (const order of orders) {
    if (!order.customer_id) continue
    const entry = byCustomer.get(order.customer_id) ?? { name: order.customer_name?.trim() || 'Client', orders: 0, amount: 0 }
    entry.orders += 1
    entry.amount += Number(order.total_amount) || 0
    byCustomer.set(order.customer_id, entry)
  }
  const all = [...byCustomer.values()]
  return {
    newCount,
    returningCount: all.filter(customer => customer.orders >= 2).length,
    top: all.sort((a, b) => b.amount - a.amount).slice(0, 5),
  }
}

/**
 * Données du récap mensuel d'une organisation. Les transactions historiques (imports papier)
 * sont comprises : elles portent leur date réelle de paiement. null si aucune transaction.
 */
export async function loadMonthlyReportData(
  admin: SupabaseClient,
  org: OrgSummary,
  monthKey: string
): Promise<MonthlyReportData | null> {
  const month = monthBounds(monthKey)
  const previous = monthBounds(shiftMonth(monthKey, -1))
  const lastYear = monthBounds(shiftMonth(monthKey, -12))

  const transactions = <T>(bounds: MonthBounds, columns: string) => fetchAllRows<T>((from, to) =>
    admin
      .from('transactions')
      .select(columns)
      .eq('organization_id', org.id)
      .is('deleted_at', null)
      .gte('created_at', bounds.start)
      .lt('created_at', bounds.end)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<T>>)

  const expenses = (bounds: MonthBounds) => fetchAllRows<{ amount: number | null }>((from, to) =>
    admin
      .from('expenses')
      .select('amount')
      .eq('organization_id', org.id)
      .eq('is_cancelled', false)
      .gte('created_at', bounds.start)
      .lt('created_at', bounds.end)
      .order('id', { ascending: true })
      .range(from, to))

  const orders = (bounds: MonthBounds) => fetchAllRows<OrderRow>((from, to) =>
    admin
      .from('orders')
      .select('id, customer_id, customer_name, total_amount')
      .eq('organization_id', org.id)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('created_at', bounds.start)
      .lt('created_at', bounds.end)
      .order('id', { ascending: true })
      .range(from, to))

  const txs = await transactions<TxRow>(month, TX_COLUMNS)
  if (txs.length === 0) return null

  const [prevTxs, lastYearTxs, items, monthExpenses, prevExpenses, monthOrders, prevOrders, newCustomers] = await Promise.all([
    transactions<TxRow>(previous, TX_COLUMNS),
    transactions<{ amount: number | null }>(lastYear, 'amount'),
    fetchAllRows<TransactionItemInput>((from, to) =>
      admin
        .from('transaction_items')
        .select('name, quantity, unit_price, subtotal, transactions!inner(created_at, organization_id, deleted_at)')
        .eq('transactions.organization_id', org.id)
        .is('transactions.deleted_at', null)
        .gte('transactions.created_at', month.start)
        .lt('transactions.created_at', month.end)
        .order('id', { ascending: true })
        .range(from, to)),
    expenses(month),
    expenses(previous),
    orders(month),
    orders(previous),
    (async () => {
      const { count, error } = await admin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .gte('created_at', month.start)
        .lt('created_at', month.end)
      if (error) throw new Error(error.message)
      return count ?? 0
    })(),
  ])

  const days = dailyTotals(txs, monthKey)
  const ranking = rankProducts(items)
  const base: InsightInput = {
    orgName: org.name ?? 'Votre pâtisserie',
    currency: org.currency_symbol || 'FCFA',
    appUrl: reportAppUrl(),
    month: monthKey,
    revenue: sumAmounts(txs),
    historicalRevenue: sumAmounts(txs.filter(tx => tx.is_historical === true)),
    revenuePrev: sumAmounts(prevTxs),
    revenueLastYear: sumAmounts(lastYearTxs),
    sales: { count: summarizeSales(txs).count, countPrev: summarizeSales(prevTxs).count },
    orders: { count: monthOrders.length, countPrev: prevOrders.length },
    expenses: { total: sumAmounts(monthExpenses), totalPrev: sumAmounts(prevExpenses) },
    days,
    openDays: days.filter(day => day.amount > 0).length,
    weekdayAverages: weekdayAverages(days),
    payments: toPaymentShares(calculateCaisseMetrics(txs, []).paymentBreakdown),
    topProducts: ranking.slice(0, 10),
    flopProducts: ranking.length >= 13
      ? [...ranking].sort((a, b) => a.quantity - b.quantity || a.amount - b.amount).slice(0, 3)
      : [],
    lowSellerCount: ranking.filter(product => product.quantity < 10).length,
    customers: summarizeCustomers(monthOrders, newCustomers),
  }
  return { ...base, insights: buildMonthlyInsights(base) }
}
