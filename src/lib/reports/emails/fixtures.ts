// src/lib/reports/emails/fixtures.ts
import type { DailyReportData } from '../types'

const hours = (values: Record<number, number>) => Array.from({ length: 24 }, (_, h) => values[h] ?? 0)

/** Données fictives de la maquette validée (samedi 14 novembre 2026). */
export const dailyFixture: DailyReportData = {
  orgName: 'Pâtisserie Démo',
  currency: 'FCFA',
  reportDate: new Date('2026-11-14T20:14:00Z'),
  appUrl: 'https://patiss-app.example',
  totalRevenue: 487_000,
  comparisons: { yesterday: 312_000, lastWeek: 452_000, lastWeekDate: new Date('2026-11-07T20:14:00Z') },
  sales: { count: 94, revenue: 487_000, countYesterday: 71, revenueYesterday: 312_000 },
  expenses: { total: 62_000, count: 3 },
  hourly: {
    today: hours({ 7: 18_000, 8: 42_000, 9: 51_000, 10: 47_000, 11: 38_000, 12: 29_000, 13: 22_000, 14: 19_000, 15: 27_000, 16: 44_000, 17: 61_000, 18: 52_000, 19: 37_000 }),
    yesterday: hours({ 7: 12_000, 8: 28_000, 9: 34_000, 10: 30_000, 11: 26_000, 12: 22_000, 13: 18_000, 14: 15_000, 15: 19_000, 16: 29_000, 17: 37_000, 18: 26_000, 19: 16_000 }),
  },
  payments: [
    { method: 'Espèces', amount: 214_000, pct: 44 },
    { method: 'Wave', amount: 146_250, pct: 30 },
    { method: 'Orange Money', amount: 87_750, pct: 18 },
    { method: 'MTN MOMO', amount: 29_250, pct: 6 },
    { method: 'Moov Money', amount: 9_750, pct: 2 },
  ],
  topProducts: [
    { name: 'Forêt-Noire (entier)', quantity: 7, amount: 105_000 },
    { name: 'Croissant au beurre', quantity: 86, amount: 43_000 },
    { name: 'Éclair au chocolat', quantity: 42, amount: 42_000 },
  ],
  tomorrow: { count: 6, firstPickupAt: '2026-11-15T09:30:00.000Z', remaining: 78_000 },
  stockAlerts: [
    { name: 'Beurre doux', current: 2, threshold: 5, unit: 'kg' },
    { name: 'Crème liquide', current: 1.5, threshold: 3, unit: 'L' },
  ],
  pendingTotal: 134_500,
  breakdown: { ventesDirectes: 340_500, acomptes: 96_500, soldes: 50_000 },
  caisse: {
    openerName: 'Awa', openerRole: 'Vendeur', openedAt: '2026-11-14T07:02:00.000Z',
    closerName: 'Koffi', closerRole: 'Gérant', closedAt: '2026-11-14T20:14:00.000Z',
  },
  team: [
    { name: 'Awa', role: 'Vendeur', orders: 12, imports: 0 },
    { name: 'Koffi', role: 'Gérant', orders: 5, imports: 2 },
  ],
}
