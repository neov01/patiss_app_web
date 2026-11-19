// src/lib/reports/emails/components.tsx
import type { CSSProperties, ReactNode } from 'react'
import type { CanonicalPaymentMethod } from '@/lib/domain/payments'
import { variationPct } from '../report-math'
import type { DayTotal, PaymentShare, RankedProduct } from '../types'
import { formatMoney, formatNumber, formatSignedPct } from './format'

export const C = {
  terra: '#815431',
  terraLight: '#C08A63',
  sage: '#4B6450',
  sageMist: '#CDEAD0',
  teal: '#2F6671',
  tealSoft: '#699EAA',
  canvas: '#EDE6DC',
  well: '#F5EEE4',
  ink: '#1A1C1A',
  muted: '#51443C',
  border: '#D5C3B8',
  danger: '#BA1A1A',
  dangerSoft: '#FFDAD6',
  pending: '#FEF3C7',
  pendingInk: '#7A4A12',
  headerSub: '#F1DCC8',
} as const

const FONT = "Inter,'Helvetica Neue',Arial,sans-serif"
const HFONT = "Manrope,Inter,'Helvetica Neue',Arial,sans-serif"

export const PAYMENT_COLORS: Record<CanonicalPaymentMethod, string> = {
  'Espèces': C.sage,
  Wave: C.tealSoft,
  'Orange Money': '#E07B39',
  'MTN MOMO': '#E2B33C',
  'Moov Money': C.teal,
}

export const PAYMENT_LABELS: Record<CanonicalPaymentMethod, string> = {
  'Espèces': 'Espèces',
  Wave: 'Wave',
  'Orange Money': 'Orange Money',
  'MTN MOMO': 'MTN MoMo',
  'Moov Money': 'Moov Money',
}

const labelStyle: CSSProperties = {
  margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase',
}
const rowCell: CSSProperties = { padding: '6px 0', borderBottom: `1px solid ${C.well}` }

function Tbl({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={style}>
      <tbody>{children}</tbody>
    </table>
  )
}

function Swatch({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color }} />
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: C.ink }}>{children}</strong>
}

export function Spacer({ h }: { h: number }) {
  return <div style={{ height: h, lineHeight: `${h}px` }}>&nbsp;</div>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p style={{ ...labelStyle, margin: '14px 0 6px', letterSpacing: 0.6 }}>{children}</p>
}

