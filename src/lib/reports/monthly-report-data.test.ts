// src/lib/reports/monthly-report-data.test.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { callsTo, createSupabaseFake, hasOp, opArg, type FakeCall } from '@/test/supabase-fake'
import { loadMonthlyReportData, summarizeCustomers } from './monthly-report-data'

const ORG = { id: 'org-1', name: 'Pâtisserie Démo', currency_symbol: 'FCFA' }
const OCT = '2026-10-01T00:00:00.000Z'
const SEP = '2026-09-01T00:00:00.000Z'

const monthOf = (call: FakeCall, column: string) => opArg(call, 'gte', column)

const ITEMS = Array.from({ length: 14 }, (_, i) => ({ name: `Produit ${i + 1}`, quantity: i + 1, unit_price: 1000, subtotal: (i + 1) * 1000 }))

function fake(overrides: Record<string, (call: FakeCall) => { data: unknown; error: { message: string } | null; count?: number }> = {}) {
  return createSupabaseFake({
    transactions: call => {
      const start = monthOf(call, 'created_at')
      if (start === OCT) return { data: [
        { amount: 500_000, created_at: '2026-10-03T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false },
        { amount: 200_000, created_at: '2026-10-05T10:00:00Z', payment_method: 'Wave', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false },
        { amount: 100_000, created_at: '2026-10-06T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'SOLDE', is_historical: true },
      ], error: null }
      if (start === SEP) return { data: [
        { amount: 400_000, created_at: '2026-09-10T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false },
      ], error: null }
      return { data: [], error: null }
    },
    transaction_items: () => ({ data: ITEMS, error: null }),
    expenses: call => ({ data: monthOf(call, 'created_at') === OCT ? [{ amount: 50_000 }] : [{ amount: 40_000 }], error: null }),
    orders: call => ({
      data: monthOf(call, 'created_at') === OCT ? [
        { id: 'o1', customer_id: 'c1', customer_name: 'Mme Kouassi', total_amount: 30_000 },
        { id: 'o2', customer_id: 'c1', customer_name: 'Mme Kouassi', total_amount: 20_000 },
        { id: 'o3', customer_id: 'c2', customer_name: 'M. Traoré', total_amount: 10_000 },
        { id: 'o4', customer_id: null, customer_name: 'Client Vitrine', total_amount: 5_000 },
      ] : [],
      error: null,
    }),
    customers: () => ({ data: null, error: null, count: 7 }),
    ...overrides,
  })
}

describe('summarizeCustomers', () => {
  it('compte les clients revenus et classe le top par montant', () => {
    const result = summarizeCustomers([
      { id: 'a', customer_id: 'c1', customer_name: 'A', total_amount: 10 },
      { id: 'b', customer_id: 'c1', customer_name: 'A', total_amount: 10 },
      { id: 'c', customer_id: 'c2', customer_name: 'B', total_amount: 50 },
      { id: 'd', customer_id: null, customer_name: 'Vitrine', total_amount: 99 },
    ], 3)
    expect(result).toEqual({
      newCount: 3,
      returningCount: 1,
      top: [{ name: 'B', orders: 1, amount: 50 }, { name: 'A', orders: 2, amount: 20 }],
    })
  })
})

describe('loadMonthlyReportData', () => {
  it('agrège le mois, historiques compris, et le compare au mois précédent', async () => {
    const f = fake()
    const data = await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    expect(data).not.toBeNull()
    expect(data!.revenue).toBe(800_000)
    expect(data!.historicalRevenue).toBe(100_000)
    expect(data!.revenuePrev).toBe(400_000)
    expect(data!.revenueLastYear).toBe(0)
    expect(data!.sales).toEqual({ count: 3, countPrev: 1 })
    expect(data!.orders).toEqual({ count: 4, countPrev: 0 })
    expect(data!.expenses).toEqual({ total: 50_000, totalPrev: 40_000 })
    expect(data!.openDays).toBe(3)
    expect(data!.days[2]).toEqual({ day: 3, weekday: 5, amount: 500_000 })
    expect(data!.weekdayAverages).toEqual([200_000, 100_000, null, null, null, 500_000, null])
    expect(data!.payments.map(p => p.method)).toEqual(['Espèces', 'Wave'])
    expect(data!.customers.newCount).toBe(7)
    expect(data!.customers.returningCount).toBe(1)
    expect(data!.insights[0]).toBe('Le CA progresse de +100 % par rapport à septembre.')
  })

  it('classe le top 10 par CA et isole les 3 produits les moins vendus', async () => {
    const f = fake()
    const data = await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    expect(data!.topProducts).toHaveLength(10)
    expect(data!.topProducts[0].name).toBe('Produit 14')
    expect(data!.flopProducts.map(p => p.name)).toEqual(['Produit 1', 'Produit 2', 'Produit 3'])
    expect(data!.lowSellerCount).toBe(9)
  })

  it("n'affiche pas de flop avec moins de 13 produits distincts", async () => {
    const f = fake({ transaction_items: () => ({ data: ITEMS.slice(0, 12), error: null }) })
    const data = await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    expect(data!.flopProducts).toEqual([])
  })

  it('renvoie null sans aucune transaction dans le mois', async () => {
    const f = fake({ transactions: () => ({ data: [], error: null }) })
    expect(await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')).toBeNull()
  })

  it('filtre chaque requête sur l’organisation et les bornes du mois', async () => {
    const f = fake()
    await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    for (const table of ['transactions', 'expenses', 'orders', 'customers']) {
      for (const call of callsTo(f.calls, table)) {
        expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
      }
    }
    const [items] = callsTo(f.calls, 'transaction_items')
    expect(hasOp(items, 'eq', ['transactions.organization_id', 'org-1'])).toBe(true)
    const [tx] = callsTo(f.calls, 'transactions')
    expect(hasOp(tx, 'gte', ['created_at', OCT])).toBe(true)
    expect(hasOp(tx, 'lt', ['created_at', '2026-11-01T00:00:00.000Z'])).toBe(true)
    expect(tx.ops.some(([op, args]) => op === 'eq' && args[0] === 'is_historical')).toBe(false)
    const [orders] = callsTo(f.calls, 'orders')
    expect(hasOp(orders, 'neq', ['status', 'cancelled'])).toBe(true)
    const [expenses] = callsTo(f.calls, 'expenses')
    expect(hasOp(expenses, 'eq', ['is_cancelled', false])).toBe(true)
  })
})
