import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, Wallet, type LucideIcon } from 'lucide-react'

type TodoItem = { key: string; href: string; icon: LucideIcon; label: string; tone: 'warning' | 'danger' | 'info' }

const TONES = {
    warning: { bg: 'var(--color-badge-warning-bg)', fg: 'var(--color-badge-warning-text)' },
    danger: { bg: 'var(--color-badge-danger-bg)', fg: 'var(--color-badge-danger-text)' },
    info: { bg: 'var(--color-well)', fg: 'var(--color-text)' },
}

export default function TodoStrip({ readyCount, overdueCount, alertCount, pendingDeposits, currency }: {
    readyCount: number
    overdueCount: number
    alertCount: number
    pendingDeposits: number
    currency: string
}) {
    const items: TodoItem[] = []
    if (readyCount > 0) items.push({ key: 'ready', href: '/commandes', icon: PackageCheck, tone: 'info', label: `${readyCount} commande${readyCount > 1 ? 's' : ''} prête${readyCount > 1 ? 's' : ''} à retirer` })
    if (overdueCount > 0) items.push({ key: 'overdue', href: '/commandes', icon: Clock, tone: 'danger', label: `${overdueCount} retard${overdueCount > 1 ? 's' : ''} de retrait` })
    if (alertCount > 0) items.push({ key: 'stock', href: '/ingredients', icon: AlertTriangle, tone: 'warning', label: `${alertCount} ingrédient${alertCount > 1 ? 's' : ''} sous le seuil` })
    if (pendingDeposits > 0) items.push({ key: 'deposits', href: '/commandes', icon: Wallet, tone: 'info', label: `${pendingDeposits.toLocaleString('fr-FR')} ${currency} d'acomptes en cours` })

    return (
        <section aria-label="À faire maintenant" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)', marginRight: '4px' }}>À faire maintenant</span>
            {items.length === 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--color-success)', fontWeight: 600 }}>
                    <CheckCircle2 size={16} aria-hidden="true" /> Rien d&apos;urgent pour le moment
                </span>
            ) : items.map(item => {
                const Icon = item.icon
                const tone = TONES[item.tone]
                return (
                    <Link
                        key={item.key}
                        href={item.href}
                        prefetch={true}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 14px', borderRadius: '9999px', background: tone.bg, color: tone.fg, fontSize: '0.8125rem', fontWeight: 700, textDecoration: 'none' }}
                    >
                        <Icon size={16} aria-hidden="true" />
                        {item.label}
                    </Link>
                )
            })}
        </section>
    )
}
