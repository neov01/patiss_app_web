// src/lib/reports/report-insights.test.ts
import { describe, expect, it } from 'vitest'
import { buildMonthlyInsights, monthLabel, monthName, type InsightInput } from './report-insights'

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    orgName: 'Pâtisserie Démo',
    currency: 'FCFA',
    appUrl: null,
    month: '2026-10',
    revenue: 1_000_000,
    historicalRevenue: 0,
    revenuePrev: 800_000,
    revenueLastYear: 0,
    sales: { count: 100, countPrev: 90 },
    orders: { count: 10, countPrev: 8 },
    expenses: { total: 0, totalPrev: 0 },
    days: [],
    openDays: 20,
    weekdayAverages: [null, null, null, null, null, null, null],
    payments: [],
    topProducts: [],
    flopProducts: [],
    lowSellerCount: 0,
    customers: { newCount: 0, returningCount: 0, top: [] },
    ...overrides,
  }
}

describe('noms de mois', () => {
  it('donne le nom et le libellé en français', () => {
    expect(monthName('2026-10')).toBe('octobre')
    expect(monthLabel('2026-02')).toBe('février 2026')
  })
})

describe('buildMonthlyInsights', () => {
  it('annonce la progression du CA et les produits qui la portent', () => {
    const [first] = buildMonthlyInsights(input({
      topProducts: [
        { name: 'Forêt-Noire', quantity: 142, amount: 200_000 },
        { name: 'Fraisier', quantity: 96, amount: 160_000 },
        { name: 'Croissant', quantity: 900, amount: 90_000 },
      ],
    }))
    expect(first).toBe('Le CA progresse de +25 % par rapport à septembre, porté par Forêt-Noire et Fraisier.')
  })

  it('annonce un recul sans citer de produit', () => {
    const [first] = buildMonthlyInsights(input({ revenue: 600_000 }))
    expect(first).toBe('Le CA recule de −25 % par rapport à septembre.')
  })

  it("n'écrit rien sur le CA sans mois de référence", () => {
    expect(buildMonthlyInsights(input({ revenuePrev: 0 }))).toEqual([])
  })

  it('commente le solde net quand les dépenses des deux mois sont connues', () => {
    const insights = buildMonthlyInsights(input({ expenses: { total: 200_000, totalPrev: 200_000 } }))
    // net : 800 000 contre 600 000 → +33 %
    expect(insights).toContain('Le solde net (CA − dépenses) progresse de +33 % par rapport à septembre.')
  })

  it('signale le jour le plus calme si l’écart dépasse 25 %', () => {
    const insights = buildMonthlyInsights(input({ weekdayAverages: [100, 300, 300, 300, 300, 500, null] }))
    // moyenne 300, lundi à 100 → 67 % de moins
    expect(insights).toContain('Les lundis restent les plus calmes (67 % de moins que la moyenne).')
  })

  it("ne signale pas de jour calme avec moins de 5 jours ouverts", () => {
    const insights = buildMonthlyInsights(input({ weekdayAverages: [100, 300, 300, null, null, 500, null] }))
    expect(insights.some(s => s.includes('plus calmes'))).toBe(false)
  })

  it('signale les produits peu vendus, au singulier comme au pluriel', () => {
    const flop = [{ name: 'Opéra', quantity: 1, amount: 1_500 }]
    expect(buildMonthlyInsights(input({ flopProducts: flop, lowSellerCount: 3 })))
      .toContain('3 produits se vendent à moins de 10 exemplaires par mois : à revoir.')
    expect(buildMonthlyInsights(input({ flopProducts: flop, lowSellerCount: 1 })))
      .toContain('1 produit se vend à moins de 10 exemplaires par mois : à revoir.')
  })

  it('renvoie au plus 4 phrases dans l’ordre des règles', () => {
    const insights = buildMonthlyInsights(input({
      expenses: { total: 200_000, totalPrev: 200_000 },
      weekdayAverages: [100, 300, 300, 300, 300, 500, null],
      flopProducts: [{ name: 'Opéra', quantity: 1, amount: 1_500 }],
      lowSellerCount: 2,
    }))
    expect(insights).toHaveLength(4)
    expect(insights[0]).toMatch(/^Le CA/)
    expect(insights[1]).toMatch(/^Le solde net/)
    expect(insights[2]).toMatch(/^Les lundis/)
    expect(insights[3]).toMatch(/^2 produits/)
  })
})
