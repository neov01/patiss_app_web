// src/lib/reports/report-insights.ts
import { shiftMonth, variationPct } from './report-math'
import type { MonthlyReportData } from './types'

export type InsightInput = Omit<MonthlyReportData, 'insights'>

const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const WEEKDAY_PLURAL = ['lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis', 'dimanches']

export function monthName(monthKey: string): string {
  return MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1]
}

export function monthLabel(monthKey: string): string {
  return `${monthName(monthKey)} ${monthKey.slice(0, 4)}`
}

function signed(pct: number): string {
  return pct >= 0 ? `+${pct} %` : `−${Math.abs(pct)} %`
}

/** Constats chiffrés du bloc « En bref » ; aucune suggestion inventée. */
export function buildMonthlyInsights(d: InsightInput): string[] {
  const insights: string[] = []
  const previousName = monthName(shiftMonth(d.month, -1))

  const revenueVar = variationPct(d.revenue, d.revenuePrev)
  if (revenueVar !== null) {
    if (revenueVar >= 0) {
      let sentence = `Le CA progresse de ${signed(revenueVar)} par rapport à ${previousName}`
      const [first, second] = d.topProducts
      if (first && first.amount >= 0.15 * d.revenue) {
        sentence += `, porté par ${first.name}`
        if (second && second.amount >= 0.15 * d.revenue) sentence += ` et ${second.name}`
      }
      insights.push(`${sentence}.`)
    } else {
      insights.push(`Le CA recule de ${signed(revenueVar)} par rapport à ${previousName}.`)
    }
  }

  if (d.expenses.total > 0 && d.expenses.totalPrev > 0) {
    const netVar = variationPct(d.revenue - d.expenses.total, d.revenuePrev - d.expenses.totalPrev)
    if (netVar !== null && d.revenuePrev - d.expenses.totalPrev > 0) {
      const verb = netVar >= 0 ? 'progresse' : 'recule'
      insights.push(`Le solde net (CA − dépenses) ${verb} de ${signed(netVar)} par rapport à ${previousName}.`)
    }
  }

  const open = d.weekdayAverages
    .map((avg, i) => ({ avg, i }))
    .filter((entry): entry is { avg: number; i: number } => entry.avg !== null)
  if (open.length >= 5) {
    const mean = open.reduce((sum, entry) => sum + entry.avg, 0) / open.length
    const weakest = open.reduce((min, entry) => (entry.avg < min.avg ? entry : min))
    const gap = mean > 0 ? (mean - weakest.avg) / mean : 0
    if (gap >= 0.25) {
      insights.push(`Les ${WEEKDAY_PLURAL[weakest.i]} restent les plus calmes (${Math.round(gap * 100)} % de moins que la moyenne).`)
    }
  }

  if (d.flopProducts.length > 0 && d.lowSellerCount > 0) {
    insights.push(d.lowSellerCount === 1
      ? '1 produit se vend à moins de 10 exemplaires par mois : à revoir.'
      : `${d.lowSellerCount} produits se vendent à moins de 10 exemplaires par mois : à revoir.`)
  }

  return insights.slice(0, 4)
}
