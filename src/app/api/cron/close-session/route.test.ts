import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

describe('GET /api/cron/close-session', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('applique la même autorisation que POST', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-assez-long-123')
    const response = await GET(new NextRequest('http://localhost/api/cron/close-session'))
    expect(response.status).toBe(401)
  })
})
