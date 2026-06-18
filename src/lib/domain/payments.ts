import { PaymentMethod, TransactionLabelType } from '@/lib/schemas/transactions'

export type CanonicalPaymentMethod = PaymentMethod
export type CanonicalTransactionLabelType = TransactionLabelType
export type PaymentDetails = Partial<Record<CanonicalPaymentMethod, number>> & Record<string, number | undefined>
export type PaymentBreakdown = Record<CanonicalPaymentMethod, number>

export const PAYMENT_METHODS: CanonicalPaymentMethod[] = [
  'Espèces',
  'Orange Money',
  'Wave',
  'MTN MOMO',
  'Moov Money',
]

const EMPTY_BREAKDOWN: PaymentBreakdown = {
  'Espèces': 0,
  'Orange Money': 0,
  Wave: 0,
  'MTN MOMO': 0,
  'Moov Money': 0,
}

const LEGACY_PAYMENT_METHODS: Record<string, CanonicalPaymentMethod> = {
  especes: 'Espèces',
  cash: 'Espèces',
  mobile_money: 'Orange Money',
  orange_money: 'Orange Money',
  orange: 'Orange Money',
  mtn_momo: 'MTN MOMO',
  mtn: 'MTN MOMO',
  moov_money: 'Moov Money',
  moov: 'Moov Money',
  wave: 'Wave',
}

export function isPaymentMethod(value: string): value is CanonicalPaymentMethod {
  return PAYMENT_METHODS.includes(value as CanonicalPaymentMethod)
}

export function normalizePaymentMethod(value: string | null | undefined): CanonicalPaymentMethod {
  if (!value) return 'Espèces'
  if (isPaymentMethod(value)) return value
  return LEGACY_PAYMENT_METHODS[value.trim().toLowerCase()] ?? 'Espèces'
}

export function emptyPaymentBreakdown(): PaymentBreakdown {
  return { ...EMPTY_BREAKDOWN }
}

export function normalizePaymentDetails(details: PaymentDetails | null | undefined): PaymentBreakdown {
  const breakdown = emptyPaymentBreakdown()
  if (!details) return breakdown

  for (const [rawMethod, rawAmount] of Object.entries(details)) {
    const amount = Number(rawAmount ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    const method = normalizePaymentMethod(rawMethod)
    breakdown[method] += amount
  }

  return breakdown
}

export function paymentBreakdownTotal(breakdown: PaymentBreakdown): number {
  return PAYMENT_METHODS.reduce((sum, method) => sum + breakdown[method], 0)
}

export function mergePaymentBreakdown(target: PaymentBreakdown, source: PaymentBreakdown): PaymentBreakdown {
  for (const method of PAYMENT_METHODS) {
    target[method] += source[method]
  }
  return target
}

export function getFinalPaymentMethod(
  paymentMethod: string | null | undefined,
  details: PaymentDetails | null | undefined
): CanonicalPaymentMethod | 'MIXTE' {
  const breakdown = normalizePaymentDetails(details)
  const activeMethods = PAYMENT_METHODS.filter(method => breakdown[method] > 0)
  return activeMethods.length > 1 ? 'MIXTE' : normalizePaymentMethod(activeMethods[0] ?? paymentMethod)
}

export function capCashSurplus(details: PaymentDetails, expectedTotal: number): PaymentBreakdown {
  const breakdown = normalizePaymentDetails(details)
  const paidTotal = paymentBreakdownTotal(breakdown)
  const surplus = Math.max(0, paidTotal - expectedTotal)
  if (surplus > 0 && breakdown['Espèces'] > 0) {
    breakdown['Espèces'] = Math.max(0, breakdown['Espèces'] - surplus)
  }
  return breakdown
}

export function isTransactionLabel(value: string): value is CanonicalTransactionLabelType {
  return TransactionLabelType.safeParse(value).success
}