export function EmailShell({
  orgName, title, subtitle, preheader, currency, appUrl, children,
}: {
  orgName: string
  title: string
  subtitle: string
  preheader: string
  currency: string
  appUrl: string | null
  children: ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
      </head>
      <body style={{ margin: 0, padding: 0, background: C.canvas, fontFamily: FONT, color: C.ink }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>{preheader}</div>
        <Tbl style={{ background: C.canvas }}>
          <tr>
            <td style={{ padding: '24px 12px', textAlign: 'center' }}>
              <table width={600} cellPadding={0} cellSpacing={0} role="presentation"
                style={{ maxWidth: 600, width: '100%', margin: '0 auto', background: '#FFFFFF', borderRadius: 16, overflow: 'hidden', textAlign: 'left' }}>
                <tbody>
                  <tr>
                    <td style={{ background: C.terra, padding: '22px 28px' }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.headerSub, textTransform: 'uppercase' }}>{orgName}</p>
                      <h1 style={{ margin: '4px 0 0', fontFamily: HFONT, fontSize: 22, fontWeight: 800, color: '#FFFFFF' }}>{title}</h1>
                      <p style={{ margin: '4px 0 0', fontSize: 14, color: C.headerSub }}>{subtitle}</p>
                    </td>
                  </tr>
                  {children}
                  <tr>
                    <td style={{ padding: 28 }}>
                      <Tbl style={{ borderTop: `1px solid ${C.border}` }}>
                        <tr>
                          <td style={{ paddingTop: 14, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
                            Rapport généré automatiquement par <strong>{"Pâtiss'App"}</strong> · Montants en {currency}
                            {appUrl ? (
                              <>
                                <br />
                                <a href={appUrl} style={{ color: C.terra, fontWeight: 700 }}>Ouvrir le tableau de bord →</a>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      </Tbl>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </Tbl>
      </body>
    </html>
  )
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <tr>
      <td style={{ padding: '24px 28px 0' }}>
        <h2 style={{ margin: 0, fontFamily: HFONT, fontSize: 16, fontWeight: 800, color: C.ink }}>{title}</h2>
        {subtitle ? <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{subtitle}</p> : null}
        <Spacer h={12} />
        {children}
      </td>
    </tr>
  )
}

export function DeltaPill({ current, reference, label }: { current: number; reference: number | null | undefined; label: string }) {
  const pct = variationPct(current, reference)
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span>
      <span style={{
        display: 'inline-block', background: up ? C.sageMist : C.dangerSoft, color: up ? C.sage : C.danger,
        fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      }}>
        {up ? '▲' : '▼'} {formatSignedPct(pct)}
      </span>
      <span style={{ fontSize: 12, color: C.muted }}> {label}</span>
    </span>
  )
}

export type HeroDelta = { current: number; reference: number | null; label: string }

export function Hero({ label, amount, deltas, note }: { label: string; amount: string; deltas: HeroDelta[]; note?: ReactNode }) {
  const visible = deltas.filter(d => variationPct(d.current, d.reference) !== null)
  return (
    <tr>
      <td style={{ padding: '24px 28px 0' }}>
        <p style={labelStyle}>{label}</p>
        <p style={{ margin: '4px 0 10px', fontFamily: HFONT, fontSize: 40, fontWeight: 800, color: C.terra, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{amount}</p>
        {visible.map(d => (
          <p key={d.label} style={{ margin: '0 0 6px' }}>
            <DeltaPill current={d.current} reference={d.reference} label={d.label} />
          </p>
        ))}
        {note ? <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted }}>{note}</p> : null}
      </td>
    </tr>
  )
}

export type Kpi = { label: string; value: string; extra?: ReactNode }

export function KpiTiles({ tiles }: { tiles: Kpi[] }) {
  const width = `${Math.floor(100 / tiles.length)}%`
  return (
    <Tbl>
      <tr>
        {tiles.map((tile, i) => (
          <td key={tile.label} width={width} style={{ paddingLeft: i === 0 ? 0 : 8, verticalAlign: 'top' }}>
            <Tbl style={{ background: C.well, borderRadius: 12 }}>
              <tr>
                <td style={{ padding: 14 }}>
                  <p style={{ ...labelStyle, fontSize: 11, letterSpacing: 0.6 }}>{tile.label}</p>
                  <p style={{ margin: '6px 0', fontFamily: HFONT, fontSize: 20, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap' }}>{tile.value}</p>
                  {tile.extra ? <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: C.muted }}>{tile.extra}</p> : null}
                </td>
              </tr>
            </Tbl>
          </td>
        ))}
      </tr>
    </Tbl>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <p style={{ margin: '10px 0 0' }}>
      {items.map(item => (
        <span key={item.label} style={{ display: 'inline-block', marginRight: 14, fontSize: 12, color: C.muted }}>
          <Swatch color={item.color} />&nbsp;{item.label}
        </span>
      ))}
    </p>
  )
}

export function StackedBar({ shares, currency }: { shares: PaymentShare[]; currency: string }) {
  const total = shares.reduce((sum, share) => sum + share.amount, 0)
  return (
    <>
      <Tbl style={{ borderRadius: 6, overflow: 'hidden' }}>
        <tr>
          {shares.map(share => (
            <td key={share.method} width={`${((share.amount / total) * 100).toFixed(1)}%`}
              style={{ background: PAYMENT_COLORS[share.method], height: 18, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
          ))}
        </tr>
      </Tbl>
      <Tbl style={{ marginTop: 10, fontSize: 13, color: C.muted }}>
        {shares.map(share => (
          <tr key={share.method}>
            <td style={rowCell}><Swatch color={PAYMENT_COLORS[share.method]} />&nbsp; {PAYMENT_LABELS[share.method]}</td>
            <td style={{ ...rowCell, textAlign: 'right', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{formatMoney(share.amount, currency)}</td>
            <td style={{ ...rowCell, textAlign: 'right', width: 52 }}>{share.pct}&nbsp;%</td>
          </tr>
        ))}
      </Tbl>
    </>
  )
}

function VerticalBar({ value, max, maxHeight, color, width }: { value: number; max: number; maxHeight: number; color: string; width?: number }) {
  if (value <= 0) return null
  const height = Math.max(2, Math.round((value / max) * maxHeight))
  return (
    <table cellPadding={0} cellSpacing={0} role="presentation" width={width ? undefined : '100%'}>
      <tbody>
        <tr>
          <td style={{ width, height, background: color, fontSize: 0, lineHeight: 0, borderRadius: '2px 2px 0 0' }}>&nbsp;</td>
        </tr>
      </tbody>
    </table>
  )
}

export function PairedHourBars({
  today, yesterday, todayLabel, yesterdayLabel, currency,
}: { today: number[]; yesterday: number[]; todayLabel: string; yesterdayLabel: string; currency: string }) {
  const active = today.map((value, hour) => (value > 0 || yesterday[hour] > 0 ? hour : -1)).filter(hour => hour >= 0)
  const from = Math.min(...active)
  const to = Math.max(...active)
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const max = Math.max(1, ...hours.map(h => Math.max(today[h], yesterday[h])))
  const peak = hours.reduce((best, h) => (today[h] > today[best] ? h : best), hours[0])
  const H = 96
  return (
    <>
      <Tbl style={{ borderBottom: `1px solid ${C.border}` }}>
        <tr style={{ height: H }}>
          {hours.map(h => (
            <td key={h} style={{ padding: '0 2px', verticalAlign: 'bottom' }}>
              <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '0 auto' }}>
                <tbody>
                  <tr>
                    <td style={{ verticalAlign: 'bottom' }}><VerticalBar value={yesterday[h]} max={max} maxHeight={H} color={C.border} width={9} /></td>
                    <td style={{ width: 2, fontSize: 0 }}>&nbsp;</td>
                    <td style={{ verticalAlign: 'bottom' }}><VerticalBar value={today[h]} max={max} maxHeight={H} color={C.terra} width={9} /></td>
                  </tr>
                </tbody>
              </table>
            </td>
          ))}
        </tr>
      </Tbl>
      <Tbl>
        <tr>
          {hours.map(h => (
            <td key={h} style={{ paddingTop: 4, fontSize: 10, color: C.muted, textAlign: 'center' }}>{h}h</td>
          ))}
        </tr>
      </Tbl>
      <Legend items={[{ label: todayLabel, color: C.terra }, { label: yesterdayLabel, color: C.border }]} />
      <p style={{ margin: '8px 0 0', fontSize: 13, color: C.muted }}>
        Heure de pointe : <Strong>{`${peak}h–${peak + 1}h`}</Strong> ({formatMoney(today[peak], currency)}).
      </p>
    </>
  )
}

export function DayBars({ days }: { days: DayTotal[] }) {
  const max = Math.max(1, ...days.map(d => d.amount))
  const best = days.reduce((top, d) => (d.amount > top.amount ? d : top), days[0])
  const labelled = new Set([1, 5, 10, 15, 20, 25, days.length])
  const H = 110
  return (
    <>
      <Tbl style={{ borderBottom: `1px solid ${C.border}`, tableLayout: 'fixed' }}>
        <tr style={{ height: H }}>
          {days.map(d => {
            const color = d.day === best.day && best.amount > 0 ? C.sage : d.weekday >= 5 ? C.terra : C.terraLight
            return (
              <td key={d.day} style={{ padding: '0 1px', verticalAlign: 'bottom' }}>
                <VerticalBar value={d.amount} max={max} maxHeight={H} color={color} />
              </td>
            )
          })}
        </tr>
      </Tbl>
      <Tbl style={{ tableLayout: 'fixed' }}>
        <tr>
          {days.map(d => (
            <td key={d.day} style={{ paddingTop: 4, fontSize: 10, color: C.muted, textAlign: 'center' }}>
              {labelled.has(d.day) ? d.day : ' '}
            </td>
          ))}
        </tr>
      </Tbl>
      <Legend items={[
        { label: 'Semaine', color: C.terraLight },
        { label: 'Week-end', color: C.terra },
        { label: 'Meilleur jour', color: C.sage },
      ]} />
    </>
  )
}

const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function HorizontalBar({ pct, color, height }: { pct: number; color: string; height: number }) {
  return (
    <Tbl>
      <tr>
        <td width={`${pct}%`} style={{ background: color, height, fontSize: 0, lineHeight: 0, borderRadius: 3 }}>&nbsp;</td>
        <td style={{ fontSize: 0 }}>&nbsp;</td>
      </tr>
    </Tbl>
  )
}

export function WeekdayBars({ averages, currency }: { averages: (number | null)[]; currency: string }) {
  const max = Math.max(1, ...averages.map(a => a ?? 0))
  return (
    <Tbl>
      {averages.map((avg, i) => (avg === null ? null : (
        <tr key={WEEKDAY_SHORT[i]}>
          <td style={{ width: 36, padding: '4px 0', fontSize: 12, color: C.muted, fontWeight: 700 }}>{WEEKDAY_SHORT[i]}</td>
          <td style={{ padding: '4px 0' }}>
            <HorizontalBar pct={Math.max(2, Math.round((avg / max) * 100))} color={i >= 5 ? C.terra : C.terraLight} height={16} />
          </td>
          <td style={{ width: 110, padding: '4px 0 4px 10px', fontSize: 12, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', textAlign: 'right' }}>
            {formatMoney(avg, currency)}
          </td>
        </tr>
      )))}
    </Tbl>
  )
}

export function RankedList({ items, currency }: { items: RankedProduct[]; currency: string }) {
  const max = Math.max(1, ...items.map(item => item.amount))
  return (
    <Tbl>
      {items.map((item, index) => (
        <tr key={item.name}>
          <td style={{ width: 22, padding: '7px 0', fontWeight: 800, color: C.terra, fontSize: 13, verticalAlign: 'top' }}>{index + 1}</td>
          <td style={{ padding: '7px 0', fontSize: 13, color: C.ink }}>
            <strong>{item.name}</strong>{' '}
            <span style={{ color: C.muted, fontSize: 12 }}>{`· ${formatNumber(item.quantity)} vendu${item.quantity > 1 ? 's' : ''}`}</span>
            <div style={{ marginTop: 4 }}>
              <HorizontalBar pct={Math.max(2, Math.round((item.amount / max) * 100))} color={C.terraLight} height={6} />
            </div>
          </td>
          <td style={{ padding: '7px 0 7px 12px', fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', textAlign: 'right', verticalAlign: 'top' }}>
            {formatMoney(item.amount, currency)}
          </td>
        </tr>
      ))}
    </Tbl>
  )
}

export function Callout({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Tbl style={{ marginBottom: 8 }}>
      <tr>
        <td style={{ background: C.pending, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.pendingInk, lineHeight: 1.5 }}>
          {icon}&nbsp; {children}
        </td>
      </tr>
    </Tbl>
  )
}

export function InfoBox({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <Tbl style={{ background: C.well, borderRadius: 12, borderLeft: accent ? `4px solid ${accent}` : undefined }}>
      <tr>
        <td style={{ padding: '14px 16px', fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{children}</td>
      </tr>
    </Tbl>
  )
}

export function DetailRows({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <Tbl style={{ fontSize: 13, color: C.muted }}>
      {rows.map((row, i) => (
        <tr key={i}>
          <td style={rowCell}>{row.label}</td>
          <td style={{ ...rowCell, textAlign: 'right', color: C.ink, fontWeight: 700 }}>{row.value}</td>
        </tr>
      ))}
    </Tbl>
  )
}
