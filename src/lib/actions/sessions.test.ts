// src/lib/actions/sessions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, createSupabaseFake, hasOp, isSingle } from '@/test/supabase-fake'

const state = vi.hoisted(() => ({ client: null as unknown }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('./session-utils', () => ({ closeSingleSession: async () => ({ success: true }) }))
vi.mock('@/lib/auth/organization-context', () => ({
  AuthContextError: class extends Error {},
  requireOrgRole: async () => ({ supabase: state.client, organizationId: 'org-1', userId: 'user-1' }),
}))

import { getSessionClosingPreviewAction } from './sessions'

describe('getSessionClosingPreviewAction : mêmes filtres que la clôture', () => {
  let fake: ReturnType<typeof createSupabaseFake>

  beforeEach(() => {
    fake = createSupabaseFake({
      sales_sessions: call => (isSingle(call)
        ? { data: { id: 's1', opened_at: '2026-11-14T07:00:00.000Z' }, error: null }
        : { data: [], error: null }),
    })
    state.client = fake.client
  })

  it('exclut les transactions historiques et celles datées après maintenant', async () => {
    const result = await getSessionClosingPreviewAction()
    expect(result.success).toBe(true)
    const [tx] = callsTo(fake.calls, 'transactions')
    expect(hasOp(tx, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(tx, 'eq', ['is_historical', false])).toBe(true)
    expect(tx.ops.some(([op, args]) => op === 'lte' && args[0] === 'created_at')).toBe(true)
  })

  it('exclut les commandes historiques', async () => {
    await getSessionClosingPreviewAction()
    const [orders] = callsTo(fake.calls, 'orders')
    expect(hasOp(orders, 'eq', ['is_historical', false])).toBe(true)
  })
})
