// src/lib/reports/emails/DailyReportEmail.test.tsx
import { describe, expect, it } from 'vitest'
import { dailyPreheader, dailySubject } from './DailyReportEmail'
import { dailyFixture } from './fixtures'
import { renderDailyReportEmail } from './render'

describe('DailyReportEmail', () => {
  it('affiche le total, les deux comparaisons et les blocs principaux', async () => {
    const html = await renderDailyReportEmail(dailyFixture)
    expect(html).toContain('487 000')
    expect(html).toContain('+56 %')
    expect(html).toContain('+8 %')
    expect(html).toContain('vs samedi dernier')
    expect(html).toContain('Panier moyen')
    expect(html).toContain('Heure de pointe')
    expect(html).toContain('17h–18h')
    expect(html).toContain('Modes de règlement')
    expect(html).toContain('MTN MoMo')
    expect(html).toContain('Forêt-Noire (entier)')
    expect(html).toContain('6 commandes')
    expect(html).toContain('09h30')
    expect(html).toContain('Beurre doux 2 kg (seuil 5 kg)')
    expect(html).toContain('Koffi 5 (+2 imports)')
    expect(html).toContain('https://patiss-app.example')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
  })

  it('échappe les noms saisis par les utilisateurs', async () => {
    const html = await renderDailyReportEmail({
      ...dailyFixture,
      topProducts: [{ name: '<b>Gâteau</b>', quantity: 1, amount: 1000 }],
    })
    expect(html).toContain('&lt;b&gt;Gâteau')
    expect(html).not.toContain('<b>Gâteau')
  })

  it('masque les blocs optionnels sans données sans planter', async () => {
    const html = await renderDailyReportEmail({
      ...dailyFixture,
      totalRevenue: 0,
      comparisons: null,
      sales: null,
      hourly: null,
      payments: [],
      topProducts: null,
      tomorrow: null,
      stockAlerts: [],
      pendingTotal: 0,
      appUrl: null,
    })
    expect(html).not.toContain('Heure de pointe')
    expect(html).not.toContain('Modes de règlement')
    expect(html).not.toContain('Top 3')
    expect(html).not.toContain('Points d')
    expect(html).not.toContain('Ouvrir le tableau de bord')
    expect(html).toContain('Détails de la caisse')
  })

  it('annonce l’absence de retrait demain', async () => {
    const html = await renderDailyReportEmail({ ...dailyFixture, tomorrow: { count: 0, firstPickupAt: null, remaining: 0 } })
    expect(html).toContain('Aucun retrait prévu demain.')
  })

  it('compose le préheader et l’objet', () => {
    expect(dailyPreheader(dailyFixture)).toBe('487 000 FCFA encaissés, +56 % vs hier, +8 % vs samedi dernier')
    expect(dailySubject(dailyFixture)).toBe('📊 Rapport de journée — Pâtisserie Démo — Samedi 14 novembre 2026')
  })
})
