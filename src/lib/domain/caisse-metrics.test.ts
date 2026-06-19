import { describe, expect, it } from 'vitest'
import { calculateCaisseMetrics } from './caisse-metrics'

describe('caisse metrics domain helpers', () => {
  it('aggregates transaction labels, payment methods, and pending balances', () => {
    const metrics = calculateCaisseMetrics(
      [
        { amount: 5000, payment_method: 'Espèces', payment_details: null, label_type: 'ACOMPTE' },
        { amount: 3000, payment_method: 'MIXTE', payment_details: { Wave: 2000, especes: 1000 }, label_type: 'SOLDE' },
        { amount: 4000, payment_method: 'Orange Money', payment_details: null, label_type: 'VENTE_DIRECTE' },
      ],
      [
        { total_amount: 10000, deposit_amount: 5000, status: 'pending' },
        { total_amount: 8000, deposit_amount: 8000, status: 'completed' },
        { total_amount: 7000, deposit_amount: 0, status: 'cancelled' },
      ]
    )

    expect(metrics.totalAcomptes).toBe(5000)
    expect(metrics.totalSoldes).toBe(3000)
    expect(metrics.totalVentesDirectes).toBe(4000)
    expect(metrics.paymentBreakdown['Espèces']).toBe(6000)
    expect(metrics.paymentBreakdown.Wave).toBe(2000)
    expect(metrics.paymentBreakdown['Orange Money']).toBe(4000)
    expect(metrics.totalPending).toBe(5000)
    expect(metrics.completedOrders).toBe(1)
  })
})
