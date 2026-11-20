// src/lib/reports/emails/MonthlyReportEmail.tsx
import type { ReactNode } from 'react'
import { monthLabel, monthName } from '../report-insights'
import { shiftMonth, variationPct } from '../report-math'
import type { MonthlyReportData } from '../types'
import {
  C, DayBars, DeltaPill, DetailRows, EmailShell, Eyebrow, Hero, InfoBox, KpiTiles,
  RankedList, Section, Spacer, StackedBar, Strong, WeekdayBars,
} from './components'
import { capitalize, formatMoney, formatNumber, formatSignedPct } from './format'

const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

export function monthlyPreheader(d: MonthlyReportData): string {
  const base = `${formatMoney(d.revenue, d.currency)} en ${monthName(d.month)}`
  const pct = variationPct(d.revenue, d.revenuePrev)
  return pct === null ? base : `${base}, ${formatSignedPct(pct)} vs ${monthName(shiftMonth(d.month, -1))}`
}

export function monthlySubject(d: MonthlyReportData): string {
  return `📈 Récap du mois — ${d.orgName} — ${capitalize(monthLabel(d.month))}`
}

function weekdaySentence(d: MonthlyReportData): ReactNode {
  const open = d.weekdayAverages
    .map((avg, i) => ({ avg, i }))
    .filter((entry): entry is { avg: number; i: number } => entry.avg !== null && entry.avg > 0)
  if (open.length < 2 || d.revenue <= 0) return null
  const strongest = open.reduce((max, e) => (e.avg > max.avg ? e : max))
  const weakest = open.reduce((min, e) => (e.avg < min.avg ? e : min))
  const ratio = (strongest.avg / weakest.avg).toFixed(1).replace('.', ',')
  const weekendShare = Math.round((d.days.filter(day => day.weekday >= 5).reduce((s, day) => s + day.amount, 0) / d.revenue) * 100)
  return (
    <p style={{ margin: '8px 0 0', fontSize: 13, color: C.muted }}>
      {`Un ${WEEKDAY_NAMES[strongest.i]} rapporte `}<Strong>{`${ratio}×`}</Strong>{` plus qu'un ${WEEKDAY_NAMES[weakest.i]}. Le week-end pèse `}<Strong>{`${weekendShare}\u00a0%`}</Strong> du CA.
    </p>
  )
}

export function MonthlyReportEmail({ data: d }: { data: MonthlyReportData }) {
  const c = d.currency
  const previousKey = shiftMonth(d.month, -1)
  const lastYearKey = shiftMonth(d.month, -12)
  const vsPrevious = `vs ${monthName(previousKey)}`
  const best = d.days.reduce((top, day) => (day.amount > top.amount ? day : top), d.days[0])
  const average = d.openDays > 0 ? d.revenue / d.openDays : 0
  const basket = d.sales.count > 0 ? d.revenue / d.sales.count : null
  const basketPrev = d.sales.countPrev > 0 ? d.revenuePrev / d.sales.countPrev : null
  const net = d.revenue - d.expenses.total
  const netPrev = d.revenuePrev - d.expenses.totalPrev
  const pill = (current: number, reference: number | null): ReactNode =>
    variationPct(current, reference) === null ? '—' : <DeltaPill current={current} reference={reference} label={vsPrevious} />

  return (
    <EmailShell orgName={d.orgName} title="Récapitulatif du mois"
      subtitle={`${capitalize(monthLabel(d.month))} · ${d.openDays} jour${d.openDays > 1 ? 's' : ''} d'ouverture`}
      preheader={monthlyPreheader(d)} currency={c} appUrl={d.appUrl}>
      <Hero
        label={`CA du mois ${/^[aeiouéèh]/i.test(monthName(d.month)) ? "d'" : 'de '}${monthName(d.month)}`}
        amount={formatMoney(d.revenue, c)}
        deltas={[
          { current: d.revenue, reference: d.revenuePrev, label: `${vsPrevious} (${formatMoney(d.revenuePrev, c)})` },
          { current: d.revenue, reference: d.revenueLastYear, label: `vs ${monthLabel(lastYearKey)} (${formatMoney(d.revenueLastYear, c)})` },
        ]}
        note={d.historicalRevenue > 0 ? `dont ${formatMoney(d.historicalRevenue, c)} saisis a posteriori (commandes papier importées)` : undefined}
      />

      {d.insights.length > 0 ? (
        <Section title="En bref">
          <InfoBox accent={C.sage}>
            {d.insights.map(sentence => <span key={sentence}>• {sentence}<br /></span>)}
          </InfoBox>
        </Section>
      ) : null}

      <Section title="L'essentiel">
        <KpiTiles tiles={[
          { label: 'Ventes', value: formatNumber(d.sales.count), extra: pill(d.sales.count, d.sales.countPrev) },
          { label: 'Panier moyen', value: basket === null ? '—' : formatMoney(basket, c), extra: basket === null ? undefined : pill(basket, basketPrev) },
          { label: 'Commandes', value: formatNumber(d.orders.count), extra: pill(d.orders.count, d.orders.countPrev) },
        ]} />
        <Spacer h={8} />
        <KpiTiles tiles={[
          { label: 'Dépenses', value: formatMoney(d.expenses.total, c), extra: pill(d.expenses.total, d.expenses.totalPrev) },
          { label: 'Solde net', value: formatMoney(net, c), extra: pill(net, netPrev > 0 ? netPrev : null) },
        ]} />
      </Section>

      <Section title="CA jour par jour">
        <DayBars days={d.days} />
        {best && best.amount > 0 ? (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Meilleur jour : <Strong>{`${WEEKDAY_NAMES[best.weekday]} ${best.day} ${monthName(d.month)}`}</Strong> ({formatMoney(best.amount, c)})
            {' '}· Moyenne : <Strong>{formatMoney(average, c)}</Strong> par jour d&apos;ouverture
          </p>
        ) : null}
      </Section>

      <Section title="Quels jours portent la boutique ?" subtitle="CA moyen par jour d'ouverture">
        <WeekdayBars averages={d.weekdayAverages} currency={c} />
        {weekdaySentence(d)}
      </Section>

      {d.payments.length > 0 ? (
        <Section title="Modes de règlement"><StackedBar shares={d.payments} currency={c} /></Section>
      ) : null}

      {d.topProducts.length > 0 ? (
        <Section title="Top 10 produits" subtitle="Classés par CA, ventes en caisse">
          <RankedList items={d.topProducts} currency={c} />
          {d.flopProducts.length > 0 ? (
            <>
              <Eyebrow>Ventes les plus faibles</Eyebrow>
              <DetailRows rows={d.flopProducts.map(p => ({
                label: p.name,
                value: `${formatNumber(p.quantity)} vendu${p.quantity > 1 ? 's' : ''} · ${formatMoney(p.amount, c)}`,
              }))} />
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="Commandes et clients">
        <KpiTiles tiles={[
          { label: 'Nouveaux clients', value: formatNumber(d.customers.newCount) },
          { label: 'Clients revenus', value: formatNumber(d.customers.returningCount), extra: '2 commandes ou plus' },
        ]} />
        {d.customers.top.length > 0 ? (
          <>
            <Eyebrow>Top 5 clients fidèles</Eyebrow>
            <DetailRows rows={d.customers.top.map(t => ({
              label: <Strong>{t.name}</Strong>,
              value: `${t.orders} commande${t.orders > 1 ? 's' : ''} · ${formatMoney(t.amount, c)}`,
            }))} />
          </>
        ) : null}
      </Section>
    </EmailShell>
  )
}
