// src/lib/reports/send-monthly-report.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Resend } from 'resend'
import { REPORT_FROM } from './constants'
import { monthlySubject } from './emails/MonthlyReportEmail'
import { renderMonthlyReportEmail } from './emails/render'
import { loadMonthlyReportData, type OrgSummary } from './monthly-report-data'
import { resolveReportRecipient } from './report-recipient'

export type MonthlyReportResult = {
  orgId: string
  sent: boolean
  reason?: 'no-activity' | 'no-recipient' | 'resend-not-configured' | 'send-failed' | 'error'
}

export type ReportMailer = { emails: { send: Resend['emails']['send'] } }

export async function sendMonthlyReport(args: {
  admin: SupabaseClient
  resend: ReportMailer | null
  org: OrgSummary
  monthKey: string
  overrideRecipient: string | null
}): Promise<MonthlyReportResult> {
  const { admin, resend, org, monthKey, overrideRecipient } = args

  const data = await loadMonthlyReportData(admin, org, monthKey)
  if (!data) return { orgId: org.id, sent: false, reason: 'no-activity' }

  const to = overrideRecipient ?? (await resolveReportRecipient(admin, org.id))
  if (!to) return { orgId: org.id, sent: false, reason: 'no-recipient' }
  if (!resend) return { orgId: org.id, sent: false, reason: 'resend-not-configured' }

  const html = await renderMonthlyReportEmail(data)
  // Resend ignore un second envoi avec la même clé pendant 24 h : pas de doublon si le cron se répète.
  const idempotencyKey = overrideRecipient
    ? `monthly-${org.id}-${monthKey}-test-${Date.now()}`
    : `monthly-${org.id}-${monthKey}`
  const { error } = await resend.emails.send(
    { from: REPORT_FROM, to: [to], subject: monthlySubject(data), html },
    { idempotencyKey }
  )
  if (error) return { orgId: org.id, sent: false, reason: 'send-failed' }
  return { orgId: org.id, sent: true }
}
