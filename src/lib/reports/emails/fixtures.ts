// src/lib/reports/emails/fixtures.ts
import { weekdayAverages } from '../report-math'
import type { DailyReportData, DayTotal, MonthlyReportData } from '../types'

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

// Octobre 2026 : le 1er est un jeudi (0 = lundi → jeudi = 3).
const BASE_BY_WEEKDAY = [238, 262, 281, 290, 331, 497, 423]
const WIGGLE = [7, -12, 15, -4, 9, -18, 3, 11, -7, 21, -9, 5, -15, 13, 2, -11, 17, -6, 8, -3, 25, -14, 6, -8, 12, -5, 19, -10, 4, 31, 14]
const OCTOBER: DayTotal[] = WIGGLE.map((wiggle, i) => {
  const weekday = (3 + i) % 7
  return { day: i + 1, weekday, amount: (BASE_BY_WEEKDAY[weekday] + wiggle) * 1000 }
})
const OCTOBER_REVENUE = OCTOBER.reduce((sum, d) => sum + d.amount, 0)

/** Données fictives de la maquette validée (octobre 2026). */
export const monthlyFixture: MonthlyReportData = {
  orgName: 'Pâtisserie Démo',
  currency: 'FCFA',
  appUrl: 'https://patiss-app.example',
  month: '2026-10',
  revenue: OCTOBER_REVENUE,
  historicalRevenue: 320_000,
  revenuePrev: 8_915_000,
  revenueLastYear: 9_120_000,
  sales: { count: 2_104, countPrev: 1_967 },
  orders: { count: 148, countPrev: 131 },
  expenses: { total: 1_860_000, totalPrev: 1_740_000 },
  days: OCTOBER,
  openDays: 31,
  weekdayAverages: weekdayAverages(OCTOBER),
  payments: [
    { method: 'Espèces', amount: 4_518_000, pct: 43 },
    { method: 'Wave', amount: 3_257_000, pct: 31 },
    { method: 'Orange Money', amount: 1_786_000, pct: 17 },
    { method: 'MTN MOMO', amount: 630_000, pct: 6 },
    { method: 'Moov Money', amount: 315_000, pct: 3 },
  ],
  topProducts: [
    { name: 'Forêt-Noire (entier)', quantity: 142, amount: 2_130_000 },
    { name: 'Fraisier (entier)', quantity: 96, amount: 1_632_000 },
    { name: 'Croissant au beurre', quantity: 1_840, amount: 920_000 },
    { name: 'Éclair au chocolat', quantity: 812, amount: 812_000 },
    { name: 'Number cake', quantity: 21, amount: 735_000 },
    { name: 'Pain au chocolat', quantity: 1_210, amount: 726_000 },
    { name: 'Tarte citron meringuée', quantity: 58, amount: 580_000 },
    { name: 'Mille-feuille', quantity: 402, amount: 482_400 },
    { name: 'Macarons (boîte de 12)', quantity: 61, amount: 427_000 },
    { name: 'Paris-Brest', quantity: 47, amount: 376_000 },
  ],
  flopProducts: [
    { name: 'Tarte Tatin (entière)', quantity: 1, amount: 12_000 },
    { name: 'Opéra (part)', quantity: 6, amount: 9_000 },
    { name: 'Chausson aux pommes', quantity: 9, amount: 6_300 },
  ],
  lowSellerCount: 3,
  customers: {
    newCount: 37,
    returningCount: 64,
    top: [
      { name: 'Mme Kouassi', orders: 6, amount: 214_000 },
      { name: 'Hôtel Ivoire Lagune', orders: 4, amount: 186_000 },
      { name: 'M. Traoré', orders: 5, amount: 142_500 },
      { name: 'Mme Bamba', orders: 3, amount: 98_000 },
      { name: 'École Les Lauriers', orders: 2, amount: 91_000 },
    ],
  },
  insights: [
    'Le CA progresse de +18 % par rapport à septembre, porté par Forêt-Noire (entier).',
    'Le solde net (CA − dépenses) progresse de +21 % par rapport à septembre.',
    '3 produits se vendent à moins de 10 exemplaires par mois : à revoir.',
  ],
}
