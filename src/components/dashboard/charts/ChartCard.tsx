import type { ReactNode } from 'react'

export function ChartEmpty({ children }: { children: ReactNode }) {
    return (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0, padding: '8px 0' }}>
            {children}
        </p>
    )
}

export default function ChartCard({ title, subtitle, note, children }: {
    title: string
    subtitle?: string
    note?: string
    children: ReactNode
}) {
    return (
        <section className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            <header>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>{title}</h3>
                {subtitle && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>{subtitle}</p>
                )}
                {note && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>{note}</p>
                )}
            </header>
            {children}
        </section>
    )
}
