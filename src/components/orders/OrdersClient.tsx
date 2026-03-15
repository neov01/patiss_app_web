'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, Plus, Calendar, User, Phone, X, Loader2, Trash2, Image as ImageIcon } from 'lucide-react'
import { createOrder, updateOrderStatus, deleteOrder } from '../../../lib/actions/orders'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import TouchInput from '@/components/ui/TouchInput'

interface Recipe { id: string; name: string; sale_price: number }
interface OrderItem { id: string; order_id: string; recipe_id: string; quantity: number; unit_price: number; created_at: string | null; recipes: { name: string } | null }
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
    completed: { label: '✔ Complète', next: 'completed', color: '#F3F4F6' },
    cancelled: { label: '✖ Annulée', next: 'cancelled', color: '#FEE2E2' },
}

export default function OrdersClient({ orders, recipes }: { orders: OrderWithItems[]; recipes: Recipe[] }) {
    const [showModal, setShowModal] = useState(false)
    const [isPending, start] = useTransition()
    const [statusFilter, setFilter] = useState('all')
    const [orderItems, setOrderItems] = useState<{ recipe_id: string; quantity: number; unit_price: number; name: string }[]>([])
    const [form, setForm] = useState({ customer_name: '', customer_contact: '', pickup_date: '', deposit_amount: 0, total_amount: 0 })
    const [imageFile, setImageFile] = useState<File | null>(null)

    const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)

    const computedTotal = orderItems.reduce((s, i) => s + i.unit_price * i.quantity, 0)
    const displayTotal = form.total_amount > 0 ? form.total_amount : computedTotal
    const balance = displayTotal - form.deposit_amount

    function addRecipe(recipe: Recipe) {
        setOrderItems(items => {
            const existing = items.find(i => i.recipe_id === recipe.id)
            if (existing) return items.map(i => i.recipe_id === recipe.id ? { ...i, quantity: i.quantity + 1 } : i)
            return [...items, { recipe_id: recipe.id, quantity: 1, unit_price: recipe.sale_price, name: recipe.name }]
        })
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault()
        start(async () => {
            let customImageUrl: string | undefined

            if (imageFile) {
                try {
                    const supabase = createSupabaseClient()
                    const ext = imageFile.name.split('.').pop() || 'jpg'
                    const filePath = `orders/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

                    const { error: uploadError } = await supabase
                        .storage
                        .from('order-images')
                        .upload(filePath, imageFile)

                    if (!uploadError) {
                        const { data } = supabase.storage.from('order-images').getPublicUrl(filePath)
                        customImageUrl = data.publicUrl
                    } else {
                        toast.error('Upload de la photo commande impossible. La commande sera enregistrée sans image.')
                    }
                } catch {
                    toast.error('Erreur de connexion au stockage. La commande sera enregistrée sans image.')
                }
            }

            const result = await createOrder({ ...form, total_amount: displayTotal, items: orderItems, custom_image_url: customImageUrl })
            if ('error' in result && result.error) { toast.error(result.error); return }
            toast.success('Commande créée !')
            setShowModal(false)
            setOrderItems([])
            setForm({ customer_name: '', customer_contact: '', pickup_date: '', deposit_amount: 0, total_amount: 0 })
            setImageFile(null)
        })
    }

    async function handleStatusChange(orderId: string, status: string) {
        const nextStatus: Record<string, string> = { pending: 'production', production: 'ready', ready: 'completed' }
        if (!nextStatus[status]) return
        start(async () => {
            const result = await updateOrderStatus(orderId, nextStatus[status])
            if ('error' in result && result.error) toast.error(result.error)
            else toast.success('Statut mis à jour !')
        })
    }

    async function handleDelete(orderId: string) {
        if (!confirm('Supprimer cette commande ?')) return
        start(async () => {
            const result = await deleteOrder(orderId)
            if ('error' in result && result.error) toast.error(result.error)
            else toast.success('Commande supprimée')
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
                        return (
                            <div key={order.id} className="card" style={{ border: `1.5px solid ${s.color === '#FEF3C7' ? '#FEF3C7' : 'var(--color-border)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '1rem', fontWeight: 700 }}>{order.customer_name}</span>
                                            <span className={`badge badge-${order.status}`}>{s.label}</span>
                                            {isToday && <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>📅 Aujourd&apos;hui</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', color: 'var(--color-muted)', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                                            {order.customer_contact && <span>📞 {order.customer_contact}</span>}
                                            <span>🕐 Retrait : {pickupDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        {order.order_items.length > 0 && (
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {order.order_items.map(item => (
                                                    <span key={item.id} style={{ background: 'var(--color-cream)', borderRadius: '99px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 500 }}>
                                                        {item.quantity}× {item.recipes?.name ?? 'Produit'}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '4px' }}>
                                            {order.total_amount.toLocaleString('fr-FR')} FCFA
                                        </div>
                                        {order.deposit_amount > 0 && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                                Acompte : {order.deposit_amount.toLocaleString('fr-FR')} FCFA
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                                            {order.status !== 'completed' && order.status !== 'cancelled' && (
                                                <button onClick={() => handleStatusChange(order.id, order.status)}
                                                    className="btn-primary" disabled={isPending}
                                                    style={{ fontSize: '0.8rem', padding: '0 12px', minHeight: '36px' }}>
                                                    → {STATUS_LABELS[STATUS_LABELS[order.status]?.next]?.label ?? 'Avancer'}
                                                </button>
                                            )}
                                            <button onClick={() => handleDelete(order.id)} className="btn-ghost" disabled={isPending}
                                                style={{ color: '#D94F38', minHeight: '36px', padding: '0 10px' }}>
                                                <Trash2 size={16} />
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
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Nouvelle commande</h2>
                            <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Infos client */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="label">Nom du client *</label>
                                    <div style={{ position: 'relative' }}>
                                        <User size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                                        <input className="input" style={{ paddingLeft: '34px' }} value={form.customer_name}
                                            onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Marie Dupont" required />
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Contact</label>
                                    <div style={{ position: 'relative' }}>
                                        <Phone size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                                        <input className="input" style={{ paddingLeft: '34px' }} value={form.customer_contact}
                                            onChange={e => setForm(f => ({ ...f, customer_contact: e.target.value }))} placeholder="+225 07 00 00 00" />
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="label">Date & heure de retrait *</label>
                                    <div style={{ position: 'relative' }}>
                                        <Calendar size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                                        <input type="datetime-local" className="input" style={{ paddingLeft: '34px' }} value={form.pickup_date}
                                            onChange={e => setForm(f => ({ ...f, pickup_date: e.target.value }))} required />
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Acompte (FCFA)</label>
                                    <TouchInput
                                        value={form.deposit_amount.toString()}
                                        onChange={val => setForm(f => ({ ...f, deposit_amount: parseInt(val) || 0 }))}
                                        placeholder="0"
                                        title="Saisir l'acompte"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="label">Total (manuel si vide)</label>
                                    <TouchInput
                                        value={displayTotal.toString()}
                                        onChange={val => setForm(f => ({ ...f, total_amount: parseInt(val) || 0 }))}
                                        placeholder="0"
                                        title="Saisir le total"
                                        style={{ background: form.total_amount > 0 ? 'white' : 'var(--color-cream)' }}
                                    />
                                </div>
                                <div>
                                    <label className="label">Solde</label>
                                    <div className="input" style={{ background: 'var(--color-cream)', color: balance <= 0 ? '#4C9E6A' : 'var(--color-text)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                                        {balance.toLocaleString('fr-FR')} FCFA
                                    </div>
                                </div>
                            </div>

                            {/* Photo inspiration */}
                            <div>
                                <label className="label">Photo inspiration (optionnel)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <label className="btn-secondary" style={{ cursor: 'pointer', minHeight: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <ImageIcon size={16} />
                                        <span>Choisir une image</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={e => setImageFile(e.target.files?.[0] ?? null)}
                                        />
                                    </label>
                                    {imageFile && (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                                            {imageFile.name}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Sélecteur recettes */}
                            <div>
                                <label className="label">Produits commandés</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    {recipes.map(r => (
                                        <button key={r.id} type="button" onClick={() => addRecipe(r)}
                                            className="btn-secondary"
                                            style={{ fontSize: '0.8rem', padding: '4px 12px', minHeight: '36px' }}>
                                            + {r.name} ({r.sale_price.toLocaleString('fr-FR')} FCFA)
                                        </button>
                                    ))}
                                </div>
                                {orderItems.length > 0 && (
                                    <div style={{ background: 'var(--color-cream)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {orderItems.map((item, i) => (
                                            <div key={item.recipe_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.name}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <TouchInput
                                                        value={item.quantity.toString()}
                                                        onChange={val => setOrderItems(items => items.map((it, idx) => idx === i ? { ...it, quantity: parseInt(val) || 1 } : it))}
                                                        placeholder="1"
                                                        title="Modifier quantité"
                                                        style={{ width: '80px', textAlign: 'center', minHeight: '34px', padding: '0 8px' }}
                                                    />
                                                    <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>× {item.unit_price.toLocaleString('fr-FR')} FCFA</span>
                                                    <button type="button" onClick={() => setOrderItems(items => items.filter((_, idx) => idx !== i))} className="btn-ghost" style={{ minHeight: '30px', padding: '0 6px', color: '#D94F38' }}><X size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                            <span>Total produits</span>
                                            <span>{computedTotal.toLocaleString('fr-FR')} FCFA</span>
                                        </div>
                                    </div>
                                )}
                            </div>



                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
                                <button type="submit" className="btn-primary" disabled={isPending || displayTotal === 0 || !form.customer_name.trim()} style={{ flex: 1 }}>
                                    {isPending ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                                    {isPending ? 'Création…' : 'Créer la commande'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
