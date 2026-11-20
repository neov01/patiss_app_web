import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

export type TodayPickupOrder = {
    id: string
    order_number: string | null
    customer_name: string
    total_amount: number
    status: string
    pickup_date: string | null
    reception_type: string | null
}

function statusStyle(status: string) {
    if (status === 'production' || status === 'in_preparation') {
        return { color: 'var(--color-badge-production-text)', bg: 'var(--color-badge-production-bg)', label: 'En cours' }
    }
    if (status === 'ready' || status === 'awaiting_pickup') {
        return { color: 'var(--color-badge-success-text)', bg: 'var(--color-badge-success-bg)', label: 'Prête' }
    }
    if (status === 'completed' || status === 'delivered') {
        return { color: 'var(--color-text)', bg: 'var(--color-well)', label: 'Retirée' }
    }
    if (status === 'cancelled') {
        return { color: 'var(--color-badge-danger-text)', bg: 'var(--color-badge-danger-bg)', label: 'Annulée' }
    }
    return { color: 'var(--color-badge-warning-text)', bg: 'var(--color-badge-warning-bg)', label: 'En attente' }
}

// Liste des retraits et livraisons prévus aujourd'hui.
// Partagée entre le dashboard gérant et le dashboard vendeur (mode kiosque).
export default function TodayPickupsCard({ orders, currency, now }: {
    orders: TodayPickupOrder[]
    currency: string
    now: Date
}) {
    return (
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                        Retraits & Livraisons
                    </h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
                        Commandes prévues aujourd&apos;hui ({now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })})
                    </p>
                </div>
                <Link href="/commandes" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '2px', padding: '0 12px', minHeight: '36px', borderRadius: '9999px', background: 'var(--color-well)' }}>
                    Tout voir <ArrowUpRight size={12} />
                </Link>
            </div>

            {orders.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0 }}>
                    Aucun retrait ou livraison prévu aujourd&apos;hui.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '280px', paddingRight: '4px' }}>
                    {orders.map((o) => {
                        const status = statusStyle(o.status)

                        let timeStr = 'Non définie'
                        if (o.pickup_date) {
                            const d = new Date(o.pickup_date)
                            if (!Number.isNaN(d.getTime())) {
                                timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                            }
                        }

                        return (
                            <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--color-well)', borderRadius: 'var(--radius-sm)', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                                            {o.order_number || `#${o.id.substring(0, 6)}`}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: o.reception_type === 'livraison' ? 'var(--color-badge-info-bg, #DBEAFE)' : 'var(--color-surface-variant)', color: o.reception_type === 'livraison' ? 'var(--color-teal, #2F6671)' : 'var(--color-text)', textTransform: 'capitalize' }}>
                                            {o.reception_type || 'Retrait'}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {o.customer_name}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                        <span className="money" style={{ fontSize: '0.95rem' }}>
                                            {o.total_amount.toLocaleString('fr-FR')}<span className="money-cur">{currency}</span>
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 500 }}>
                                            à {timeStr}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: status.color, background: status.bg, padding: '4px 8px', borderRadius: '9999px', minWidth: '70px', textAlign: 'center' }}>
                                        {status.label}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
