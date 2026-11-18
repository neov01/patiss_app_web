import type { HourlyBucket } from '@/lib/domain/dashboard-metrics'
import { ChartEmpty } from './ChartCard'

export default function HourlySalesBars({ buckets, currentHour, currency }: {
    buckets: HourlyBucket[]
    currentHour: number
    currency: string
}) {
    const active = buckets.filter(b => b.count > 0)
    if (active.length === 0) return <ChartEmpty>Aucune vente pour le moment aujourd&apos;hui.</ChartEmpty>

    const max = Math.max(...active.map(b => b.count), 1)
    const peak = active.reduce((best, b) => (b.count > best.count ? b : best), active[0])

    return (
        <ul aria-label={`Ventes par heure aujourd'hui, pic à ${peak.hour}h avec ${peak.count} vente(s)`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {active.map(b => {
                const isCurrent = b.hour === currentHour
                return (
                    <li key={b.hour} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', alignItems: 'center', gap: '10px', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{b.hour}h</span>
                        <span style={{ height: '10px', background: 'var(--color-well)', borderRadius: '9999px', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${(b.count / max) * 100}%`, borderRadius: '9999px', background: isCurrent ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 45%, transparent)' }} />
                        </span>
                        <span style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            <strong>{b.count}</strong> · {b.amount.toLocaleString('fr-FR')} {currency}
                            {isCurrent && <span style={{ marginLeft: '6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)' }}>en cours</span>}
                        </span>
                    </li>
                )
            })}
        </ul>
    )
}
