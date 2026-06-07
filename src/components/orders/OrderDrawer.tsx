'use client'

import { useState, useEffect } from 'react'
import { X, Clock, ChefHat, CheckCircle2, XCircle, Maximize2, Pencil, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateOrderDetails } from '@/lib/actions/orders'

interface OrderItem {
    id: string
    quantity: number
    unit_price: number
    products: { name: string } | null
    name?: string | null
}

interface Order {
    id: string
    order_number: string | null
    customer_name: string
    customer_contact: string | null
    status: string
    priority: string | null
    pickup_date: string
    created_at: string | null
    customization_notes: string | null
    custom_image_url: string | null
    order_items: OrderItem[]
}

const STATUS_CONFIG: Record<string, { label: string; next: string; nextLabel: string; prev?: string; prevLabel?: string; color: string; bg: string }> = {
    pending:    { label: '⏳ En attente',       next: 'production', nextLabel: '👨‍🍳 Lancer en production', color: '#92400E', bg: '#FEF3C7' },
    production: { label: '👨‍🍳 En production',    next: 'ready',      nextLabel: '✅ Marquer Prête',        prev: 'pending',    prevLabel: '⏪ En attente', color: '#1E40AF', bg: '#DBEAFE' },
    ready:      { label: '✅ Prête',             next: 'completed',  nextLabel: '✔ Livré / Retiré',        prev: 'production', prevLabel: '⏪ En production', color: '#065F46', bg: '#D1FAE5' },
    completed:  { label: '✔ Livré / Retiré',    next: '',           nextLabel: '',                         prev: 'ready',      prevLabel: '⏪ Prête',        color: '#374151', bg: '#F3F4F6' },
    cancelled:  { label: '✖ Annulée',           next: '',           nextLabel: '',                         color: '#991B1B', bg: '#FEE2E2' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    urgent: { label: '🔴 Urgent', color: '#991B1B', bg: '#FEE2E2' },
    vip:    { label: '⭐ VIP',    color: '#92400E', bg: '#FEF3C7' },
}

interface Props {
    order: Order | null
    onClose: () => void
    onStatusChange: (orderId: string, status: string) => void
    isPending: boolean
    roleSlug: string
    onOrderUpdate?: (updatedOrder: any) => void
}

export default function OrderDrawer({ order, onClose, onStatusChange, isPending, roleSlug, onOrderUpdate }: Props) {
    const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null)
    const [isVisible, setIsVisible] = useState(false)

    // États d'édition inline
    const [editName, setEditName] = useState(false)
    const [nameVal, setNameVal] = useState('')
    
    const [editPhone, setEditPhone] = useState(false)
    const [phoneVal, setPhoneVal] = useState('')
    
    const [editDate, setEditDate] = useState(false)
    const [dateVal, setDateVal] = useState('')
    
    const [isSaving, setIsSaving] = useState<string | null>(null) // 'name' | 'phone' | 'date'

    useEffect(() => {
        if (order) {
            setNameVal(order.customer_name)
            setPhoneVal(order.customer_contact || '')
            try {
                const dateObj = new Date(order.pickup_date)
                if (!isNaN(dateObj.getTime())) {
                    const tzOffset = dateObj.getTimezoneOffset() * 60000
                    const localISOTime = (new Date(dateObj.getTime() - tzOffset)).toISOString().slice(0, 16)
                    setDateVal(localISOTime)
                } else {
                    setDateVal('')
                }
            } catch (e) {
                setDateVal('')
            }
            
            setEditName(false)
            setEditPhone(false)
            setEditDate(false)
        }
    }, [order])

    const saveField = async (field: 'name' | 'phone' | 'date') => {
        if (!order) return
        setIsSaving(field)
        
        let details: { customer_name?: string; customer_contact?: string; pickup_date?: string } = {}
        if (field === 'name') details.customer_name = nameVal
        else if (field === 'phone') details.customer_contact = phoneVal || undefined
        else if (field === 'date') {
            try {
                const parsedDate = new Date(dateVal)
                if (isNaN(parsedDate.getTime())) {
                    toast.error("Date invalide")
                    setIsSaving(null)
                    return
                }
                details.pickup_date = parsedDate.toISOString()
            } catch (e) {
                toast.error("Date invalide")
                setIsSaving(null)
                return
            }
        }
        
        const res = await updateOrderDetails(order.id, details)
        if (res.success) {
            toast.success("Commande mise à jour !")
            if (onOrderUpdate) {
                onOrderUpdate({ id: order.id, ...details })
            }
            if (field === 'name') setEditName(false)
            else if (field === 'phone') setEditPhone(false)
            else if (field === 'date') setEditDate(false)
        } else {
            toast.error(res.error || "Erreur lors de la mise à jour")
        }
        setIsSaving(null)
    }

    const isAuthorized = ['vendeur', 'caissier', 'gerant', 'super_admin'].includes(roleSlug)

    useEffect(() => {
        if (order) {
            requestAnimationFrame(() => setIsVisible(true))
            const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
            document.addEventListener('keydown', handleEsc)
            document.body.style.overflow = 'hidden'
            return () => {
                document.removeEventListener('keydown', handleEsc)
                document.body.style.overflow = ''
            }
        } else {
            setIsVisible(false)
        }
    }, [order])

    const handleClose = () => {
        setIsVisible(false)
        setTimeout(onClose, 300)
    }

    if (!order) return null

    let parsedCustomizations: Array<{ name: string; notes: string; image_url: string }> = []
    let isJsonCustomization = false
    try {
        if (order.customization_notes && (order.customization_notes.startsWith('[') || order.customization_notes.startsWith('{'))) {
            parsedCustomizations = JSON.parse(order.customization_notes)
            isJsonCustomization = Array.isArray(parsedCustomizations)
        }
    } catch (e) {
        console.warn('Failed to parse customization notes JSON', e)
    }

    const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
    const priority = order.priority && order.priority !== 'normale' ? PRIORITY_CONFIG[order.priority] : null
    const pickupDate = new Date(order.pickup_date)
    const now = new Date()
    const diffMs = pickupDate.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    let countdownText = ''
    let countdownColor = 'var(--color-muted)'
    if (diffMs < 0) {
        countdownText = '🔴 En retard'
        countdownColor = '#D94F38'
    } else if (diffHours < 2) {
        countdownText = `⚠️ Dans ${Math.max(0, Math.floor(diffMs / 60000))} min`
        countdownColor = '#F59E0B'
    } else if (diffDays < 1) {
        countdownText = `Dans ${diffHours}h`
        countdownColor = 'var(--color-text)'
    } else {
        countdownText = `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`
        countdownColor = 'var(--color-text)'
    }

    const canAdvance = status.next && order.status !== 'completed' && order.status !== 'cancelled'

    return (
        <>
            {/* Overlay */}
            <div 
                onClick={handleClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    backgroundColor: isVisible ? 'rgba(45,27,14,0.5)' : 'transparent',
                    backdropFilter: isVisible ? 'blur(4px)' : 'none',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                }}
            />

            {/* Drawer */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '420px',
                maxWidth: '100vw',
                zIndex: 201,
                background: 'white',
                boxShadow: '-8px 0 30px rgba(45,27,14,0.12)',
                transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1.5px solid var(--color-border)',
                    background: 'var(--color-cream)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                                Détail commande
                            </div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#2D1B0E' }}>
                                {order.order_number ? `#${order.order_number}` : order.customer_name}
                            </h2>
                        </div>
                        <button 
                            onClick={handleClose} 
                            className="btn-ghost" 
                            style={{ minHeight: '36px', padding: '0 8px', marginTop: '-4px' }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        <span style={{
                            padding: '4px 12px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: 700,
                            color: status.color, background: status.bg
                        }}>
                            {status.label}
                        </span>
                        {priority && (
                            <span style={{
                                padding: '4px 12px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: 700,
                                color: priority.color, background: priority.bg
                            }}>
                                {priority.label}
                            </span>
                        )}
                    </div>
                </div>

                {/* Contenu scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* Client */}
                    <section style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                            Client
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Nom */}
                            <div style={{
                                background: 'var(--color-cream)', borderRadius: 'var(--radius-md)', padding: '14px 16px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: '0.95rem', fontWeight: 700, color: '#2D1B0E', minHeight: '52px'
                            }}>
                                {editName ? (
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            value={nameVal}
                                            onChange={e => setNameVal(e.target.value)}
                                            style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1.5px solid var(--color-border)', outline: 'none', fontSize: '0.9rem', fontWeight: 600 }}
                                            disabled={isSaving === 'name'}
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => saveField('name')}
                                            disabled={isSaving === 'name'}
                                            style={{ background: '#34A853', color: 'white', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        >
                                            {isSaving === 'name' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        </button>
                                        <button
                                            onClick={() => { setEditName(false); setNameVal(order.customer_name) }}
                                            disabled={isSaving === 'name'}
                                            style={{ background: 'white', color: 'var(--color-muted)', border: '1.5px solid var(--color-border)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span>👤 {order.customer_name}</span>
                                        {isAuthorized && (
                                            <button
                                                onClick={() => setEditName(true)}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '4px' }}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Téléphone */}
                            <div style={{
                                background: 'var(--color-cream)', borderRadius: 'var(--radius-md)', padding: '14px 16px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: '0.9rem', fontWeight: 600, color: '#2D1B0E', minHeight: '52px'
                            }}>
                                {editPhone ? (
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                        <input
                                            type="tel"
                                            value={phoneVal}
                                            onChange={e => setPhoneVal(e.target.value)}
                                            placeholder="Numéro de téléphone"
                                            style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1.5px solid var(--color-border)', outline: 'none', fontSize: '0.9rem', fontWeight: 600 }}
                                            disabled={isSaving === 'phone'}
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => saveField('phone')}
                                            disabled={isSaving === 'phone'}
                                            style={{ background: '#34A853', color: 'white', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        >
                                            {isSaving === 'phone' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        </button>
                                        <button
                                            onClick={() => { setEditPhone(false); setPhoneVal(order.customer_contact || '') }}
                                            disabled={isSaving === 'phone'}
                                            style={{ background: 'white', color: 'var(--color-muted)', border: '1.5px solid var(--color-border)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span>📞 {order.customer_contact || 'Non renseigné'}</span>
                                        {isAuthorized && (
                                            <button
                                                onClick={() => setEditPhone(true)}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '4px' }}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Articles */}
                    <section style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                            Articles à préparer
                        </div>
                        <div style={{
                            background: 'var(--color-cream)', borderRadius: 'var(--radius-md)', padding: '4px 0',
                            overflow: 'hidden'
                        }}>
                            {order.order_items.map((item, i) => {
                                const itemFullName = item.products?.name ?? item.name ?? 'Produit'
                                const customInfo = isJsonCustomization 
                                    ? parsedCustomizations.find(c => c.name.toLowerCase() === itemFullName.toLowerCase())
                                    : null

                                return (
                                    <div key={item.id} style={{
                                        padding: '12px 16px',
                                        borderBottom: i < order.order_items.length - 1 ? '1px solid var(--color-border)' : 'none',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{
                                                background: 'linear-gradient(135deg, #C4836A, #C78A4A)',
                                                color: 'white',
                                                fontWeight: 800,
                                                fontSize: '0.8rem',
                                                width: '28px', height: '28px',
                                                borderRadius: '8px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                {item.quantity}
                                            </span>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2D1B0E', flex: 1 }}>
                                                {itemFullName}
                                            </span>
                                        </div>

                                        {customInfo && (customInfo.notes || customInfo.image_url) && (
                                            <div style={{
                                                marginLeft: '38px',
                                                background: '#FFF9F0',
                                                border: '1px dashed #EDCFBF',
                                                borderRadius: '10px',
                                                padding: '10px 12px',
                                                fontSize: '0.82rem',
                                                color: '#5C3D2E',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px'
                                            }}>
                                                {customInfo.notes && (
                                                    <div style={{ fontStyle: 'italic', lineHeight: 1.45 }}>
                                                        &quot;{customInfo.notes}&quot;
                                                    </div>
                                                )}
                                                {customInfo.image_url && (
                                                    <div 
                                                        onClick={() => setFullscreenImageUrl(customInfo.image_url)}
                                                        style={{
                                                            position: 'relative',
                                                            borderRadius: '8px',
                                                            overflow: 'hidden',
                                                            cursor: 'pointer',
                                                            border: '1px solid var(--color-border)',
                                                            width: '90px',
                                                            height: '60px',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <img 
                                                            src={customInfo.image_url} 
                                                            alt="Photo d'inspiration"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    {/* Personnalisation (ancienne version textuelle brute, masquée si JSON décodé par article) */}
                    {!isJsonCustomization && (order.customization_notes || order.custom_image_url) && (
                        <section style={{ marginBottom: '24px' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                                ✏️ Personnalisation
                            </div>

                            {order.customization_notes && (
                                <div style={{
                                    background: '#FFF9F0',
                                    border: '1.5px dashed #EDCFBF',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '14px 16px',
                                    fontSize: '0.88rem',
                                    color: '#5C3D2E',
                                    lineHeight: 1.6,
                                    fontStyle: 'italic',
                                    marginBottom: order.custom_image_url ? '12px' : 0
                                }}>
                                    &quot;{order.customization_notes}&quot;
                                </div>
                            )}

                            {order.custom_image_url && (
                                <div 
                                    onClick={() => setFullscreenImageUrl(order.custom_image_url)}
                                    style={{
                                        position: 'relative',
                                        borderRadius: 'var(--radius-md)',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        border: '1.5px solid var(--color-border)',
                                        aspectRatio: '16/10'
                                    }}
                                >
                                    <img 
                                        src={order.custom_image_url} 
                                        alt="Photo d'inspiration"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    <div style={{
                                        position: 'absolute', bottom: '8px', right: '8px',
                                        background: 'rgba(0,0,0,0.6)', borderRadius: '8px',
                                        padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                                        color: 'white', fontSize: '0.7rem', fontWeight: 600
                                    }}>
                                        <Maximize2 size={12} /> Agrandir
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* Date de retrait */}
                    <section style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                            📅 Date de retrait
                        </div>
                        <div style={{
                            background: 'var(--color-cream)', borderRadius: 'var(--radius-md)', padding: '14px 16px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '52px'
                        }}>
                            {editDate ? (
                                <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                    <input
                                        type="datetime-local"
                                        value={dateVal}
                                        onChange={e => setDateVal(e.target.value)}
                                        style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1.5px solid var(--color-border)', outline: 'none', fontSize: '0.85rem', fontWeight: 600 }}
                                        disabled={isSaving === 'date'}
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => saveField('date')}
                                        disabled={isSaving === 'date'}
                                        style={{ background: '#34A853', color: 'white', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    >
                                        {isSaving === 'date' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    </button>
                                    <button
                                        onClick={() => { setEditDate(false); try { setDateVal(new Date(order.pickup_date).toISOString().slice(0, 16)) } catch(e){} }}
                                        disabled={isSaving === 'date'}
                                        style={{ background: 'white', color: 'var(--color-muted)', border: '1.5px solid var(--color-border)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#2D1B0E' }}>
                                        {!isNaN(pickupDate.getTime())
                                            ? pickupDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                                            : 'Non définie'}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            fontSize: '0.78rem', fontWeight: 700, color: countdownColor,
                                            padding: '3px 10px', borderRadius: '99px',
                                            background: countdownColor === '#D94F38' ? '#FEF2F2' : (countdownColor === '#F59E0B' ? '#FEF3C7' : 'transparent')
                                        }}>
                                            {countdownText}
                                        </span>
                                        {isAuthorized && (
                                            <button
                                                onClick={() => setEditDate(true)}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: '4px' }}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>
                </div>

                {/* Action fixe en bas (Avancer & Reculer) */}
                {((status.next && order.status !== 'completed' && order.status !== 'cancelled') || status.prev) && (
                    <div style={{
                        padding: '16px 24px',
                        borderTop: '1.5px solid var(--color-border)',
                        background: 'white',
                        flexShrink: 0,
                        display: 'flex',
                        gap: '12px'
                    }}>
                        {status.prev && (
                            <button
                                onClick={() => onStatusChange(order.id, status.prev!)}
                                disabled={isPending}
                                className="btn-secondary"
                                style={{
                                    flex: 1,
                                    minHeight: '48px',
                                    fontSize: '0.9rem',
                                    fontWeight: 700,
                                    color: '#9C8070',
                                    border: '1.5px solid var(--color-border)',
                                    background: 'white',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {status.prevLabel}
                            </button>
                        )}
                        {status.next && order.status !== 'completed' && order.status !== 'cancelled' && (
                            <button
                                onClick={() => onStatusChange(order.id, status.next)}
                                disabled={isPending}
                                className="btn-primary"
                                style={{
                                    flex: 2,
                                    minHeight: '48px',
                                    fontSize: '0.9rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                {status.nextLabel}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Overlay Photo plein écran */}
            {fullscreenImageUrl && (
                <div 
                    onClick={() => setFullscreenImageUrl(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 300,
                        background: 'rgba(0,0,0,0.9)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        padding: '20px'
                    }}
                >
                    <button 
                        onClick={() => setFullscreenImageUrl(null)}
                        style={{
                            position: 'absolute', top: '20px', right: '20px',
                            width: '44px', height: '44px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <X size={24} />
                    </button>
                    <img 
                        src={fullscreenImageUrl}
                        alt="Photo d'inspiration — Plein écran"
                        style={{ 
                            maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
                            borderRadius: '12px' 
                        }}
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    )
}
