import { describe, expect, it } from 'vitest'
import { emptyPaymentBreakdown } from '@/lib/domain/payments'
import {
  dailyTotals,
  isoWeekdayIndex,
  largestRemainderPercents,
  monthBounds,
  previousMonthKey,
  rankProducts,
  shiftMonth,
  sumAmounts,
  sumForUtcDay,
  toPaymentShares,
  variationPct,
  weekdayAverages,
} from './report-math'

describe('variationPct', () => {
  it('arrondit la variation à l’entier', () => {
    expect(variationPct(487_000, 312_000)).toBe(56)
    expect(variationPct(452_000, 487_000)).toBe(-7)
  })
  it('renvoie null sans référence', () => {
    expect(variationPct(100, 0)).toBeNull()
    expect(variationPct(100, null)).toBeNull()
    expect(variationPct(100, undefined)).toBeNull()
  })
})

describe('largestRemainderPercents', () => {
  it('donne une somme exacte de 100', () => {
    const pcts = largestRemainderPercents([1, 1, 1])
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100)
    expect(pcts).toEqual([34, 33, 33])
  })
  it('gère un seul mode et un total nul', () => {
    expect(largestRemainderPercents([500])).toEqual([100])
    expect(largestRemainderPercents([0, 0])).toEqual([0, 0])
  })
})

describe('toPaymentShares', () => {
  it('ne garde que les modes > 0, triés, avec des % entiers sommant à 100', () => {
    const breakdown = { ...emptyPaymentBreakdown(), 'Espèces': 214_000, Wave: 146_250, 'Moov Money': 9_750 }
    const shares = toPaymentShares(breakdown)
    expect(shares.map(s => s.method)).toEqual(['Espèces', 'Wave', 'Moov Money'])
    expect(shares.reduce((a, s) => a + s.pct, 0)).toBe(100)
  })
})

describe('bornes de mois', () => {
  it('calcule début, fin exclusive et nombre de jours', () => {
    expect(monthBounds('2026-10')).toEqual({
      key: '2026-10',
      start: '2026-10-01T00:00:00.000Z',
      end: '2026-11-01T00:00:00.000Z',
      daysInMonth: 31,
    })
    expect(monthBounds('2028-02').daysInMonth).toBe(29)
    expect(monthBounds('2026-02').daysInMonth).toBe(28)
  })
  it('refuse un format invalide', () => {
    expect(() => monthBounds('2026-13')).toThrow()
    expect(() => monthBounds('oct')).toThrow()
  })
  it('décale les mois en franchissant les années', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-10', -12)).toBe('2025-10')
  })
  it('donne le mois précédant une date', () => {
    expect(previousMonthKey(new Date('2026-11-01T06:00:00Z'))).toBe('2026-10')
    expect(previousMonthKey(new Date('2027-01-01T06:00:00Z'))).toBe('2026-12')
  })
})

describe('agrégats par jour', () => {
  const rows = [
    { amount: 500, created_at: '2026-10-03T09:00:00Z' },
    { amount: 250, created_at: '2026-10-03T18:00:00+00:00' },
    { amount: 100, created_at: '2026-10-05T10:00:00Z' },
    { amount: 999, created_at: '2026-11-01T00:00:00Z' },
    { amount: null, created_at: null },
  ]

  it('numérote les jours de la semaine à partir du lundi', () => {
    expect(isoWeekdayIndex(new Date('2026-10-05T00:00:00Z'))).toBe(0) // lundi
    expect(isoWeekdayIndex(new Date('2026-10-04T00:00:00Z'))).toBe(6) // dimanche
  })

  it('additionne les montants', () => {
    expect(sumAmounts(rows)).toBe(1849)
    expect(sumForUtcDay(rows, '2026-10-03')).toBe(750)
  })

  it('produit un total par jour du mois, hors autres mois', () => {
    const days = dailyTotals(rows, '2026-10')
    expect(days).toHaveLength(31)
    expect(days[0]).toEqual({ day: 1, weekday: 3, amount: 0 }) // 1er octobre 2026 = jeudi
    expect(days[2].amount).toBe(750)
    expect(days[4]).toEqual({ day: 5, weekday: 0, amount: 100 })
  })

  it('moyenne par jour de la semaine sur les seuls jours ouverts', () => {
    const days = dailyTotals(rows, '2026-10')
    const averages = weekdayAverages(days)
    expect(averages[5]).toBe(750) // samedi 3
    expect(averages[0]).toBe(100) // lundi 5
    expect(averages[1]).toBeNull()
  })
})

describe('rankProducts', () => {
  it('classe par CA décroissant en regroupant par nom', () => {
    const ranked = rankProducts([
      { name: 'Croissant', quantity: 86, unit_price: 500, subtotal: 43_000 },
      { name: 'Forêt-Noire', quantity: 7, unit_price: 15_000, subtotal: 105_000 },
      { name: 'Croissant', quantity: 4, unit_price: 500, subtotal: 2_000 },
    ])
    expect(ranked).toEqual([
      { name: 'Forêt-Noire', quantity: 7, amount: 105_000 },
      { name: 'Croissant', quantity: 90, amount: 45_000 },
    ])
  })
})
