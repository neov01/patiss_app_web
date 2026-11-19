import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { calculateCaisseMetrics } from '@/lib/domain/caisse-metrics'
import { callsTo, createSupabaseFake, hasOp, isSingle, type FakeCall } from '@/test/supabase-fake'
import { loadDailyReportData, roleLabel, type DailyReportContext } from './daily-report-data'

const NOW = new Date('2026-11-14T20:14:00Z')

const CTX: DailyReportContext = {
  orgId: 'org-1',
  orgName: 'Pâtisserie Démo',
  currency: 'FCFA',
  openedAt: '2026-11-14T07:02:00.000Z',
  openedBy: 'user-awa',
  closedBy: 'user-koffi',
  now: NOW,
  metrics: {
    ...calculateCaisseMetrics(
      [{ amount: 3000, payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' }],
      []
    ),
  },
  alertItems: [{ name: 'Beurre doux', current_stock: 2, alert_threshold: 5, unit: 'kg' }],
  expenses: { totalDay: 500, countDay: 1 },
}

const TRANSACTIONS = [
  { amount: 1000, created_at: '2026-11-14T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' },
  { amount: 2000, created_at: '2026-11-14T17:30:00Z', payment_method: 'Wave', payment_details: null, label_type: 'VENTE_DIRECTE' },
  { amount: 500, created_at: '2026-11-13T09:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' },
  { amount: 700, created_at: '2026-11-07T12:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' },
]

const isPickupQuery = (call: FakeCall) => call.ops.some(([op, args]) => op === 'gte' && args[0] === 'pickup_date')

function fakeWith(overrides: Record<string, (call: FakeCall) => { data: unknown; error: { message: string } | null }> = {}) {
  return createSupabaseFake({
    transactions: () => ({ data: TRANSACTIONS, error: null }),
    transaction_items: () => ({ data: [{ name: 'Forêt-Noire', quantity: 1, unit_price: 15000, subtotal: 15000 }], error: null }),
    orders: call => isPickupQuery(call)
      ? { data: [
          { pickup_date: '2026-11-15T09:30:00+00:00', total_amount: 20000, deposit_amount: 5000 },
          { pickup_date: '2026-11-15T14:00:00Z', total_amount: 10000, deposit_amount: 12000 },
        ], error: null }
      : { data: [
          { created_by: 'user-awa', is_historical: false, profiles: { full_name: 'Awa', role_slug: 'vendeur' } },
          { created_by: 'user-awa', is_historical: true, profiles: { full_name: 'Awa', role_slug: 'vendeur' } },
          { created_by: 'user-koffi', is_historical: false, profiles: [{ full_name: 'Koffi', role_slug: 'gerant' }] },
        ], error: null },
    profiles: call => isSingle(call)
      ? { data: hasOp(call, 'eq', ['id', 'user-awa']) ? { full_name: 'Awa', role_slug: 'vendeur' } : { full_name: 'Koffi', role_slug: 'gerant' }, error: null }
      : { data: [], error: null },
    ...overrides,
  })
}

describe('roleLabel', () => {
  it('traduit les rôles connus', () => {
    expect(roleLabel('gerant')).toBe('Gérant')
    expect(roleLabel('vendeur')).toBe('Vendeur')
    expect(roleLabel('patissier')).toBe('Pâtissier')
    expect(roleLabel(null)).toBe('Opérateur')
  })
})

describe('loadDailyReportData', () => {
  it('découpe aujourd’hui, hier et le même jour la semaine précédente', async () => {
    const fake = fakeWith()
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.comparisons).toEqual({ yesterday: 500, lastWeek: 700, lastWeekDate: new Date('2026-11-07T20:14:00Z') })
    expect(data.sales).toEqual({ count: 2, revenue: 3000, countYesterday: 1, revenueYesterday: 500 })
    expect(data.hourly?.today[10]).toBe(1000)
    expect(data.hourly?.today[17]).toBe(2000)
    expect(data.hourly?.yesterday[9]).toBe(500)
    expect(data.totalRevenue).toBe(3000)
    expect(data.payments).toEqual([{ method: 'Espèces', amount: 3000, pct: 100 }])
  })

  it('lit les transactions avec les bons filtres', async () => {
    const fake = fakeWith()
    await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    const [tx] = callsTo(fake.calls, 'transactions')
    expect(hasOp(tx, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(tx, 'eq', ['is_historical', false])).toBe(true)
    expect(hasOp(tx, 'gte', ['created_at', '2026-11-07T00:00:00.000Z'])).toBe(true)
    expect(hasOp(tx, 'lte', ['created_at', NOW.toISOString()])).toBe(true)
  })

  it('filtre chaque requête sur l’organisation', async () => {
    const fake = fakeWith()
    await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    for (const call of [...callsTo(fake.calls, 'transactions'), ...callsTo(fake.calls, 'orders')]) {
      expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
    }
    for (const call of callsTo(fake.calls, 'transaction_items')) {
      expect(hasOp(call, 'eq', ['transactions.organization_id', 'org-1'])).toBe(true)
    }
  })

  it('résume les retraits de demain', async () => {
    const fake = fakeWith()
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.tomorrow).toEqual({ count: 2, firstPickupAt: '2026-11-15T09:30:00+00:00', remaining: 15000 })
    const pickup = callsTo(fake.calls, 'orders').find(isPickupQuery)!
    expect(hasOp(pickup, 'gte', ['pickup_date', '2026-11-15T00:00:00.000Z'])).toBe(true)
    expect(hasOp(pickup, 'lt', ['pickup_date', '2026-11-16T00:00:00.000Z'])).toBe(true)
    expect(hasOp(pickup, 'neq', ['status', 'cancelled'])).toBe(true)
  })

  it("masque l'heure du premier retrait quand elle vaut minuit", async () => {
    const fake = fakeWith({
      orders: call => isPickupQuery(call)
        ? { data: [{ pickup_date: '2026-11-15T00:00:00+00:00', total_amount: 1000, deposit_amount: 0 }], error: null }
        : { data: [], error: null },
    })
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.tomorrow?.firstPickupAt).toBeNull()
  })

  it('renseigne la caisse et l’activité de l’équipe', async () => {
    const fake = fakeWith()
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.caisse).toEqual({
      openerName: 'Awa', openerRole: 'Vendeur', openedAt: '2026-11-14T07:02:00.000Z',
      closerName: 'Koffi', closerRole: 'Gérant', closedAt: NOW.toISOString(),
    })
    expect(data.team).toEqual([
      { name: 'Awa', role: 'Vendeur', orders: 1, imports: 1 },
      { name: 'Koffi', role: 'Gérant', orders: 1, imports: 0 },
    ])
    expect(data.stockAlerts).toEqual([{ name: 'Beurre doux', current: 2, threshold: 5, unit: 'kg' }])
  })

  it('masque un bloc en erreur sans faire échouer le rapport', async () => {
    const fake = fakeWith({ transaction_items: () => ({ data: null, error: { message: 'timeout' } }) })
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.topProducts).toBeNull()
    expect(data.comparisons).not.toBeNull()
  })

  it('masque comparaisons, ventes et heures si les transactions sont illisibles', async () => {
    const fake = fakeWith({ transactions: () => ({ data: null, error: { message: 'timeout' } }) })
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.comparisons).toBeNull()
    expect(data.sales).toBeNull()
    expect(data.hourly).toBeNull()
    expect(data.totalRevenue).toBe(3000)
  })
})
