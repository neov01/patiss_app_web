'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShoppingBag, Plus, Trash2, AlertTriangle, Wallet, Loader2, BadgeCheck, CheckCircle2, Search } from 'lucide-react'
import { updateOrderStatus, deleteOrder } from '@/lib/actions/orders'
import NewOrderModal from './NewOrderModal'
import OrderDrawer from './OrderDrawer'
import HistoricalImportModal from './HistoricalImportModal'

interface Product { id: string; name: string; selling_price: number; current_stock: number | null }
interface OrderItem { id: string; order_id: string; product_id: string | null; quantity: number; unit_price: number; created_at: string | null; products: { name: string } | null }
interface OrderWithItems {
    id: string
    organization_id: string
    order_number: string | null
    customer_name: string
    customer_contact: string | null
    customer_id: string | null
    pickup_date: string
    status: string
    priority: string | null
    payment_status: string | null
    total_amount: number
    deposit_amount: number
    custom_image_url: string | null
    customization_notes: string | null
    created_by: string | null
    created_at: string | null
    order_items: OrderItem[]
}

const STATUS_LABELS: Record<string, { label: string; next: string; color: string }> = {
    pending: { label: '⏳ En attente', next: 'production', color: '#FEF3C7' },
    production: { label: '👨‍🍳 En production', next: 'ready', color: '#DBEAFE' },
    ready: { label: '✅ Prête', next: 'completed', color: '#D1FAE5' },
    completed: { label: '✔ Livré / Retiré', next: 'completed', color: '#F3F4F6' },
    cancelled: { label: '✖ Annulée', next: 'cancelled', color: '#FEE2E2' },
}

const ACTIVE_STATUSES = ['pending', 'production', 'ready']
const PAGE_SIZE = 20

