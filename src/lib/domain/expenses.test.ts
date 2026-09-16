import { describe, it, expect } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  CATEGORY_CONFIG,
  CreateExpenseSchema,
  CloseExpenseCycleSchema,
  CreateTopUpSchema,
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

  it('computes Sunday recharge amount accurately including negative balance', () => {
    const computeRecharge = (budgetTarget: number, currentBalance: number) => {
      return Math.max(0, budgetTarget - currentBalance)
    }

    // Standard case: 100k target, 35k remaining -> 65k recharge
    expect(computeRecharge(100000, 35000)).toBe(65000)

    // Deficit case: 100k target, -8k remaining -> 108k recharge
    expect(computeRecharge(100000, -8000)).toBe(108000)

    // Unspent case: 100k target, 100k remaining -> 0 recharge
    expect(computeRecharge(100000, 100000)).toBe(0)

    // Surplus case: 100k target, 120k remaining (extra top-ups) -> 0 recharge
    expect(computeRecharge(100000, 120000)).toBe(0)
  })

  it('validates closing payload', () => {
    const valid = {
      cycle_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      recharge_source: 'ventes_hebdo',
      new_budget: 100000,
    }
    const result = CloseExpenseCycleSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })
})
