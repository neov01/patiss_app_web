// src/app/api/cron/monthly-report/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const SECRET = 'secret-de-test-assez-long-123'
const call = (query = '', headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/cron/monthly-report${query}`, { headers }))

describe('GET /api/cron/monthly-report', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('refuse sans CRON_SECRET configuré', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call()).status).toBe(500)
  })

  it('refuse sans le bon jeton', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    expect((await call()).status).toBe(401)
    expect((await call('', { authorization: 'Bearer mauvais' })).status).toBe(401)
  })

  it('refuse un mois mal formé', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    const response = await call('?month=2026-13', { authorization: `Bearer ${SECRET}` })
    expect(response.status).toBe(400)
  })
})