function formatPickupDate(date: Date): string {
    if (isNaN(date.getTime())) return 'Non définie'
    const day = date.getDate()
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
    const month = months[date.getMonth()]
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day} ${month} à ${hours}:${minutes}`
}

export default function OrdersClient({
    orders,
    products,
    currency,
    organizationId,
    roleSlug,
    canImportHistory = false
}: {
    orders: OrderWithItems[];
    products: Product[];
    currency: string;
    organizationId: string;
    roleSlug: string;
    canImportHistory?: boolean;
}) {
    const [showModal, setShowModal] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const [isPending, start] = useTransition()
    const [statusFilter, setStatusFilter] = useState('active')
    const [paymentFilter, setPaymentFilter] = useState('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [orderToDelete, setOrderToDelete] = useState<{id: string, name: string} | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
    
    // Nouveaux états pour la recherche, filtres du jour, et Zero Latency
    const [search, setSearch] = useState('')
    const [pickupToday, setPickupToday] = useState(false)
    const [createdToday, setCreatedToday] = useState(false)
    const [localOrders, setLocalOrders] = useState(orders)
    
    const router = useRouter()

    useEffect(() => {
        setLocalOrders(orders)
    }, [orders])

    // Filtrage instantané en mémoire — pas de round-trip serveur
    const filtered = useMemo(() => {
        let result = localOrders
        if (statusFilter === 'active') result = result.filter(o => ACTIVE_STATUSES.includes(o.status))
        else if (statusFilter !== 'all') result = result.filter(o => o.status === statusFilter)

        if (paymentFilter === 'solde') result = result.filter(o => o.payment_status === 'SOLDEE')
        else if (paymentFilter === 'acompte') result = result.filter(o => o.payment_status === 'PARTIEL')
        else if (paymentFilter === 'crm') result = result.filter(o => !!o.customer_id)

        if (pickupToday) {
            const todayStr = new Date().toDateString()
            result = result.filter(o => {
                const d = new Date(o.pickup_date)
                return !isNaN(d.getTime()) && d.toDateString() === todayStr
            })
        }

        if (createdToday) {
            const todayStr = new Date().toDateString()
            result = result.filter(o => {
                if (!o.created_at) return false
                const d = new Date(o.created_at)
                return !isNaN(d.getTime()) && d.toDateString() === todayStr
            })
        }

        if (search.trim() !== '') {
            const q = search.toLowerCase()
            result = result.filter(o => 
                o.customer_name.toLowerCase().includes(q) ||
                (o.customer_contact && o.customer_contact.toLowerCase().includes(q)) ||
                (o.order_number && o.order_number.toLowerCase().includes(q))
            )
        }

        return result
    }, [localOrders, statusFilter, paymentFilter, pickupToday, createdToday, search])

    // Pagination client
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const paginated = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE
        return filtered.slice(start, start + PAGE_SIZE)
    }, [filtered, currentPage])

    // Compteurs par statut pour les badges
    const counts = useMemo(() => {
        const c: Record<string, number> = { all: localOrders.length, active: 0 }
        localOrders.forEach(o => {
            c[o.status] = (c[o.status] || 0) + 1
            if (ACTIVE_STATUSES.includes(o.status)) c.active++
        })
        return c
    }, [localOrders])

    const handleFilterChange = (status: string) => {
        setStatusFilter(status)
        setCurrentPage(1) // Reset pagination on filter change
    }

    async function handleStatusChange(orderId: string, nextStatus: string) {
        // MAJ Optimiste Zéro Latence
        setLocalOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o))
        if (selectedOrder && selectedOrder.id === orderId) {
            setSelectedOrder(prev => prev ? { ...prev, status: nextStatus } : null)
        }

        start(async () => {
            const result = await updateOrderStatus(orderId, nextStatus)
            if ('error' in result && result.error) {
                toast.error(result.error)
                router.refresh()
            } else {
                toast.success('Statut mis à jour !')
                router.refresh()
            }
        })
    }

    const handleDelete = async () => {
        if (!orderToDelete) return
        
        const { id } = orderToDelete
        setDeletingId(id)
        setOrderToDelete(null)
        
        start(async () => {
            try {
                const result = await deleteOrder(id)
                if ('error' in result && result.error) {
                    toast.error(result.error)
                } else {
                    toast.success('Commande supprimée')
                }
            } catch (err) {
                toast.error("Erreur lors de la suppression")
            } finally {
                setDeletingId(null)
            }
        })
    }

    const handleOrderUpdate = (updatedOrder: any) => {
        setLocalOrders(prev => prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
        if (selectedOrder && selectedOrder.id === updatedOrder.id) {
            setSelectedOrder(prev => prev ? { ...prev, ...updatedOrder } : null)
        }
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Commandes</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {filtered.length} commande{filtered.length > 1 ? 's' : ''} {statusFilter !== 'all' && statusFilter !== 'active' ? `(${STATUS_LABELS[statusFilter]?.label})` : statusFilter === 'active' ? '(actives)' : 'au total'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {(roleSlug === 'gerant' || roleSlug === 'super_admin' || canImportHistory) && (
                        <button onClick={() => setShowImportModal(true)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '40px', fontSize: '0.85rem' }}>
                            📥 Saisie Historique
                        </button>
                    )}
                    <button onClick={() => setShowModal(true)} className="btn-primary">
                        <Plus size={16} /> Nouvelle commande
                    </button>
                </div>
            </div>

            {/* Barre de recherche premium */}
            <div style={{ position: 'relative', marginBottom: '20px' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, paddingLeft: '16px', display: 'flex', alignItems: 'center', pointerEvents: 'none', height: '100%' }}>
                    <Search size={18} color="#9C8070" />
                </div>
                <input
                    type="text"
                    placeholder="Rechercher une commande (Nom client, téléphone, n° commande...)"
                    style={{
                        width: '100%',
                        padding: '12px 12px 12px 48px',
                        borderRadius: '9999px',
                        border: '1.5px solid var(--color-border)',
                        background: 'var(--color-cream)',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        outline: 'none',
                    }}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                />
            </div>

            {/* Filtres — switching instantané */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', overflowX: 'auto' }}>
                {['active', 'all', 'pending', 'production', 'ready', 'completed', 'cancelled'].map(s => (
                    <button key={s} onClick={() => handleFilterChange(s)}
                        className={statusFilter === s ? 'btn-primary' : 'btn-secondary'}
                        style={{ 
                            padding: '0 14px', 
                            fontSize: '0.8rem', 
                            minHeight: '36px',
                            border: statusFilter === s ? 'none' : '1.5px solid var(--color-border)',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                        {s === 'active' ? '⚡ Actives' : (s === 'all' ? 'Toutes' : STATUS_LABELS[s]?.label ?? s)}
                        <span style={{ 
                            background: statusFilter === s ? 'rgba(255,255,255,0.3)' : 'var(--color-cream)',
                            borderRadius: '99px',
                            padding: '1px 8px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            minWidth: '20px',
                            textAlign: 'center'
                        }}>
                            {counts[s] || 0}
                        </span>
                    </button>
                ))}
            </div>

            {/* Filtres paiement & CRM */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                    { id: 'all', label: 'Tous paiements' },
                    { id: 'solde', label: '✓ Soldé à la prise' },
                    { id: 'acompte', label: '💳 Acompte en attente' },
                    { id: 'crm', label: '🎯 Clients CRM' },
                ].map(f => (
                    <button key={f.id}
                        onClick={() => { setPaymentFilter(f.id); setCurrentPage(1) }}
                        style={{
                            padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '99px',
                            border: paymentFilter === f.id ? 'none' : '1.5px solid var(--color-border)',
                            background: paymentFilter === f.id ? '#2D1B0E' : 'transparent',
                            color: paymentFilter === f.id ? 'white' : 'var(--color-muted)',
                            cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                    >{f.label}</button>
                ))}

                <div style={{ width: '1.5px', height: '16px', background: 'var(--color-border)', margin: '0 4px' }} />

                <button
                    onClick={() => { setPickupToday(!pickupToday); setCurrentPage(1) }}
                    style={{
                        padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '99px',
                        border: pickupToday ? 'none' : '1.5px solid var(--color-border)',
                        background: pickupToday ? '#C4836A' : 'transparent',
                        color: pickupToday ? 'white' : 'var(--color-muted)',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                >
                    📅 Retraits du Jour
                </button>
                <button
                    onClick={() => { setCreatedToday(!createdToday); setCurrentPage(1) }}
                    style={{
                        padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '99px',
                        border: createdToday ? 'none' : '1.5px solid var(--color-border)',
                        background: createdToday ? '#C4836A' : 'transparent',
                        color: createdToday ? 'white' : 'var(--color-muted)',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                >
                    📝 Créées ce Jour
                </button>
            </div>

            {/* Liste des commandes */}
            {paginated.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <ShoppingBag size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucune commande</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                    {paginated.map(order => {
                        const s = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending
                        const pickupDate = new Date(order.pickup_date)
                        const isToday = pickupDate.toDateString() === new Date().toDateString()
                        const isDeleting = deletingId === order.id

                        return (
                            <div key={order.id} className="card" 
                                onClick={() => setSelectedOrder(order)}
                                style={{ 
                                    border: `1.5px solid ${s.color === '#FEF3C7' ? '#FEF3C7' : 'var(--color-border)'}`,
                                    opacity: isDeleting ? 0.5 : 1,
                                    transition: 'all 0.2s',
                                    cursor: 'pointer'
                                }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '1rem', fontWeight: 700 }}>{order.customer_name}</span>
                                            <span className={`badge badge-${order.status}`}>{s.label}</span>
                                            {order.payment_status === 'SOLDEE' && order.deposit_amount > 0
                                                ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46', display: 'inline-flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={11} /> Soldé à la prise</span>
                                                : order.payment_status === 'PARTIEL'
                                                    ? <span className="badge" style={{ background: '#FEF3EC', color: '#D97757', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Wallet size={11} />Acompte : {Number(order.deposit_amount).toLocaleString('fr-FR')} {currency}</span>
                                                    : null
                                            }
                                            {order.customer_id && <span className="badge" style={{ background: '#EFF6FF', color: '#3B82F6', display: 'inline-flex', alignItems: 'center', gap: 3 }}><BadgeCheck size={11} /> CRM</span>}
                                            {isToday && <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>📅 Aujourd&apos;hui</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', color: 'var(--color-muted)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            {order.customer_contact && <span>📞 {order.customer_contact}</span>}
                                            <span style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '4px', 
                                                color: (pickupDate && !isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? '#F59E0B' : 'inherit', 
                                                fontWeight: (pickupDate && !isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? 700 : 400 
                                            }}>
                                                🕐 Retrait : {pickupDate ? formatPickupDate(pickupDate) : 'Non définie'}
                                                {(!isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) && <AlertTriangle size={14} />}
                                            </span>
                                        </div>
                                        {order.order_items.length > 0 && (
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {order.order_items.map((item: OrderItem) => (
                                                    <span key={item.id} style={{ background: 'var(--color-cream)', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 500 }}>
                                                        {item.quantity}× {item.products?.name ?? 'Produit'}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '4px' }}>
                                            {Number(order.total_amount).toLocaleString('fr-FR')} {currency}
                                        </div>
                                        {order.deposit_amount > 0 && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                                Acompte : {Number(order.deposit_amount).toLocaleString('fr-FR')} {currency}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                                            {order.status === 'ready' ? (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        router.push(`/caisse?order=${order.id}`)
                                                    }}
                                                    className="btn-primary" disabled={isPending || isDeleting}
                                                    style={{ fontSize: '0.85rem', padding: '0 16px', minHeight: '36px', background: '#D97757', borderColor: '#D97757' }}>
                                                    Encaisser
                                                </button>
                                            ) : (
                                                order.status !== 'completed' && order.status !== 'cancelled' && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            const next = STATUS_LABELS[order.status]?.next
                                                            if (next) handleStatusChange(order.id, next)
                                                        }}
                                                        className="btn-primary" disabled={isPending || isDeleting}
                                                        style={{ fontSize: '0.8rem', padding: '0 12px', minHeight: '36px' }}>
                                                        → {STATUS_LABELS[STATUS_LABELS[order.status]?.next]?.label ?? 'Avancer'}
                                                    </button>
                                                )
                                            )}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setOrderToDelete({ id: order.id, name: order.customer_name })
                                                }} 
                                                className="btn-ghost" disabled={isPending || isDeleting}
                                                style={{ color: '#D94F38', minHeight: '36px', padding: '0 10px' }}>
                                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Pagination client-side */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', alignItems: 'center' }}>
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="btn-secondary"
                        style={{ minHeight: '36px', padding: '0 14px', fontSize: '0.85rem' }}
                    >
                        ←
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-muted)', padding: '0 8px' }}>
                        {currentPage} / {totalPages}
                    </span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="btn-secondary"
                        style={{ minHeight: '36px', padding: '0 14px', fontSize: '0.85rem' }}
                    >
                        →
                    </button>
                </div>
            )}

            {/* Modal Nouvelle Commande */}
            <NewOrderModal
                open={showModal}
                onClose={() => setShowModal(false)}
                products={products}
                currency={currency}
                organizationId={organizationId}
            />

            {/* Modal de Confirmation de Suppression */}
            {orderToDelete && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div 
                        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(45,27,14,0.6)', backdropFilter: 'blur(4px)' }} 
                        onClick={() => setOrderToDelete(null)}
                    />
                    <div className="animate-scale-in" style={{
                        position: 'relative', width: '100%', maxWidth: '400px', background: 'white', 
                        borderRadius: '24px', padding: '32px', textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(45,27,14,0.15)'
                    }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#D94F38' }}>
                            <Trash2 size={32} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2D1B0E', marginBottom: '12px' }}>Supprimer la commande ?</h3>
                        <p style={{ color: '#9C8070', marginBottom: '32px', lineHeight: 1.5 }}>
                            Êtes-vous sûr de vouloir supprimer la commande de <strong>{orderToDelete.name}</strong> ? Cette action supprimera également les articles associés.
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => setOrderToDelete(null)}
                                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1.5px solid #FDE8DB', background: 'white', color: '#9C8070', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleDelete}
                                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#D94F38', color: 'white', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Drawer Détail Commande */}
            <OrderDrawer 
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onStatusChange={handleStatusChange}
                isPending={isPending}
                roleSlug={roleSlug}
                onOrderUpdate={handleOrderUpdate}
            />
            {/* Modal Importation Historique */}
            {showImportModal && (
                <HistoricalImportModal
                    open={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    products={products}
                    currency={currency}
                    onSuccess={() => {
                        toast.success("Données historiques importées avec succès !")
                        router.refresh()
                    }}
                />
            )}
        </div>
    )
}
