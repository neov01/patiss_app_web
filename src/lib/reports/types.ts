// src/lib/reports/types.ts
import type { CanonicalPaymentMethod } from '@/lib/domain/payments'

/** Part d'un mode de règlement ; `pct` est un entier, la somme des parts vaut 100. */
export type PaymentShare = { method: CanonicalPaymentMethod; amount: number; pct: number }

export type RankedProduct = { name: string; quantity: number; amount: number }

/** `weekday` : 0 = lundi … 6 = dimanche. */
export type DayTotal = { day: number; weekday: number; amount: number }

export type DailyReportData = {
  orgName: string
  currency: string
  /** Instant de la clôture. */
  reportDate: Date
  appUrl: string | null
  /** Total encaissé de la session (identique au metrics_snapshot). */
  totalRevenue: number
  /** null si les transactions des jours de comparaison n'ont pas pu être lues. */
  comparisons: { yesterday: number; lastWeek: number; lastWeekDate: Date } | null
  sales: { count: number; revenue: number; countYesterday: number; revenueYesterday: number } | null
  expenses: { total: number; count: number }
  /** 24 montants par heure UTC pour chaque jour. */
  hourly: { today: number[]; yesterday: number[] } | null
  payments: PaymentShare[]
  /** null = lecture en erreur ; [] = aucun article vendu. */
  topProducts: RankedProduct[] | null
  /** firstPickupAt est null si l'heure de retrait n'est pas renseignée (minuit). */
  tomorrow: { count: number; firstPickupAt: string | null; remaining: number } | null
  stockAlerts: { name: string; current: number; threshold: number; unit: string }[]
  pendingTotal: number
  breakdown: { ventesDirectes: number; acomptes: number; soldes: number }
  caisse: {
    openerName: string
    openerRole: string
    openedAt: string
    closerName: string
    closerRole: string
    closedAt: string
  }
  team: { name: string; role: string; orders: number; imports: number }[]
}

export type MonthlyReportData = {
  orgName: string
  currency: string
  appUrl: string | null
  /** 'AAAA-MM' */
  month: string
  revenue: number
  historicalRevenue: number
  revenuePrev: number
  revenueLastYear: number
  sales: { count: number; countPrev: number }
  orders: { count: number; countPrev: number }
  expenses: { total: number; totalPrev: number }
  days: DayTotal[]
  openDays: number
  /** 7 valeurs (lundi → dimanche), null si le jour n'a jamais été ouvert. */
  weekdayAverages: (number | null)[]
  payments: PaymentShare[]
  /** 10 produits maximum, classés par CA. */
  topProducts: RankedProduct[]
  /** 3 produits les moins vendus ; [] si moins de 13 produits distincts. */
  flopProducts: RankedProduct[]
  /** Nombre de produits vendus au moins une fois mais moins de 10 fois. */
  lowSellerCount: number
  customers: {
    newCount: number
    returningCount: number
    top: { name: string; orders: number; amount: number }[]
  }
  insights: string[]
}
