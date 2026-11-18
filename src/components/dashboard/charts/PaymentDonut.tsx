import type { PaymentSlice } from '@/lib/domain/dashboard-metrics'
import type { CanonicalPaymentMethod } from '@/lib/domain/payments'
import { ChartEmpty } from './ChartCard'

const COLORS: Record<CanonicalPaymentMethod, string> = {
    'Espèces': 'var(--color-primary)',
    'Orange Money': '#EA580C',
    Wave: '#1D93D2',
    'MTN MOMO': '#F2C822',
    'Moov Money': '#009F4D',
}

const RADIUS = 60
const STROKE = 22
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function PaymentDonut({ slices, currency }: { slices: PaymentSlice[]; currency: string }) {
    if (slices.length === 0) return <ChartEmpty>Aucun encaissement sur la période.</ChartEmpty>

    const total = slices.reduce((sum, s) => sum + s.amount, 0)
    const arcs = slices.map((s, i) => {
        const length = (s.pct / 100) * CIRCUMFERENCE
        const offset = slices.slice(0, i).reduce((sum, prev) => sum + (prev.pct / 100) * CIRCUMFERENCE, 0)
        return { method: s.method, length, offset }
    })

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
            <svg
                viewBox="0 0 160 160"
                width="150"
                height="150"
                role="img"
                aria-label={`Modes de règlement : ${slices.map(s => `${s.method} ${Math.round(s.pct)} %`).join(', ')}`}
                style={{ flexShrink: 0 }}
            >
                <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--color-well)" strokeWidth={STROKE} />
                {arcs.map(arc => (
                    <circle
                        key={arc.method}
                        cx="80" cy="80" r={RADIUS}
                        fill="none"
                        stroke={COLORS[arc.method]}
                        strokeWidth={STROKE}
                        strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                        strokeDashoffset={-arc.offset}
                        transform="rotate(-90 80 80)"
                    />
                ))}
                <text x="80" y="78" textAnchor="middle" style={{ fontSize: '17px', fontWeight: 800, fill: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {total.toLocaleString('fr-FR')}
                </text>
                <text x="80" y="98" textAnchor="middle" style={{ fontSize: '11px', fill: 'var(--color-muted)' }}>{currency}</text>
            </svg>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '160px' }}>
                {slices.map(s => (
                    <li key={s.method} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                        <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[s.method], flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>{s.method}</span>
                        <span style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            {s.amount.toLocaleString('fr-FR')} {currency}
                            <span style={{ color: 'var(--color-muted)', marginLeft: '6px' }}>{Math.round(s.pct)} %</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
