import { describe, expect, it } from 'vitest'
import { callsTo, createSupabaseFake, hasOp, isSingle, opArg } from './supabase-fake'

type Chain = { [method: string]: (...args: unknown[]) => Chain } & PromiseLike<{ data: unknown }>

describe('createSupabaseFake', () => {
  it('enregistre les appels chaînés et renvoie la réponse du handler', async () => {
    const fake = createSupabaseFake({ orders: () => ({ data: [{ id: 'o1' }], error: null }) })
    const db = fake.client as unknown as { from: (table: string) => Chain }
    const result = await db.from('orders').select('id').eq('organization_id', 'org-1')
    expect(result.data).toEqual([{ id: 'o1' }])
    const [call] = callsTo(fake.calls, 'orders')
    expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(opArg(call, 'eq', 'organization_id')).toBe('org-1')
    expect(isSingle(call)).toBe(false)
  })

  it('renvoie aucune ligne par défaut', async () => {
    const fake = createSupabaseFake()
    const db = fake.client as unknown as { from: (table: string) => Chain }
    const result = await db.from('x')
    expect(result.data).toEqual([])
  })
})
