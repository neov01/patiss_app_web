import { describe, expect, it } from 'vitest'
import {
  capCashSurplus,
  getFinalPaymentMethod,
  normalizePaymentDetails,
  paymentBreakdownTotal,
} from './payments'

describe('payment domain helpers', () => {
  it('normalizes simple and legacy payment details', () => {
    expect(normalizePaymentDetails({ especes: 1000, mobile_money: 2500 })).toMatchObject({
      'Espèces': 1000,
      'Orange Money': 2500,
    })
  })

  it('detects mixed payments from active payment details', () => {
    expect(getFinalPaymentMethod('Espèces', { Espèces: 1000 })).toBe('Espèces')
    expect(getFinalPaymentMethod('Espèces', { Espèces: 1000, Wave: 500 })).toBe('MIXTE')
  })

  it('caps cash surplus while preserving non-cash methods', () => {
    const breakdown = capCashSurplus({ Espèces: 2000, Wave: 1000 }, 2500)

    expect(breakdown['Espèces']).toBe(1500)
    expect(breakdown.Wave).toBe(1000)
    expect(paymentBreakdownTotal(breakdown)).toBe(2500)
  })
})
