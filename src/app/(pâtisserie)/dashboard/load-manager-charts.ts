import type { createClient } from '@/lib/supabase/server'
import type { PaymentDetails } from '@/lib/domain/payments'
import {
  buildCumulativeSeries,
  compareWithYesterday,
  hourlyBuckets,
  paymentSlices,
  previousUtcDayKey,
  summarizeSales,
  topProducts,
  transactionsSince,
  utcDayKey,
  wasteSummary,
  type CumulativePoint,
  type DashboardTransaction,
  type HourlyBucket,
  type PaymentSlice,
  type SalesSummary,
  type TopProduct,
  type WasteSummary,
  type YesterdayComparison,
} from '@/lib/domain/dashboard-metrics'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

export type ManagerChartsData = {
  cumulative: CumulativePoint[]
  hourly: HourlyBucket[]
  comparison: YesterdayComparison
  sales: SalesSummary
  paymentSlices: PaymentSlice[]
  topProducts: TopProduct[]
  waste: WasteSummary
  errors: { transactions: boolean; items: boolean; waste: boolean }
}

export async function loadManagerCharts(
  supabase: ServerSupabase,
  organizationId: string,
  startDate: string,
  now: Date
): Promise<ManagerChartsData> {
  const yesterdayKey = previousUtcDayKey(now)
  const since = startDate < yesterdayKey ? startDate : yesterdayKey

  const [txRes, itemsRes, wasteRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, created_at, payment_method, payment_details, label_type')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('is_historical', false)
      .gte('created_at', `${since}T00:00:00`),
    supabase
      .from('transaction_items')
      .select('name, quantity, unit_price, subtotal, transactions!inner(created_at, organization_id, deleted_at, is_historical)')
      .eq('transactions.organization_id', organizationId)
      .is('transactions.deleted_at', null)
      .eq('transactions.is_historical', false)
      .gte('transactions.created_at', `${startDate}T00:00:00`),
    supabase
      .from('inventory_logs')
      .select('quantity_change, ingredients(cost_per_unit)')
      .eq('organization_id', organizationId)
      .eq('reason', 'waste')
      .gte('log_date', `${startDate}T00:00:00`),
  ])

  const allTxs: DashboardTransaction[] = (txRes.data ?? []).map(row => ({
    amount: row.amount,
    created_at: row.created_at,
    payment_method: row.payment_method,
    payment_details: (row.payment_details ?? null) as PaymentDetails | null,
    label_type: row.label_type,
  }))
  const periodTxs = transactionsSince(allTxs, startDate)

  const items = (itemsRes.data ?? []).map(row => ({
    name: row.name,
    quantity: row.quantity,
    unit_price: row.unit_price,
    subtotal: row.subtotal,
  }))

  const wasteLogs = (wasteRes.data ?? []).map(row => {
    const ingredient = Array.isArray(row.ingredients) ? row.ingredients[0] : row.ingredients
    return { quantity_change: row.quantity_change, cost_per_unit: ingredient?.cost_per_unit ?? null }
  })

  return {
    cumulative: buildCumulativeSeries(allTxs, now),
    hourly: hourlyBuckets(allTxs, utcDayKey(now)),
    comparison: compareWithYesterday(allTxs, now),
    sales: summarizeSales(periodTxs),
    paymentSlices: paymentSlices(periodTxs),
    topProducts: topProducts(items),
    waste: wasteSummary(wasteLogs),
    errors: {
      transactions: Boolean(txRes.error),
      items: Boolean(itemsRes.error),
      waste: Boolean(wasteRes.error),
    },
  }
}
