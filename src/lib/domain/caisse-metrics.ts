import {
  emptyPaymentBreakdown,
  mergePaymentBreakdown,
  normalizePaymentDetails,
  normalizePaymentMethod,
  type PaymentBreakdown,
  type PaymentDetails,
} from './payments'

export type CaisseTransactionInput = {
  amount: number | null
  payment_method: string | null
  payment_details?: PaymentDetails | null
  label_type: string | null
}

export type CaisseOrderInput = {
  total_amount: number | null
  deposit_amount: number | null
  status: string | null
}

export type CaisseMetrics = {
  paymentBreakdown: PaymentBreakdown
  totalCash: number
  totalMobileMoney: number
  totalRevenue: number
  totalAcomptes: number
  totalSoldes: number
  totalVentesDirectes: number
  totalPending: number
  totalOrders: number
  completedOrders: number
}

const CLOSED_ORDER_STATUSES = new Set(['completed', 'delivered'])
const IGNORED_PENDING_STATUSES = new Set(['completed', 'delivered', 'cancelled'])

export function calculateCaisseMetrics(
  transactions: CaisseTransactionInput[],
  orders: CaisseOrderInput[]
): CaisseMetrics {
  const paymentBreakdown = emptyPaymentBreakdown()
  let totalAcomptes = 0
  let totalSoldes = 0
  let totalVentesDirectes = 0
  let totalPending = 0

  for (const tx of transactions) {
    const amount = Number(tx.amount ?? 0) || 0

    if (tx.label_type === 'ACOMPTE') totalAcomptes += amount
    else if (tx.label_type === 'SOLDE') totalSoldes += amount
    else if (tx.label_type === 'VENTE_DIRECTE') totalVentesDirectes += amount

    const details = normalizePaymentDetails(tx.payment_details)
    const detailTotal = Object.values(details).reduce((sum, value) => sum + value, 0)

    if (detailTotal > 0) {
      mergePaymentBreakdown(paymentBreakdown, details)
    } else {
      paymentBreakdown[normalizePaymentMethod(tx.payment_method)] += amount
    }
  }

  for (const order of orders) {
    if (!IGNORED_PENDING_STATUSES.has(order.status ?? '')) {
      const paid = Number(order.deposit_amount ?? 0) || 0
      const remaining = (Number(order.total_amount ?? 0) || 0) - paid
      totalPending += Math.max(0, remaining)
    }
  }

  const totalOrders = orders.length
  const completedOrders = orders.filter(order => CLOSED_ORDER_STATUSES.has(order.status ?? '')).length
  const totalCash = paymentBreakdown['Espèces']
  const totalMobileMoney =
    paymentBreakdown['Orange Money'] +
    paymentBreakdown.Wave +
    paymentBreakdown['MTN MOMO'] +
    paymentBreakdown['Moov Money']

  return {
    paymentBreakdown,
    totalCash,
    totalMobileMoney,
    totalRevenue: totalCash + totalMobileMoney,
    totalAcomptes,
    totalSoldes,
    totalVentesDirectes,
    totalPending,
    totalOrders,
    completedOrders,
  }
}
