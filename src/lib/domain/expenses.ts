// Fonctions pures de la régie dépenses (fonds fixe hebdomadaire).
// Aucune dépendance serveur : testables unitairement et réutilisables côté client.

export interface CashTx {
  amount: number | string | null
  payment_method: string | null
  payment_details: unknown
}

/** Recharge du fonds fixe : ce qu'il faut remettre pour revenir au budget cible. */
export function computeWeeklyRecharge(budget: number, currentBalance: number): number {
  return Math.max(0, budget - currentBalance)
}

/**
 * Somme des espèces d'une liste de transactions.
 * - Par défaut : encaissements bruts uniquement (montants positifs).
 * - includeOutflows : espèces nettes, sorties de caisse (montants négatifs) déduites.
 */
export function sumCashFromTransactions(
  txs: CashTx[],
  opts: { includeOutflows?: boolean } = {}
): number {
  let total = 0
  for (const tx of txs) {
    const amount = Number(tx.amount ?? 0) || 0
    if (!opts.includeOutflows && amount <= 0) continue

    if (tx.payment_method === 'Espèces') {
      total += amount
    } else if (tx.payment_details && typeof tx.payment_details === 'object') {
      const cash = Number((tx.payment_details as Record<string, unknown>)['Espèces'] ?? 0) || 0
      total += cash
    }
  }
  return total
}

/** Le bilan se fait le dernier jour du cycle (dimanche, UTC+0) ou après. */
export function isWeeklyClosingDue(cycleEndDate: string, now: Date): boolean {
  const lastDayStart = new Date(cycleEndDate)
  lastDayStart.setUTCHours(0, 0, 0, 0)
  return now.getTime() >= lastDayStart.getTime()
}

export interface WeeklyBilanFigures {
  recharge: number
  toRemit: number
  isCashSufficient: boolean
}

/** Chiffres affichés au bilan : recharge à prélever et estimation à remettre à la gérante. */
export function buildWeeklyBilan(input: {
  budget: number
  currentBalance: number
  netWeekCash: number
}): WeeklyBilanFigures {
  const recharge = computeWeeklyRecharge(input.budget, input.currentBalance)
  return {
    recharge,
    toRemit: Math.max(0, input.netWeekCash - recharge),
    isCashSufficient: input.netWeekCash >= recharge,
  }
}
