// src/lib/reports/send-monthly-report.test.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseFake, isSingle, opArg, type FakeCall } from '@/test/supabase-fake'
import { sendMonthlyReport, type ReportMailer } from './send-monthly-report'

const ORG = { id: 'org-1', name: 'Pâtisserie Démo', currency_symbol: 'FCFA' }

function activeOrgFake(withTransactions = true) {
  return createSupabaseFake({
    transactions: (call: FakeCall) => ({
      data: withTransactions && opArg(call, 'gte', 'created_at') === '2026-10-01T00:00:00.000Z'
        ? [{ amount: 1000, created_at: '2026-10-03T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false }]
        : [],
      error: null,
    }),
    customers: () => ({ data: null, error: null, count: 0 }),
    profiles: call => (isSingle(call) ? { data: { id: 'manager-1' }, error: null } : { data: [], error: null }),
  })
}

describe('sendMonthlyReport', () => {
  let send: ReturnType<typeof vi.fn>
  let mailer: ReportMailer

  beforeEach(() => {
    vi.stubEnv('ENVIRONMENT', 'development')
    vi.stubEnv('REPORT_DEV_EMAIL', 'dev@test.local')
    send = vi.fn(async () => ({ data: { id: 'e1' }, error: null }))
    mailer = { emails: { send } } as unknown as ReportMailer
  })
  afterEach(() => vi.unstubAllEnvs())

  it("envoie le récap avec une clé d'idempotence par organisation et par mois", async () => {
    const fake = activeOrgFake()
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: true })
    const [payload, options] = send.mock.calls[0] as [{ to: string[]; subject: string; html: string }, { idempotencyKey: string }]
    expect(payload.to).toEqual(['dev@test.local'])
    expect(payload.subject).toBe('📈 Récap du mois — Pâtisserie Démo — Octobre 2026')
    expect(payload.html).toContain('Récapitulatif du mois')
    expect(options).toEqual({ idempotencyKey: 'monthly-org-1-2026-10' })
  })

  it("n'envoie rien sans activité dans le mois", async () => {
    const fake = activeOrgFake(false)
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: false, reason: 'no-activity' })
    expect(send).not.toHaveBeenCalled()
  })

  it("utilise l'adresse de test avec une clé d'idempotence distincte", async () => {
    const fake = activeOrgFake()
    await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: 'test@test.local' })
    const [payload, options] = send.mock.calls[0] as [{ to: string[] }, { idempotencyKey: string }]
    expect(payload.to).toEqual(['test@test.local'])
    expect(options.idempotencyKey).toMatch(/^monthly-org-1-2026-10-test-\d+$/)
  })

  it("signale un échec d'envoi", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: 'quota' } })
    const fake = activeOrgFake()
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: false, reason: 'send-failed' })
  })

  it('signale Resend non configuré', async () => {
    const fake = activeOrgFake()
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: null, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: false, reason: 'resend-not-configured' })
  })
})
