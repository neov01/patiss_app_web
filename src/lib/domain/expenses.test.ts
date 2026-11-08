import { describe, it, expect } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  CATEGORY_CONFIG,
  CreateExpenseSchema,
  WeeklyClosingSchema,
  CreateTopUpSchema,
  UpdateWeeklyBudgetSchema,
} from '@/lib/schemas/expenses'
import {
  computeWeeklyRecharge,
  sumCashFromTransactions,
  isWeeklyClosingDue,
  buildWeeklyBilan,
} from '@/lib/domain/expenses'

describe('Expenses Domain & Schemas', () => {
  it('should have a configuration entry for every expense category', () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(CATEGORY_CONFIG[cat]).toBeDefined()
      expect(CATEGORY_CONFIG[cat].key).toBe(cat)
      expect(CATEGORY_CONFIG[cat].shortLabel).toBeTruthy()
      expect(CATEGORY_CONFIG[cat].badgeBg).toBeTruthy()
      expect(CATEGORY_CONFIG[cat].badgeText).toBeTruthy()
    }
  })

  it('validates correct expense creation payload', () => {
    const valid = {
      cycle_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      amount: 15000,
      category: 'ingredients_urgents',
      description: 'Achat dépannage sucre',
      payment_method: 'cash',
    }
    const result = CreateExpenseSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('rejects zero or negative amount in expense creation', () => {
    const invalid = {
      cycle_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      amount: 0,
      category: 'emballages',
      description: 'Cartons',
    }
    const result = CreateExpenseSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  it('validates top up creation payload', () => {
    const valid = {
      cycle_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      amount: 20000,
      reason: 'Achat urgent vanille',
      source: 'caisse_du_jour',
    }
    const result = CreateTopUpSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('computes Sunday recharge amount accurately for 150 000 FCFA envelope', () => {
    // Cas standard : 150k cible, 35k restants -> 115k de recharge
    expect(computeWeeklyRecharge(150000, 35000)).toBe(115000)
    // Découvert : 150k cible, -8k restants -> 158k de recharge
    expect(computeWeeklyRecharge(150000, -8000)).toBe(158000)
    // Rien dépensé -> pas de recharge
    expect(computeWeeklyRecharge(150000, 150000)).toBe(0)
    // Excédent -> pas de recharge
    expect(computeWeeklyRecharge(150000, 180000)).toBe(0)
  })

  it('sums cash from transactions with and without outflows', () => {
    const txs = [
      { amount: 10000, payment_method: 'Espèces', payment_details: null },
      { amount: 5000, payment_method: 'Wave', payment_details: null },
      { amount: 8000, payment_method: 'Mixte', payment_details: { 'Espèces': 3000, Wave: 5000 } },
      { amount: -4000, payment_method: 'Espèces', payment_details: { 'Espèces': -4000 } },
    ]
    // Encaissements bruts : 10 000 + 3 000
    expect(sumCashFromTransactions(txs)).toBe(13000)
    // Espèces nettes (sorties incluses) : 13 000 - 4 000
    expect(sumCashFromTransactions(txs, { includeOutflows: true })).toBe(9000)
    expect(sumCashFromTransactions([])).toBe(0)
  })

  it('detects when the weekly bilan is due (last day of the cycle, UTC)', () => {
    const end = '2026-11-08T23:59:59.999Z' // dimanche
    expect(isWeeklyClosingDue(end, new Date('2026-11-07T20:00:00Z'))).toBe(false) // samedi soir
    expect(isWeeklyClosingDue(end, new Date('2026-11-08T00:00:00Z'))).toBe(true) // dimanche 00h
    expect(isWeeklyClosingDue(end, new Date('2026-11-08T21:30:00Z'))).toBe(true) // dimanche soir
    expect(isWeeklyClosingDue(end, new Date('2026-11-09T00:10:00Z'))).toBe(true) // juste après minuit
  })

  it('builds the weekly bilan (recharge, amount to remit, sufficiency)', () => {
    expect(buildWeeklyBilan({ budget: 150000, currentBalance: 50000, netWeekCash: 400000 })).toEqual({
      recharge: 100000,
      toRemit: 300000,
      isCashSufficient: true,
    })
    expect(buildWeeklyBilan({ budget: 150000, currentBalance: 20000, netWeekCash: 90000 })).toEqual({
      recharge: 130000,
      toRemit: 0,
      isCashSufficient: false,
    })
  })

  it('validates the weekly closing payload (cycle id only, no amount)', () => {
    expect(WeeklyClosingSchema.safeParse({ cycle_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }).success).toBe(true)
    expect(WeeklyClosingSchema.safeParse({ cycle_id: 'pas-un-uuid' }).success).toBe(false)
  })

  it('validates weekly budget modification schema', () => {
    const valid = {
      new_budget: 150000,
      adjust_active_cycle: true,
    }
    const result = UpdateWeeklyBudgetSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.new_budget).toBe(150000)
      expect(result.data.adjust_active_cycle).toBe(true)
    }

    const defaultAdjust = {
      new_budget: 160000,
    }
    const resultDefault = UpdateWeeklyBudgetSchema.safeParse(defaultAdjust)
    expect(resultDefault.success).toBe(true)
    if (resultDefault.success) {
      expect(resultDefault.data.adjust_active_cycle).toBe(false)
    }

    const invalidNegative = {
      new_budget: -1000,
    }
    expect(UpdateWeeklyBudgetSchema.safeParse(invalidNegative).success).toBe(false)

    const invalidZero = {
      new_budget: 0,
    }
    expect(UpdateWeeklyBudgetSchema.safeParse(invalidZero).success).toBe(false)
  })
})
