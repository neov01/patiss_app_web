import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaisseMetrics } from '@/lib/domain/caisse-metrics'
import {
  hourlyBuckets,
  previousUtcDayKey,
  summarizeSales,
  utcDayKey,
  type DashboardTransaction,
  type TransactionItemInput,
} from '@/lib/domain/dashboard-metrics'
import { reportAppUrl } from './constants'
import { fetchAllRows } from './fetch-all-rows'
import { rankProducts, sumForUtcDay, toPaymentShares } from './report-math'
import type { DailyReportData } from './types'

const DAY_MS = 86_400_000

export type StockAlertRow = { name: string; current_stock: number; alert_threshold: number; unit: string | null }

export type DailyReportContext = {
  orgId: string
  orgName: string
  currency: string
  openedAt: string
  openedBy: string | null
  closedBy: string | null
  now: Date
  metrics: CaisseMetrics
  alertItems: StockAlertRow[]
  expenses: { totalDay: number; countDay: number }
}

type ProfileSummary = { full_name: string | null; role_slug: string | null }
type TeamRow = { created_by: string | null; is_historical: boolean | null; profiles: ProfileSummary | ProfileSummary[] | null }
type PickupRow = { pickup_date: string | null; total_amount: number | null; deposit_amount: number | null }

export function roleLabel(slug: string | null | undefined): string {
  switch (slug) {
    case 'gerant': return 'Gérant'
    case 'vendeur': return 'Vendeur'
    case 'patissier': return 'Pâtissier'
    default: return slug || 'Opérateur'
  }
}

function dayStartIso(date: Date, offsetDays: number): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offsetDays)).toISOString()
}

/** Exécute un chargement optionnel : en cas d'erreur, le bloc correspondant sera masqué. */
async function optional<T>(label: string, orgId: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch {
    console.error(`[daily-report] bloc « ${label} » indisponible`, { orgId })
    return null
  }
}

