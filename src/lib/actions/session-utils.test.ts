import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, createSupabaseFake, hasOp } from '@/test/supabase-fake'

const state = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.client }))

import { closeSingleSession, type SessionResult } from './session-utils'

const SESSION: SessionResult = {
  id: 'session-1',
  organization_id: 'org-1',
  opened_at: '2026-11-14T07:00:00.000Z',
  opened_by: null,
  organizations: { name: 'Pâtisserie Démo', currency_symbol: 'FCFA' },
}

describe('closeSingleSession : périmètre des encaissements (D1)', () => {
  let fake: ReturnType<typeof createSupabaseFake>

  beforeEach(() => {
    fake = createSupabaseFake()
    state.client = fake.client
  })

  it('exclut les transactions historiques et celles datées après la clôture', async () => {
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result.success).toBe(true)
    const [tx] = callsTo(fake.calls, 'transactions')
    expect(hasOp(tx, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(tx, 'eq', ['is_historical', false])).toBe(true)
    expect(tx.ops.some(([op, args]) => op === 'lte' && args[0] === 'created_at')).toBe(true)
  })

  it('exclut les commandes historiques du calcul des soldes dus', async () => {
    await closeSingleSession('session-1', null, SESSION)
    const [orders] = callsTo(fake.calls, 'orders')
    expect(hasOp(orders, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(orders, 'eq', ['is_historical', false])).toBe(true)
  })
})
