'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShoppingBag, Plus, Trash2, AlertTriangle, Wallet, Loader2 } from 'lucide-react'
import { updateOrderStatus, deleteOrder } from '../../../lib/actions/orders'
import NewOrderModal from './NewOrderModal'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import TouchInput from '@/components/ui/TouchInput'

interface Product { id: string; name: string; selling_price: number }
interface OrderItem { id: string; order_id: string; product_id: string | null; quantity: number; unit_price: number; created_at: string | null; products: { name: string } | null }
interface OrderWithItems {
    id: string
    organization_id: string
    customer_name: string
    customer_contact: string | null
    pickup_date: string
    status: string
    total_amount: number
    deposit_amount: number
    custom_image_url: string | null
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

export default function OrdersClient({ orders, products, currency }: { orders: OrderWithItems[]; products: Product[]; currency: string }) {
    const [showModal, setShowModal] = useState(false)
    const [isPending, start] = useTransition()
    const [statusFilter, setFilter] = useState('all')
    const [orderToDelete, setOrderToDelete] = useState<{id: string, name: string} | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const router = useRouter()

    const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)

    async function handleStatusChange(orderId: string, status: string) {
        const nextStatus: Record<string, string> = { pending: 'production', production: 'ready', ready: 'completed' }
        if (!nextStatus[status]) return
        start(async () => {
            const result = await updateOrderStatus(orderId, nextStatus[status])
            if ('error' in result && result.error) toast.error(result.error)
            else toast.success('Statut mis à jour !')
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

    return (
        <>
            {/* Filtres + Bouton */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
                    {['all', 'pending', 'production', 'ready', 'completed', 'cancelled'].map(s => (
                        <button key={s} onClick={() => setFilter(s)}
                            className={statusFilter === s ? 'btn-primary' : 'btn-secondary'}
                            style={{ padding: '0 14px', fontSize: '0.8rem', minHeight: '36px' }}>
                            {s === 'all' ? 'Toutes' : STATUS_LABELS[s]?.label ?? s}
                        </button>
                    ))}
                </div>
                <button onClick={() => setShowModal(true)} className="btn-primary">
                    <Plus size={16} /> Nouvelle commande
                </button>
            </div>

            {/* Liste des commandes */}
            {filtered.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <ShoppingBag size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucune commande</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filtered.map(order => {
                        const s = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending
                        const pickupDate = new Date(order.pickup_date)
                        const isToday = pickupDate.toDateString() === new Date().toDateString()
                        const isDeleting = deletingId === order.id

                        return (
                            <div key={order.id} className="card" 
                                style={{ 
                                    border: `1.5px solid ${s.color === '#FEF3C7' ? '#FEF3C7' : 'var(--color-border)'}`,
                                    opacity: isDeleting ? 0.5 : 1,
                                    transition: 'opacity 0.2s'
                                }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '1rem', fontWeight: 700 }}>{order.customer_name}</span>
                                            <span className={`badge badge-${order.status}`}>{s.label}</span>
                                            {order.deposit_amount > 0 && <span className="badge" style={{ background: '#FEF3EC', color: '#D97757' }}><Wallet size={12} style={{ display: 'inline', marginRight: 4 }}/>Acompte : {order.deposit_amount.toLocaleString('fr-FR')} {currency}</span>}
                                            {isToday && <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>📅 Aujourd&apos;hui</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', color: 'var(--color-muted)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            {order.customer_contact && <span>📞 {order.customer_contact}</span>}
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: (order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? '#F59E0B' : 'inherit', fontWeight: (order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? 700 : 400 }}>
                                                🕐 Retrait : {pickupDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                {(order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) && <AlertTriangle size={14} />}
                                            </span>
                                        </div>
                                        {order.order_items.length > 0 && (
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {order.order_items.map(item => (
                                                    <span key={item.id} style={{ background: 'var(--color-cream)', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 500 }}>
                                                        {item.quantity}× {item.products?.name ?? 'Produit'}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '4px' }}>
                                            {order.total_amount.toLocaleString('fr-FR')} {currency}
                                        </div>
                                        {order.deposit_amount > 0 && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                                Acompte : {order.deposit_amount.toLocaleString('fr-FR')} {currency}
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
                                                            handleStatusChange(order.id, order.status)
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

            {/* Modal Nouvelle Commande */}
            <NewOrderModal 
                open={showModal} 
                onClose={() => setShowModal(false)} 
                products={products} 
                currency={currency} 
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
        </>
    )
}
