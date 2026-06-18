const LOYALTY_AMOUNT_STEP = 1000

export function calculateLoyaltyPoints(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.floor(amount / LOYALTY_AMOUNT_STEP)
}

export function addLoyaltyPoints(current: number | null | undefined, points: number): number {
  return Math.max(0, Number(current ?? 0) + Math.max(0, points))
}

export function subtractLoyaltyPoints(current: number | null | undefined, points: number): number {
  return Math.max(0, Number(current ?? 0) - Math.max(0, points))
}
