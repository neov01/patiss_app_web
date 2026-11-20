// src/lib/reports/emails/format.test.ts
import { describe, expect, it } from 'vitest'
import { capitalize, formatLongDate, formatMoney, formatNumber, formatQty, formatShortDate, formatSignedPct, formatTime, formatWeekday } from './format'

describe('formats français', () => {
  it('groupe les milliers avec une espace normale', () => {
    expect(formatNumber(487_000)).toBe('487 000')
    expect(formatNumber(10_506_000.4)).toBe('10 506 000')
    expect(formatMoney(487_000, 'FCFA')).toBe('487 000 FCFA')
  })
  it('formate les quantités décimales', () => {
    expect(formatQty(1.5)).toBe('1,5')
    expect(formatQty(2)).toBe('2')
  })
  it('signe les pourcentages', () => {
    expect(formatSignedPct(56)).toBe('+56 %')
    expect(formatSignedPct(-7)).toBe('−7 %')
    expect(formatSignedPct(0)).toBe('+0 %')
  })
  it('formate les dates et heures en UTC', () => {
    const d = new Date('2026-11-14T20:14:00Z')
    expect(formatLongDate(d)).toBe('Samedi 14 novembre 2026')
    expect(formatShortDate(new Date('2026-11-07T10:00:00Z'))).toBe('7 nov.')
    expect(formatTime('2026-11-14T07:02:00Z')).toBe('07h02')
    expect(formatWeekday(d)).toBe('samedi')
    expect(capitalize('octobre 2026')).toBe('Octobre 2026')
  })
})
