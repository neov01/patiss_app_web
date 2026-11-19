// src/lib/reports/emails/render.tsx
import { render } from '@react-email/render'
import type { DailyReportData } from '../types'
import { DailyReportEmail } from './DailyReportEmail'

export function renderDailyReportEmail(data: DailyReportData): Promise<string> {
  return render(<DailyReportEmail data={data} />)
}
