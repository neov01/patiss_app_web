import { describe, expect, it } from 'vitest'
import { addLoyaltyPoints, calculateLoyaltyPoints, subtractLoyaltyPoints } from './loyalty'

describe('loyalty domain helpers', () => {
  it('calculates one point per 1000 FCFA', () => {
    expect(calculateLoyaltyPoints(999)).toBe(0)
    expect(calculateLoyaltyPoints(1000)).toBe(1)
    expect(calculateLoyaltyPoints(2500)).toBe(2)
  })

  it('adds and subtracts points safely', () => {
    expect(addLoyaltyPoints(null, 4)).toBe(4)
    expect(subtractLoyaltyPoints(3, 10)).toBe(0)
  })
})