async function loadTomorrow(admin: SupabaseClient, orgId: string, now: Date): Promise<DailyReportData['tomorrow']> {
  const { data, error } = await admin
    .from('orders')
    .select('pickup_date, total_amount, deposit_amount')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .gte('pickup_date', dayStartIso(now, 1))
    .lt('pickup_date', dayStartIso(now, 2))
    .order('pickup_date', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as PickupRow[]
  const first = rows.find(row => row.pickup_date)?.pickup_date ?? null
  const firstDate = first ? new Date(first) : null
  const hasTime = firstDate !== null && (firstDate.getUTCHours() !== 0 || firstDate.getUTCMinutes() !== 0)
  return {
    count: rows.length,
    firstPickupAt: hasTime ? first : null,
    remaining: rows.reduce((sum, row) => sum + Math.max(0, (Number(row.total_amount) || 0) - (Number(row.deposit_amount) || 0)), 0),
  }
}

async function loadProfile(admin: SupabaseClient, id: string): Promise<{ name: string; role: string } | null> {
  const { data } = await admin.from('profiles').select('full_name, role_slug').eq('id', id).maybeSingle()
  if (!data) return null
  const profile = data as ProfileSummary
  return { name: profile.full_name || 'Utilisateur', role: roleLabel(profile.role_slug) }
}

async function loadPeople(admin: SupabaseClient, ctx: DailyReportContext) {
  const [opener, closer] = await Promise.all([
    ctx.openedBy ? loadProfile(admin, ctx.openedBy).catch(() => null) : Promise.resolve(null),
    ctx.closedBy ? loadProfile(admin, ctx.closedBy).catch(() => null) : Promise.resolve(null),
  ])
  return {
    openerName: opener?.name ?? 'Non spécifié',
    openerRole: opener?.role ?? 'Opérateur',
    closerName: closer?.name ?? (ctx.closedBy ? 'Utilisateur' : 'Automatique'),
    closerRole: closer?.role ?? (ctx.closedBy ? 'Opérateur' : 'Clôture planifiée'),
  }
}

async function loadTeam(admin: SupabaseClient, orgId: string, openedAt: string): Promise<DailyReportData['team']> {
  const rows = await fetchAllRows<TeamRow>((from, to) =>
    admin
      .from('orders')
      .select('created_by, is_historical, profiles!orders_created_by_fkey(full_name, role_slug)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .gte('created_at', openedAt)
      .order('id', { ascending: true })
      .range(from, to))
  const byUser = new Map<string, DailyReportData['team'][number]>()
  for (const row of rows) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const key = row.created_by ?? 'inconnu'
    const entry = byUser.get(key) ?? { name: profile?.full_name || 'Utilisateur inconnu', role: roleLabel(profile?.role_slug), orders: 0, imports: 0 }
    if (row.is_historical) entry.imports += 1
    else entry.orders += 1
    byUser.set(key, entry)
  }
  return [...byUser.values()].sort((a, b) => b.orders + b.imports - (a.orders + a.imports))
}

export async function loadDailyReportData(admin: SupabaseClient, ctx: DailyReportContext): Promise<DailyReportData> {
  const { orgId, now } = ctx
  const nowIso = now.toISOString()
  const todayKey = utcDayKey(now)
  const yesterdayKey = previousUtcDayKey(now)
  const lastWeekDate = new Date(now.getTime() - 7 * DAY_MS)
  const lastWeekKey = utcDayKey(lastWeekDate)

  const [txs, items, tomorrow, people, team] = await Promise.all([
    optional('transactions', orgId, () => fetchAllRows<DashboardTransaction>((from, to) =>
      admin
        .from('transactions')
        .select('amount, created_at, payment_method, payment_details, label_type')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .eq('is_historical', false)
        .gte('created_at', dayStartIso(now, -7))
        .lte('created_at', nowIso)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to))),
    optional('top produits', orgId, () => fetchAllRows<TransactionItemInput>((from, to) =>
      admin
        .from('transaction_items')
        .select('name, quantity, unit_price, subtotal, transactions!inner(created_at, organization_id, deleted_at, is_historical)')
        .eq('transactions.organization_id', orgId)
        .is('transactions.deleted_at', null)
        .eq('transactions.is_historical', false)
        .gte('transactions.created_at', dayStartIso(now, 0))
        .lte('transactions.created_at', nowIso)
        .order('id', { ascending: true })
        .range(from, to))),
    optional('retraits de demain', orgId, () => loadTomorrow(admin, orgId, now)),
    loadPeople(admin, ctx),
    optional('équipe', orgId, () => loadTeam(admin, orgId, ctx.openedAt)),
  ])

  const onDay = (key: string) => (txs ?? []).filter(tx => tx.created_at !== null && utcDayKey(new Date(tx.created_at)) === key)
  const todaySales = summarizeSales(onDay(todayKey))
  const yesterdaySales = summarizeSales(onDay(yesterdayKey))

  return {
    orgName: ctx.orgName,
    currency: ctx.currency,
    reportDate: now,
    appUrl: reportAppUrl(),
    totalRevenue: ctx.metrics.totalRevenue,
    comparisons: txs ? { yesterday: sumForUtcDay(txs, yesterdayKey), lastWeek: sumForUtcDay(txs, lastWeekKey), lastWeekDate } : null,
    sales: txs ? {
      count: todaySales.count,
      revenue: todaySales.revenue,
      countYesterday: yesterdaySales.count,
      revenueYesterday: yesterdaySales.revenue,
    } : null,
    expenses: { total: ctx.expenses.totalDay, count: ctx.expenses.countDay },
    hourly: txs ? {
      today: hourlyBuckets(txs, todayKey).map(bucket => bucket.amount),
      yesterday: hourlyBuckets(txs, yesterdayKey).map(bucket => bucket.amount),
    } : null,
    payments: toPaymentShares(ctx.metrics.paymentBreakdown),
    topProducts: items ? rankProducts(items).slice(0, 3) : null,
    tomorrow,
    stockAlerts: ctx.alertItems.map(item => ({
      name: item.name,
      current: Number(item.current_stock) || 0,
      threshold: Number(item.alert_threshold) || 0,
      unit: item.unit ?? '',
    })),
    pendingTotal: ctx.metrics.totalPending,
    breakdown: {
      ventesDirectes: ctx.metrics.totalVentesDirectes,
      acomptes: ctx.metrics.totalAcomptes,
      soldes: ctx.metrics.totalSoldes,
    },
    caisse: { ...people, openedAt: ctx.openedAt, closedAt: nowIso },
    team: team ?? [],
  }
}
