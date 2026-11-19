// src/lib/reports/emails/format.ts
const DATE_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' })

// Les espaces de groupement des milliers restent des espaces normales (et non l'espace
// fine insécable de Intl) : certaines polices grasses l'affichent mal dans les messageries.
// L'unité (FCFA, %) est accrochée au nombre par une espace insécable (U+00A0) : elle ne
// passe jamais seule à la ligne. Les montants sont aussi en white-space: nowrap.
function normalizeSpaces(value: string): string {
  return value.replace(/\s/g, ' ')
}

export function formatNumber(value: number): string {
  return normalizeSpaces(Math.round(value).toLocaleString('fr-FR'))
}

export function formatMoney(value: number, currency: string): string {
  return `${formatNumber(value)} ${currency}`
}

export function formatQty(value: number): string {
  return normalizeSpaces(value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }))
}

export function formatSignedPct(pct: number): string {
  return pct >= 0 ? `+${pct} %` : `−${Math.abs(pct)} %`
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatLongDate(date: Date): string {
  return capitalize(DATE_LONG.format(date))
}

export function formatShortDate(date: Date): string {
  return DATE_SHORT.format(date)
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso)).replace(':', 'h')
}

export function formatWeekday(date: Date): string {
  return WEEKDAY.format(date)
}
