'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { getOrderDeletionAudit, restoreOrder, type OrderDeletionAuditEntry } from '@/lib/actions/orders'
import { getDaysUntilPurge, isPurgeable } from '@/lib/domain/order-deletion'
import ConfirmModalWithReason from '@/components/ui/ConfirmModalWithReason'

type AuditEntry = OrderDeletionAuditEntry & { isRestorable: boolean }

const ACTION_LABELS: Record<AuditEntry['action'], { label: string; bg: string; color: string }> = {
    delete: { label: 'Suppression', bg: '#FEF2F2', color: '#EF4444' },
    restore: { label: 'Restauration', bg: '#ECFDF5', color: '#10B981' },
    purge: { label: 'Purge définitive', bg: '#F3F4F6', color: '#6B7280' }
}

export default function OrderAuditClient({
    initialEntries,
    initialCount,
    initialHasMore
}: {
    initialEntries: AuditEntry[]
    initialCount: number
    initialHasMore: boolean
}) {
    const router = useRouter()
    const [entries, setEntries] = useState(initialEntries)
    const [hasMore, setHasMore] = useState(initialHasMore)
    const [loadingMore, setLoadingMore] = useState(false)
    const [search, setSearch] = useState('')
    const [actionFilter, setActionFilter] = useState<'all' | AuditEntry['action']>('all')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [entryToRestore, setEntryToRestore] = useState<AuditEntry | null>(null)
    const [restoring, setRestoring] = useState(false)

    const filteredEntries = useMemo(() => {
        const term = search.trim().toLowerCase()
        return entries.filter(entry => {
            if (actionFilter !== 'all' && entry.action !== actionFilter) return false
            if (!term) return true
            return (
                entry.order_reference.toLowerCase().includes(term) ||
                entry.performed_by_name.toLowerCase().includes(term) ||
                entry.reason.toLowerCase().includes(term)
            )
        })
    }, [entries, search, actionFilter])

    const loadMore = async () => {
        setLoadingMore(true)
        const nextPage = Math.floor(entries.length / 30) + 1
        const result = await getOrderDeletionAudit({ page: nextPage, pageSize: 30 })
        if ('error' in result) {
            toast.error(result.error)
        } else {
            setEntries(prev => [...prev, ...result.entries])
            setHasMore(result.hasMore)
        }
        setLoadingMore(false)
    }

    const handleRestore = async (reason: string) => {
        if (!entryToRestore) return
        const orderId = entryToRestore.order_id
        setRestoring(true)

        const result = await restoreOrder(orderId, reason)
        setRestoring(false)
        setEntryToRestore(null)

        if ('error' in result && result.error) {
            toast.error(result.error)
            return
        }

        toast.success('Commande restaurée')
        router.refresh()
        setEntries(prev => prev.map(e => e.id === entryToRestore.id ? { ...e, isRestorable: false } : e))
    }

    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 80px' }}>
            <button
                onClick={() => router.push('/commandes')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '16px' }}
            >
                <ArrowLeft size={18} /> Retour aux commandes
            </button>

            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '4px' }}>Historique des suppressions</h1>
            <p style={{ color: 'var(--color-muted)', marginBottom: '24px' }}>
                {initialCount} événement{initialCount > 1 ? 's' : ''} enregistré{initialCount > 1 ? 's' : ''}
            </p>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher (commande, auteur, commentaire)…"
                        style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '12px', border: '1.5px solid var(--color-border)', boxSizing: 'border-box' }}
                    />
                </div>
                <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}
                    style={{ padding: '10px 12px', borderRadius: '12px', border: '1.5px solid var(--color-border)' }}
                >
                    <option value="all">Toutes les actions</option>
                    <option value="delete">Suppressions</option>
                    <option value="restore">Restaurations</option>
                    <option value="purge">Purges définitives</option>
                </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredEntries.map(entry => {
                    const actionMeta = ACTION_LABELS[entry.action]
                    const isExpanded = expandedId === entry.id
                    const daysLeft = entry.action === 'delete' && entry.isRestorable
                        ? getDaysUntilPurge(entry.created_at)
                        : null
                    const purgeImminent = entry.action === 'delete' && entry.isRestorable && isPurgeable(entry.created_at)

                    return (
                        <div key={entry.id} style={{ border: '1.5px solid var(--color-border)', borderRadius: '16px', padding: '16px', background: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ background: actionMeta.bg, color: actionMeta.color, fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '999px' }}>
                                        {actionMeta.label}
                                    </span>
                                    <strong>{entry.order_reference}</strong>
                                    <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                                        par {entry.performed_by_name} · {new Date(entry.created_at).toLocaleString('fr-FR')}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {entry.isRestorable && (
                                        <button
                                            onClick={() => setEntryToRestore(entry)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#10B981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
                                        >
                                            <RotateCcw size={14} /> Restaurer
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                                    >
                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </button>
                                </div>
                            </div>

                            {daysLeft !== null && (
                                <p style={{ marginTop: '8px', fontSize: '0.8rem', color: purgeImminent ? '#EF4444' : 'var(--color-muted)' }}>
                                    {purgeImminent ? 'Purge définitive imminente' : `Purge définitive dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}
                                </p>
                            )}

                            <p style={{ marginTop: '10px', fontSize: '0.9rem' }}>{entry.reason}</p>

                            {isExpanded && entry.order_snapshot && (
                                <pre style={{ marginTop: '12px', background: '#F9FAFB', borderRadius: '12px', padding: '12px', fontSize: '0.75rem', overflowX: 'auto' }}>
                                    {JSON.stringify(entry.order_snapshot, null, 2)}
                                </pre>
                            )}
                        </div>
                    )
                })}

                {filteredEntries.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '40px 0' }}>Aucun événement trouvé.</p>
                )}
            </div>

            {hasMore && (
                <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{ display: 'block', margin: '24px auto 0', padding: '12px 24px', borderRadius: '999px', border: '1.5px solid var(--color-border)', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                    {loadingMore ? 'Chargement...' : 'Charger plus'}
                </button>
            )}

            <ConfirmModalWithReason
                isOpen={!!entryToRestore}
                onClose={() => setEntryToRestore(null)}
                onConfirm={handleRestore}
                title="Restaurer la commande ?"
                message={`La commande ${entryToRestore?.order_reference ?? ''} redeviendra active et le stock recrédité sera à nouveau décrémenté si nécessaire.`}
                confirmText="Restaurer"
                reasonLabel="Raison de la restauration (obligatoire)"
                isLoading={restoring}
            />
        </div>
    )
}
