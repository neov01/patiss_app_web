import { describe, it, expect } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  CATEGORY_CONFIG,
  CreateExpenseSchema,
  CloseExpenseCycleSchema,
  CreateTopUpSchema,
  UpdateWeeklyBudgetSchema,
} from '@/lib/schemas/expenses'

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
    const computeRecharge = (budgetTarget: number, currentBalance: number) => {
      return Math.max(0, budgetTarget - currentBalance)
    }

    // Standard case: 150k target, 35k remaining -> 115k recharge
    expect(computeRecharge(150000, 35000)).toBe(115000)

    // Deficit case: 150k target, -8k remaining -> 158k recharge
    expect(computeRecharge(150000, -8000)).toBe(158000)

    // Unspent case: 150k target, 150k remaining -> 0 recharge
    expect(computeRecharge(150000, 150000)).toBe(0)

    // Surplus case: 150k target, 180k remaining -> 0 recharge
    expect(computeRecharge(150000, 180000)).toBe(0)
  })

  it('validates and applies 150 000 FCFA default for closing payload', () => {
    const validWithExplicit = {
      cycle_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      recharge_source: 'ventes_hebdo',
      new_budget: 180000,
    }
    const resultWithExplicit = CloseExpenseCycleSchema.safeParse(validWithExplicit)
    expect(resultWithExplicit.success).toBe(true)
    if (resultWithExplicit.success) {
      expect(resultWithExplicit.data.new_budget).toBe(180000)
    }

    const validWithDefault = {
      cycle_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      recharge_source: 'ventes_hebdo',
    }
    const resultWithDefault = CloseExpenseCycleSchema.safeParse(validWithDefault)
    expect(resultWithDefault.success).toBe(true)
    if (resultWithDefault.success) {
      expect(resultWithDefault.data.new_budget).toBe(150000)
    }
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
