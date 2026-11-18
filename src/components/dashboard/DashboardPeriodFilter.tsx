'use client'

import { useState, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarDays, ChevronDown } from 'lucide-react'

type Period = 'day' | 'week' | 'month'

const LABELS: Record<Period, string> = {
    day: "Aujourd'hui",
    week: '7 derniers jours',
    month: '30 derniers jours',
}

export default function DashboardPeriodFilter({ period, client }: { period: Period; client: string }) {
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [clientValue, setClientValue] = useState(client)

    const navigate = (next: { period?: Period; client?: string }) => {
        const params = new URLSearchParams()
        const p = next.period ?? period
        const c = (next.client ?? client).trim()
        if (p !== 'day') params.set('period', p)
        if (c) params.set('client', c)
        const qs = params.toString()
        router.push(qs ? `${pathname}?${qs}` : pathname)
    }

    const onClientSubmit = (e: FormEvent) => {
        e.preventDefault()
        navigate({ client: clientValue })
    }

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className="btn-secondary"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
                <CalendarDays size={16} aria-hidden="true" />
                Période : {LABELS[period]}{client ? ` · ${client}` : ''}
                <ChevronDown size={16} aria-hidden="true" />
            </button>
            {open && (
                <div className="card" style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 6px)', left: 0, width: 'min(320px, calc(100vw - 32px))', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>
                        Période
                        <select
                            className="input"
                            value={period}
                            onChange={e => navigate({ period: e.target.value as Period })}
                        >
                            {(Object.keys(LABELS) as Period[]).map(p => (
                                <option key={p} value={p}>{LABELS[p]}</option>
                            ))}
                        </select>
                    </label>
                    <form onSubmit={onClientSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label htmlFor="dashboard-client-filter" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>Client</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                id="dashboard-client-filter"
                                className="input"
                                value={clientValue}
                                onChange={e => setClientValue(e.target.value)}
                                placeholder="Nom du client"
                                style={{ flex: 1, minWidth: 0 }}
                            />
                            <button type="submit" className="btn-primary" style={{ minHeight: '44px' }}>Appliquer</button>
                        </div>
                        {client && (
                            <button type="button" className="btn-secondary" onClick={() => { setClientValue(''); navigate({ client: '' }) }} style={{ minHeight: '44px' }}>
                                Effacer le filtre client
                            </button>
                        )}
                    </form>
                </div>
            )}
        </div>
    )
}
