// src/lib/actions/session-utils.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, createSupabaseFake, hasOp, isSingle } from '@/test/supabase-fake'

const state = vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_cle_factice_123'
  process.env.REPORT_DEV_EMAIL = 'dev@test.local'
  process.env.ENVIRONMENT = 'development'
  return {
    client: null as unknown,
    send: null as unknown as (...args: unknown[]) => Promise<{ data: unknown; error: { message: string } | null }>,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.client }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => state.send(...args) }
  },
}))

import { closeSingleSession, type SessionResult } from './session-utils'

const SESSION: SessionResult = {
  id: 'session-1',
  organization_id: 'org-1',
  opened_at: '2026-11-14T07:00:00.000Z',
  opened_by: null,
  organizations: { name: 'Pâtisserie Démo', currency_symbol: 'FCFA' },
}

const managerProfiles = () => createSupabaseFake({
  profiles: call => (isSingle(call)
    ? { data: { id: 'manager-1', full_name: 'Koffi', role_slug: 'gerant' }, error: null }
    : { data: [], error: null }),
})

describe('closeSingleSession : périmètre des encaissements (D1)', () => {
  let fake: ReturnType<typeof createSupabaseFake>

  beforeEach(() => {
    fake = managerProfiles()
    state.client = fake.client
    state.send = vi.fn(async () => ({ data: { id: 'email-1' }, error: null }))
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

describe('closeSingleSession : e-mail de clôture', () => {
  let fake: ReturnType<typeof createSupabaseFake>

  beforeEach(() => {
    fake = managerProfiles()
    state.client = fake.client
    state.send = vi.fn(async () => ({ data: { id: 'email-1' }, error: null }))
  })

  it('envoie le nouveau rapport au destinataire résolu', async () => {
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result).toMatchObject({ success: true, emailSent: true, to: 'dev@test.local' })
    expect(state.send).toHaveBeenCalledTimes(1)
    const [payload] = (state.send as ReturnType<typeof vi.fn>).mock.calls[0] as [{ from: string; to: string[]; subject: string; html: string }]
    expect(payload.from).toBe("Pâtiss'App <onboarding@resend.dev>")
    expect(payload.to).toEqual(['dev@test.local'])
    expect(payload.subject).toMatch(/^📊 Rapport de journée — Pâtisserie Démo — /)
    expect(payload.html).toContain('Total encaiss')
    expect(payload.html).toContain('Détails de la caisse')
  })

  it("garde la session clôturée si l'envoi échoue", async () => {
    state.send = vi.fn(async () => { throw new Error('réseau') })
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result.success).toBe(true)
    expect(result.emailSent).toBe(false)
    const [update] = callsTo(fake.calls, 'sales_sessions')
    expect(hasOp(update, 'eq', ['status', 'open'])).toBe(true)
  })

  it("signale l'absence de destinataire sans échouer", async () => {
    fake = createSupabaseFake({ profiles: () => ({ data: null, error: null }) })
    state.client = fake.client
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result).toMatchObject({ success: true, emailSent: false, reason: 'No manager email found' })
    expect(state.send).not.toHaveBeenCalled()
  })
})
