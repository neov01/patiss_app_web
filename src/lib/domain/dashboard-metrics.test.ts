import { describe, expect, it } from 'vitest'
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
  type DashboardTransaction,
} from './dashboard-metrics'

const tx = (amount: number, created_at: string | null, payment_method = 'cash', payment_details: DashboardTransaction['payment_details'] = null): DashboardTransaction => ({
  amount,
  created_at,
  payment_method,
  payment_details,
  label_type: 'VENTE_DIRECTE',
})

const NOW = new Date('2026-11-18T11:30:00Z')

const TXS: DashboardTransaction[] = [
  tx(1000, '2026-11-18T08:15:00+00:00'),
  tx(2500, '2026-11-18T08:45:00+00:00', 'cash', { Wave: 1500, 'Espèces': 1000 }),
  tx(4000, '2026-11-18T10:05:00+00:00', 'orange_money'),
  tx(2000, '2026-11-17T09:00:00+00:00'),
  tx(3000, '2026-11-17T11:00:00+00:00', 'wave'),
  tx(6000, '2026-11-17T15:00:00+00:00'),
  tx(500, null),
]

describe('dashboard metrics — jours UTC', () => {
  it('donne la clé du jour et de la veille en UTC', () => {
    expect(utcDayKey(NOW)).toBe('2026-11-18')
    expect(previousUtcDayKey(new Date('2026-03-01T05:00:00Z'))).toBe('2026-02-28')
  })

  it('garde les transactions datées à partir du jour donné', () => {
    expect(transactionsSince(TXS, '2026-11-18')).toHaveLength(3)
  })
})

describe('dashboard metrics — tranches horaires', () => {
  it('regroupe nombre et montant par heure pour un jour', () => {
    const buckets = hourlyBuckets(TXS, '2026-11-18')
    expect(buckets).toHaveLength(24)
    expect(buckets[8]).toEqual({ hour: 8, count: 2, amount: 3500 })
    expect(buckets[10]).toEqual({ hour: 10, count: 1, amount: 4000 })
    expect(buckets[9]).toEqual({ hour: 9, count: 0, amount: 0 })
  })
})

describe('dashboard metrics — CA cumulé', () => {
  it('cumule aujourd\'hui jusqu\'à l\'heure courante et hier sur toute la plage', () => {
    const points = buildCumulativeSeries(TXS, NOW)
    expect(points[0]).toEqual({ hour: 6, today: 0, yesterday: 0 })
    expect(points[points.length - 1].hour).toBe(22)
    const byHour = new Map(points.map(p => [p.hour, p]))
    expect(byHour.get(8)).toEqual({ hour: 8, today: 3500, yesterday: 0 })
    expect(byHour.get(9)).toEqual({ hour: 9, today: 3500, yesterday: 2000 })
    expect(byHour.get(11)).toEqual({ hour: 11, today: 7500, yesterday: 5000 })
    expect(byHour.get(12)).toEqual({ hour: 12, today: null, yesterday: 5000 })
    expect(byHour.get(22)).toEqual({ hour: 22, today: null, yesterday: 11000 })
  })

  it('élargit la plage quand il y a de l\'activité avant 6h', () => {
    const points = buildCumulativeSeries([...TXS, tx(100, '2026-11-18T04:10:00+00:00')], NOW)
    expect(points[0]).toEqual({ hour: 4, today: 100, yesterday: 0 })
  })
})

describe('dashboard metrics — comparaison avec hier', () => {
  it('compare au CA d\'hier à la même heure', () => {
    expect(compareWithYesterday(TXS, NOW)).toEqual({ today: 7500, yesterday: 5000, deltaPct: 50 })
  })

  it('ne donne pas de pourcentage quand hier vaut 0', () => {
    const onlyToday = transactionsSince(TXS, '2026-11-18')
    expect(compareWithYesterday(onlyToday, NOW).deltaPct).toBeNull()
  })
})

describe('dashboard metrics — encaissements et modes', () => {
  it('compte une ligne par encaissement positif et somme le CA', () => {
    expect(summarizeSales(transactionsSince(TXS, '2026-11-18'))).toEqual({ count: 3, revenue: 7500 })
  })

  it('ventile les modes en lisant payment_details et les slugs', () => {
    const slices = paymentSlices(transactionsSince(TXS, '2026-11-18'))
    expect(slices.map(s => s.method)).toEqual(['Orange Money', 'Espèces', 'Wave'])
    expect(slices.map(s => s.amount)).toEqual([4000, 2000, 1500])
    expect(slices[0].pct).toBeCloseTo(53.33, 1)
  })
})

describe('dashboard metrics — produits et pertes', () => {
  it('classe les produits par quantité en regroupant les noms', () => {
    const items = [
      { name: 'Croissant', quantity: 3, unit_price: 500, subtotal: null },
      { name: 'Croissant ', quantity: 2, unit_price: 500, subtotal: 1000 },
      { name: 'Éclair', quantity: 1, unit_price: 800, subtotal: 800 },
      { name: null, quantity: 4, unit_price: 100, subtotal: null },
    ]
    expect(topProducts(items)).toEqual([
      { name: 'Croissant', quantity: 5, amount: 2500 },
      { name: 'Article', quantity: 4, amount: 400 },
      { name: 'Éclair', quantity: 1, amount: 800 },
    ])
    expect(topProducts(items, 2)).toHaveLength(2)
  })

  it('valorise les pertes au coût et compte celles sans coût', () => {
    expect(wasteSummary([
      { quantity_change: -2, cost_per_unit: 300 },
      { quantity_change: -0.5, cost_per_unit: 1000 },
      { quantity_change: -1, cost_per_unit: 0 },
      { quantity_change: -3, cost_per_unit: null },
    ])).toEqual({ value: 1100, count: 4, missingCost: 2 })
  })
})
