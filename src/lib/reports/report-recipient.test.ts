import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callsTo, createSupabaseFake, hasOp } from '@/test/supabase-fake'
import { resolveReportRecipient } from './report-recipient'

const manager = () => ({ data: { id: 'manager-1' }, error: null })

describe('resolveReportRecipient', () => {
  afterEach(() => vi.unstubAllEnvs())

  it("renvoie l'e-mail du gérant en production", async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    const fake = createSupabaseFake({ profiles: manager }, { userEmail: 'gerante@boutique.ci' })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBe('gerante@boutique.ci')
    const [call] = callsTo(fake.calls, 'profiles')
    expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(call, 'eq', ['role_slug', 'gerant'])).toBe(true)
    expect(hasOp(call, 'eq', ['is_active', true])).toBe(true)
  })

  it('renvoie REPORT_DEV_EMAIL hors production', async () => {
    vi.stubEnv('ENVIRONMENT', 'development')
    vi.stubEnv('REPORT_DEV_EMAIL', 'dev@test.local')
    const fake = createSupabaseFake({ profiles: manager })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBe('dev@test.local')
  })

  it('renvoie null sans REPORT_DEV_EMAIL hors production', async () => {
    vi.stubEnv('ENVIRONMENT', 'development')
    vi.stubEnv('REPORT_DEV_EMAIL', '')
    const fake = createSupabaseFake({ profiles: manager })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBeNull()
  })

  it('renvoie null sans gérant actif', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    const fake = createSupabaseFake({ profiles: () => ({ data: null, error: null }) })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBeNull()
  })

  it("renvoie null si le gérant n'a pas d'e-mail", async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    const fake = createSupabaseFake({ profiles: manager }, { userEmail: null })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBeNull()
  })
})
