// scripts/render-report-previews.tsx
// Génère des aperçus HTML des deux e-mails à partir des données fictives.
// Usage : npx -y tsx scripts/render-report-previews.tsx
import { mkdirSync, writeFileSync } from 'node:fs'
import { dailyFixture, monthlyFixture } from '../src/lib/reports/emails/fixtures'
import { renderDailyReportEmail, renderMonthlyReportEmail } from '../src/lib/reports/emails/render'

async function main() {
  const dir = 'docs/superpowers/mockups'
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/rendu-quotidien.html`, await renderDailyReportEmail(dailyFixture))
  writeFileSync(`${dir}/rendu-mensuel.html`, await renderMonthlyReportEmail(monthlyFixture))
  console.log('Aperçus écrits dans', dir)
}

main()
