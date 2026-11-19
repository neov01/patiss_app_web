// src/lib/reports/emails/MonthlyReportEmail.test.tsx
import { describe, expect, it } from 'vitest'
import { monthlyPreheader, monthlySubject } from './MonthlyReportEmail'
import { monthlyFixture } from './fixtures'
import { renderMonthlyReportEmail } from './render'

describe('MonthlyReportEmail', () => {
  it('affiche le CA, les comparaisons et tous les blocs', async () => {
    const html = await renderMonthlyReportEmail(monthlyFixture)
    expect(html).toContain('Récapitulatif du mois')
    expect(html).toContain('Octobre 2026 · 31 jours')
    expect(html).toContain('vs septembre')
    expect(html).toContain('vs octobre 2025')
    expect(html).toContain('saisis a posteriori')
    expect(html).toContain('En bref')
    expect(html).toContain('porté par Forêt-Noire (entier)')
    expect(html).toContain('CA jour par jour')
    expect(html).toContain('Meilleur jour')
    expect(html).toContain('Quels jours portent la boutique')
    expect(html).toContain('Top 10 produits')
    expect(html).toContain('Ventes les plus faibles')
    expect(html).toContain('Mme Kouassi')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
  })

  it('masque la part historique, le flop et le bloc En bref quand ils sont vides', async () => {
    const html = await renderMonthlyReportEmail({ ...monthlyFixture, historicalRevenue: 0, flopProducts: [], insights: [] })
    expect(html).not.toContain('saisis a posteriori')
    expect(html).not.toContain('Ventes les plus faibles')
    expect(html).not.toContain('En bref')
  })

  it('affiche un tiret à la place des pastilles sans mois de référence', async () => {
    const html = await renderMonthlyReportEmail({
      ...monthlyFixture,
      revenuePrev: 0,
      revenueLastYear: 0,
      sales: { count: 10, countPrev: 0 },
      orders: { count: 3, countPrev: 0 },
      expenses: { total: 1000, totalPrev: 0 },
    })
    expect(html).not.toContain('vs septembre (')
    expect(html).toContain('—')
  })

  it('compose le préheader et l’objet', () => {
    expect(monthlyPreheader(monthlyFixture)).toMatch(/^10 \d{3} \d{3} FCFA en octobre, \+18 % vs septembre$/)
    expect(monthlySubject(monthlyFixture)).toBe('📈 Récap du mois — Pâtisserie Démo — Octobre 2026')
  })
})
