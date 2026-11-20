// src/lib/reports/emails/DailyReportEmail.tsx
import { variationPct } from '../report-math'
import type { DailyReportData } from '../types'
import {
  C, Callout, DeltaPill, DetailRows, EmailShell, Hero, InfoBox, KpiTiles,
  PairedHourBars, RankedList, Section, StackedBar, Strong, type Kpi,
} from './components'
import { formatLongDate, formatMoney, formatNumber, formatQty, formatShortDate, formatSignedPct, formatTime, formatWeekday } from './format'

const DAY_MS = 86_400_000

export function dailyPreheader(d: DailyReportData): string {
  const parts = [`${formatMoney(d.totalRevenue, d.currency)} encaissés`]
  const vsYesterday = variationPct(d.totalRevenue, d.comparisons?.yesterday)
  if (vsYesterday !== null) parts.push(`${formatSignedPct(vsYesterday)} vs hier`)
  const vsLastWeek = variationPct(d.totalRevenue, d.comparisons?.lastWeek)
  if (vsLastWeek !== null && d.comparisons) parts.push(`${formatSignedPct(vsLastWeek)} vs ${formatWeekday(d.comparisons.lastWeekDate)} dernier`)
  return parts.join(', ')
}

export function dailySubject(d: DailyReportData): string {
  return `📊 Rapport de journée — ${d.orgName} — ${formatLongDate(d.reportDate)}`
}

export function DailyReportEmail({ data: d }: { data: DailyReportData }) {
  const c = d.currency
  const yesterdayDate = new Date(d.reportDate.getTime() - DAY_MS)
  const sales = d.sales
  const basket = sales && sales.count > 0 ? sales.revenue / sales.count : null
  const basketYesterday = sales && sales.countYesterday > 0 ? sales.revenueYesterday / sales.countYesterday : null
  const net = d.totalRevenue - d.expenses.total
  const hourly = d.hourly && d.hourly.today.some(v => v > 0) ? d.hourly : null
  const hasAttention = d.stockAlerts.length > 0 || d.pendingTotal > 0

  const tiles: Kpi[] = []
  if (sales) {
    tiles.push({ label: 'Ventes', value: formatNumber(sales.count), extra: <DeltaPill current={sales.count} reference={sales.countYesterday} label="vs hier" /> })
  }
  if (basket !== null) {
    tiles.push({ label: 'Panier moyen', value: formatMoney(basket, c), extra: <DeltaPill current={basket} reference={basketYesterday} label="vs hier" /> })
  }
  tiles.push({
    label: 'Solde net',
    value: formatMoney(net, c),
    extra: `CA − dépenses (${formatMoney(d.expenses.total, c)}, ${d.expenses.count} achat${d.expenses.count > 1 ? 's' : ''})`,
  })

  return (
    <EmailShell orgName={d.orgName} title="Rapport de journée" subtitle={formatLongDate(d.reportDate)}
      preheader={dailyPreheader(d)} currency={c} appUrl={d.appUrl}>
      <Hero
        label="Total encaissé aujourd'hui"
        amount={formatMoney(d.totalRevenue, c)}
        deltas={d.comparisons ? [
          { current: d.totalRevenue, reference: d.comparisons.yesterday, label: `vs hier, ${formatWeekday(yesterdayDate)} (${formatMoney(d.comparisons.yesterday, c)})` },
          { current: d.totalRevenue, reference: d.comparisons.lastWeek, label: `vs ${formatWeekday(d.comparisons.lastWeekDate)} dernier, ${formatShortDate(d.comparisons.lastWeekDate)} (${formatMoney(d.comparisons.lastWeek, c)})` },
        ] : []}
      />

      <Section title="L'essentiel"><KpiTiles tiles={tiles} /></Section>

      {hourly ? (
        <Section title="CA heure par heure" subtitle="Aujourd'hui comparé à hier">
          <PairedHourBars today={hourly.today} yesterday={hourly.yesterday} todayLabel="Aujourd'hui"
            yesterdayLabel={`Hier (${formatWeekday(yesterdayDate)})`} currency={c} />
        </Section>
      ) : null}

      {d.payments.length > 0 ? (
        <Section title="Modes de règlement"><StackedBar shares={d.payments} currency={c} /></Section>
      ) : null}

      {d.topProducts && d.topProducts.length > 0 ? (
        <Section title="Top 3 du jour"><RankedList items={d.topProducts} currency={c} /></Section>
      ) : null}

      {d.tomorrow ? (
        <Section title="À préparer pour demain">
          <InfoBox>
            {d.tomorrow.count === 0 ? 'Aucun retrait prévu demain.' : (
              <>
                <strong style={{ fontSize: 18, color: C.ink }}>{`${d.tomorrow.count} commande${d.tomorrow.count > 1 ? 's' : ''}`}</strong> à retirer demain
                <br />
                {d.tomorrow.firstPickupAt ? <>Premier retrait à <Strong>{formatTime(d.tomorrow.firstPickupAt)}</Strong> · </> : null}
                Reste à encaisser : <Strong>{formatMoney(d.tomorrow.remaining, c)}</Strong>
              </>
            )}
          </InfoBox>
        </Section>
      ) : null}

      {hasAttention ? (
        <Section title="Points d'attention">
          {d.stockAlerts.length > 0 ? (
            <Callout icon="⚠️">
              <strong>Stock bas :</strong>{' '}
              {d.stockAlerts.map(a => `${a.name} ${formatQty(a.current)} ${a.unit} (seuil ${formatQty(a.threshold)} ${a.unit})`).join(' · ')}
            </Callout>
          ) : null}
          {d.pendingTotal > 0 ? (
            <Callout icon="⏳"><strong>Soldes dus</strong> sur les commandes en cours : {formatMoney(d.pendingTotal, c)}</Callout>
          ) : null}
        </Section>
      ) : null}

      <Section title="Détails de la caisse">
        <DetailRows rows={[
          { label: 'Ventes directes', value: formatMoney(d.breakdown.ventesDirectes, c) },
          { label: 'Acomptes sur commandes', value: formatMoney(d.breakdown.acomptes, c) },
          { label: 'Soldes de commandes', value: formatMoney(d.breakdown.soldes, c) },
          { label: <>Caisse ouverte par <Strong>{d.caisse.openerName}</Strong> ({d.caisse.openerRole})</>, value: formatTime(d.caisse.openedAt) },
          { label: <>Caisse fermée par <Strong>{d.caisse.closerName}</Strong> ({d.caisse.closerRole})</>, value: formatTime(d.caisse.closedAt) },
          {
            label: "Saisies de commandes par l'équipe",
            value: d.team.length === 0 ? 'Aucune' : d.team
              .map(t => `${t.name} ${t.orders}${t.imports > 0 ? ` (+${t.imports} import${t.imports > 1 ? 's' : ''})` : ''}`)
              .join(' · '),
          },
        ]} />
      </Section>
    </EmailShell>
  )
}
