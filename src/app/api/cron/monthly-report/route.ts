// src/app/api/cron/monthly-report/route.ts
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { monthBounds, previousMonthKey } from '@/lib/reports/report-math'
import { sendMonthlyReport, type MonthlyReportResult } from '@/lib/reports/send-monthly-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Récap mensuel. Appelée par le cron Vercel (GET + Authorization: Bearer CRON_SECRET).
 * Paramètres facultatifs : ?month=AAAA-MM, ?org=<uuid>, en-tête X-Test-Email (hors production).
 */
export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return Response.json({ error: 'Config missing' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  let monthKey: string
  try {
    monthKey = monthParam ? monthBounds(monthParam).key : previousMonthKey(new Date())
  } catch {
    return Response.json({ error: 'Paramètre month invalide (format AAAA-MM)' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return Response.json({ error: 'Config missing' }, { status: 500 })

  const admin = createClient(supabaseUrl, serviceKey)
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const testRecipient = process.env.ENVIRONMENT === 'production' ? null : request.headers.get('x-test-email')

  let query = admin.from('organizations').select('id, name, currency_symbol')
  const orgFilter = url.searchParams.get('org')
  if (orgFilter) query = query.eq('id', orgFilter)
  const { data: orgs, error } = await query
  if (error) {
    console.error('[monthly-report] lecture des organisations impossible')
    return Response.json({ error: 'Lecture des organisations impossible' }, { status: 500 })
  }

  // Une organisation à la fois : ménage les quotas Supabase et Resend.
  const results: MonthlyReportResult[] = []
  for (const org of orgs ?? []) {
    try {
      results.push(await sendMonthlyReport({ admin, resend, org, monthKey, overrideRecipient: testRecipient }))
    } catch {
      console.error('[monthly-report] échec du récap', { orgId: org.id })
      results.push({ orgId: org.id, sent: false, reason: 'error' })
    }
  }

  return Response.json({ month: monthKey, results })
}
