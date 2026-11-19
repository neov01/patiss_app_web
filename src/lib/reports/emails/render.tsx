// src/lib/reports/emails/render.tsx
import { render } from '@react-email/render'
import type { DailyReportData, MonthlyReportData } from '../types'
import { DailyReportEmail } from './DailyReportEmail'
import { MonthlyReportEmail } from './MonthlyReportEmail'

export function renderDailyReportEmail(data: DailyReportData): Promise<string> {
  return render(<DailyReportEmail data={data} />)
}

export function renderMonthlyReportEmail(data: MonthlyReportData): Promise<string> {
  return render(<MonthlyReportEmail data={data} />)
}
