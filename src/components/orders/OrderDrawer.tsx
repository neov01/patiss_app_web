'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, Maximize2, Pencil, Check, Loader2, Wallet, AlertTriangle, ArrowRight, BadgeAlert, Coins, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { updateOrderDetails } from '@/lib/actions/orders'
import AddPaymentModal from './AddPaymentModal'

export interface OrderPayment {
    id: string
    amount: number
    payment_method: string
    payment_date: string
    note: string | null
}

interface OrderItem {
    id: string
    quantity: number
    unit_price: number
    products: { name: string } | null
    name?: string | null
}

export interface Order {
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
    payment_status: string
    paid_amount: number
    balance: number
    total_amount: number
    deposit_amount: number
    order_payments?: OrderPayment[]
    creator_profile?: {
        full_name: string
        role_slug: string
    } | null
}

const STATUS_CONFIG: Record<string, { label: string; next: string; nextLabel: string; prev?: string; prevLabel?: string; color: string; bg: string }> = {
    confirmed:       { label: '⏳ Confirmée',          next: 'in_preparation', nextLabel: '👨‍🍳 Lancer en production', color: '#92400E', bg: '#FEF3C7' },
    in_preparation:  { label: '👨‍🍳 En préparation',   next: 'ready',          nextLabel: '✅ Marquer Prête',          prev: 'confirmed',       prevLabel: '⏪ Confirmée', color: '#1E40AF', bg: '#DBEAFE' },
    ready:           { label: '✅ Prête',             next: 'delivered',      nextLabel: '✔ Livrer / Retirer',        prev: 'in_preparation',  prevLabel: '⏪ En préparation', color: '#065F46', bg: '#D1FAE5' },
    awaiting_pickup: { label: '📦 Attente retrait',   next: 'delivered',      nextLabel: '✔ Livrer / Retirer',        prev: 'ready',           prevLabel: '⏪ Prête', color: '#065F46', bg: '#D1FAE5' },
    delivered:       { label: '✔ Livrée / Retirée',   next: '',               nextLabel: '',                          prev: 'ready',           prevLabel: '⏪ Prête', color: '#374151', bg: '#F3F4F6' },
    cancelled:       { label: '✖ Annulée',            next: '',               nextLabel: '',                                                   color: '#991B1B', bg: '#FEE2E2' },
    // Compatibilité ascendante pour les anciennes commandes
    pending:         { label: '⏳ Confirmée',          next: 'in_preparation', nextLabel: '👨‍🍳 Lancer en production', color: '#92400E', bg: '#FEF3C7' },
    production:      { label: '👨‍🍳 En préparation',   next: 'ready',          nextLabel: '✅ Marquer Prête',          prev: 'confirmed',       prevLabel: '⏪ Confirmée', color: '#1E40AF', bg: '#DBEAFE' },
    completed:       { label: '✔ Livrée / Retirée',   next: '',               nextLabel: '',                          prev: 'ready',           prevLabel: '⏪ Prête', color: '#374151', bg: '#F3F4F6' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    urgent: { label: '🔴 Urgent', color: '#991B1B', bg: '#FEE2E2' },
    vip:    { label: '⭐ VIP',    color: '#92400E', bg: '#FEF3C7' },
}

const PAYMENT_METHODS = [
    { value: 'cash', label: '💵 Espèces' },
    { value: 'orange_money', label: '🟠 Orange Money' },
    { value: 'wave', label: '🌊 Wave' },
    { value: 'mobile_money', label: '🍌 MTN MOMO' },
    { value: 'moov_money', label: '🔵 Moov Money' },
    { value: 'bank_transfer', label: '🏦 Virement' },
    { value: 'other', label: '📝 Autre' }
]

interface Props {
    order: Order | null
    onClose: () => void
    onStatusChange: (orderId: string, status: string) => void
    isPending: boolean
    roleSlug: string
    onOrderUpdate?: (updatedOrder: { id: string } & Record<string, unknown>) => void
    currency?: string
}

export default function OrderDrawer({ order, onClose, onStatusChange, isPending, roleSlug, onOrderUpdate, currency = 'FCFA' }: Props) {
    const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null)
    const [isVisible, setIsVisible] = useState(false)

    // États financiers
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [showDebtAlert, setShowDebtAlert] = useState(false)
    const [debtNote, setDebtNote] = useState('')
    const [isSavingDebt, setIsSavingDebt] = useState(false)

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
            const timer = window.setTimeout(() => {
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
                } catch {
                    setDateVal('')
                }

                setEditName(false)
                setEditPhone(false)
                setEditDate(false)
            }, 0)
            return () => window.clearTimeout(timer)
        }
    }, [order])

    const saveField = async (field: 'name' | 'phone' | 'date') => {
        if (!order) return
        setIsSaving(field)
        
        const details: { customer_name?: string; customer_contact?: string; pickup_date?: string } = {}
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
            } catch {
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

    const handleClose = useCallback(() => {
        setIsVisible(false)
        setTimeout(onClose, 300)
    }, [onClose])

    useEffect(() => {
        if (order) {
            const frame = requestAnimationFrame(() => setIsVisible(true))
            const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
            document.addEventListener('keydown', handleEsc)
            document.body.style.overflow = 'hidden'
            return () => {
                cancelAnimationFrame(frame)
                document.removeEventListener('keydown', handleEsc)
                document.body.style.overflow = ''
            }
        } else {
            const timer = window.setTimeout(() => setIsVisible(false), 0)
            return () => window.clearTimeout(timer)
        }
    }, [order, handleClose])

    const handleDeliverWithDebt = async () => {
        if (!order) return
        setIsSavingDebt(true)
        try {
            let updatedNotes = order.customization_notes || ''
            const debtComment = `[DETTE] Commande livrée avec un reste à payer de ${order.balance} FCFA le ${new Date().toLocaleDateString('fr-FR')}. Note: ${debtNote.trim() || 'Aucune'}`
            if (updatedNotes) {
                updatedNotes += `\n${debtComment}`
            } else {
                updatedNotes = debtComment
            }

            const result = await updateOrderDetails(order.id, {
                customization_notes: updatedNotes
            })

            if (result && typeof result === 'object' && 'error' in result && result.error) {
                toast.error("Erreur lors de l'enregistrement de la dette : " + result.error)
            } else {
                if (onOrderUpdate) {
                    onOrderUpdate({ ...order, customization_notes: updatedNotes })
                }
                setShowDebtAlert(false)
                onStatusChange(order.id, 'delivered')
            }
        } catch (err) {
            console.error(err)
            toast.error("Une erreur est survenue.")
        } finally {
            setIsSavingDebt(false)
        }
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
    if (diffMs < 0) {
        countdownText = 'En retard'
    } else if (diffHours < 2) {
        countdownText = `Dans ${Math.max(0, Math.floor(diffMs / 60000))} min`
    } else if (diffDays < 1) {
        countdownText = `Dans ${diffHours}h`
    } else {
        countdownText = `Dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`
    }

    return (
        <>
            {/* Overlay */}
            <div 
                onClick={handleClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    backgroundColor: isVisible ? 'rgba(26, 28, 26, 0.3)' : 'transparent',
                    backdropFilter: isVisible ? 'blur(8px)' : 'none',
                    transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
                    cursor: 'pointer'
                }}
            />

            {/* Drawer */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '460px',
                maxWidth: '100vw',
                zIndex: 201,
                background: 'var(--color-lift)',
                boxShadow: 'var(--shadow-lg)',
                transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-lift)',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                Détail commande
                            </div>
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                {order.order_number ? `#${order.order_number}` : order.customer_name}
                            </h2>
                        </div>
                        <button 
                            onClick={handleClose} 
                            title="Fermer"
                            style={{ 
                                width: '38px', 
                                height: '38px', 
                                borderRadius: '50%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--color-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                outline: 'none',
                                marginTop: '-4px',
                                marginRight: '-8px'
                            }}
                            className="hover:bg-[var(--color-well)] hover:text-[var(--color-text)]"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                        <span className={`badge badge-${order.status}`} style={{ fontSize: '0.8rem', padding: '5px 12px' }}>
                            {status.label}
                        </span>
                        {priority && (
                            <span className={`badge badge-${order.priority === 'urgent' ? 'alert' : 'pending'}`} style={{ fontSize: '0.8rem', padding: '5px 12px' }}>
                                {priority.label}
                            </span>
                        )}
                    </div>
                </div>

                {/* Contenu scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* Client */}
                    <section style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                            Client
                        </div>
                        
                        <div style={{ 
                            background: 'var(--color-well)', 
                            borderRadius: 'var(--radius-md)', 
                            padding: '16px',
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '12px' 
                        }}>
                            {/* Nom */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Nom
                                </div>
                                {editName ? (
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            value={nameVal}
                                            onChange={e => setNameVal(e.target.value)}
                                            style={{ flex: 1, padding: '0 12px', height: '40px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', outline: 'none', fontSize: '0.9rem', fontWeight: 600, background: 'var(--color-lift)', color: 'var(--color-text)' }}
                                            disabled={isSaving === 'name'}
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => saveField('name')}
                                            disabled={isSaving === 'name'}
                                            style={{ background: 'var(--color-secondary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'opacity 0.2s' }}
                                            className="hover:opacity-90"
                                            title="Enregistrer"
                                        >
                                            {isSaving === 'name' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        </button>
                                        <button
                                            onClick={() => { setEditName(false); setNameVal(order.customer_name) }}
                                            disabled={isSaving === 'name'}
                                            style={{ background: 'var(--color-lift)', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                            className="hover:bg-[var(--color-well)]"
                                            title="Annuler"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '36px' }}>
                                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            👤 {order.customer_name}
                                        </span>
                                        {isAuthorized && (
                                            <button
                                                onClick={() => setEditName(true)}
                                                style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-muted)', transition: 'all 0.2s' }}
                                                className="hover:bg-[var(--color-lift)] hover:text-[var(--color-text)]"
                                                title="Modifier le nom"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Separator */}
                            <div style={{ height: '1px', background: 'var(--color-border)', opacity: 0.3 }} />

                            {/* Téléphone */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Téléphone
                                </div>
                                {editPhone ? (
                                    <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                        <input
                                            type="tel"
                                            value={phoneVal}
                                            onChange={e => setPhoneVal(e.target.value)}
                                            placeholder="Numéro de téléphone"
                                            style={{ flex: 1, padding: '0 12px', height: '40px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', outline: 'none', fontSize: '0.9rem', fontWeight: 600, background: 'var(--color-lift)', color: 'var(--color-text)' }}
                                            disabled={isSaving === 'phone'}
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => saveField('phone')}
                                            disabled={isSaving === 'phone'}
                                            style={{ background: 'var(--color-secondary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'opacity 0.2s' }}
                                            className="hover:opacity-90"
                                            title="Enregistrer"
                                        >
                                            {isSaving === 'phone' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        </button>
                                        <button
                                            onClick={() => { setEditPhone(false); setPhoneVal(order.customer_contact || '') }}
                                            disabled={isSaving === 'phone'}
                                            style={{ background: 'var(--color-lift)', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                            className="hover:bg-[var(--color-well)]"
                                            title="Annuler"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '36px' }}>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            📞 {order.customer_contact || 'Non renseigné'}
                                        </span>
                                        {isAuthorized && (
                                            <button
                                                onClick={() => setEditPhone(true)}
                                                style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-muted)', transition: 'all 0.2s' }}
                                                className="hover:bg-[var(--color-lift)] hover:text-[var(--color-text)]"
                                                title="Modifier le téléphone"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Articles */}
                    <section style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                            Articles à préparer
                        </div>
                        <div style={{
                            background: 'var(--color-well)', borderRadius: 'var(--radius-md)', padding: '6px 0',
                            overflow: 'hidden'
                        }}>
                            {order.order_items.map((item, i) => {
                                const itemFullName = item.products?.name ?? item.name ?? 'Produit'
                                const customInfo = isJsonCustomization 
                                    ? parsedCustomizations.find(c => c.name.toLowerCase() === itemFullName.toLowerCase())
                                    : null

                                return (
                                    <div key={item.id} style={{
                                        padding: '14px 16px',
                                        borderBottom: i < order.order_items.length - 1 ? '1px solid var(--color-border)' : 'none',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{
                                                background: 'rgba(129, 84, 49, 0.08)',
                                                color: 'var(--color-primary)',
                                                fontWeight: 800,
                                                fontSize: '0.85rem',
                                                width: '28px', height: '28px',
                                                borderRadius: '8px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                {item.quantity}
                                            </span>
                                            <span style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--color-text)', flex: 1 }}>
                                                {itemFullName}
                                            </span>
                                        </div>

                                        {customInfo && (customInfo.notes || customInfo.image_url) && (
                                            <div style={{
                                                marginLeft: '40px',
                                                background: 'var(--color-lift)',
                                                border: '1px dashed var(--color-border)',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '12px',
                                                fontSize: '0.85rem',
                                                color: 'var(--color-text)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '10px'
                                            }}>
                                                {customInfo.notes && (
                                                    <div style={{ fontStyle: 'italic', lineHeight: 1.45, opacity: 0.9 }}>
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
                                                            width: '100px',
                                                            height: '66px',
                                                            flexShrink: 0,
                                                            transition: 'transform 0.2s ease-in-out'
                                                        }}
                                                        className="hover:scale-[1.02] active:scale-[0.98]"
                                                    >
                                                        <Image
                                                            src={customInfo.image_url}
                                                            alt="Photo d'inspiration"
                                                            fill
                                                            unoptimized
                                                            sizes="100px"
                                                            style={{ objectFit: 'cover' }}
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
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                                Personnalisation
                            </div>

                            {order.customization_notes && (
                                <div style={{
                                    background: 'var(--color-well)',
                                    border: '1px dashed var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '14px 16px',
                                    fontSize: '0.88rem',
                                    color: 'var(--color-text)',
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
                                        border: '1px solid var(--color-border)',
                                        aspectRatio: '16/10',
                                        transition: 'transform 0.2s ease-in-out'
                                    }}
                                    className="hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    <Image
                                        src={order.custom_image_url}
                                        alt="Photo d'inspiration"
                                        fill
                                        unoptimized
                                        sizes="640px"
                                        style={{ objectFit: 'cover' }}
                                    />
                                    <div style={{
                                        position: 'absolute', bottom: '8px', right: '8px',
                                        background: 'rgba(26, 28, 26, 0.75)', borderRadius: '8px',
                                        padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px',
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
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                            Date de retrait
                        </div>
                        <div style={{
                            background: 'var(--color-well)', borderRadius: 'var(--radius-md)', padding: '16px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '52px'
                        }}>
                            {editDate ? (
                                <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                                    <input
                                        type="datetime-local"
                                        value={dateVal}
                                        onChange={e => setDateVal(e.target.value)}
                                        style={{ flex: 1, padding: '0 12px', height: '40px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', outline: 'none', fontSize: '0.88rem', fontWeight: 600, background: 'var(--color-lift)', color: 'var(--color-text)' }}
                                        disabled={isSaving === 'date'}
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => saveField('date')}
                                        disabled={isSaving === 'date'}
                                        style={{ background: 'var(--color-secondary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'opacity 0.2s' }}
                                        className="hover:opacity-90"
                                        title="Enregistrer"
                                    >
                                        {isSaving === 'date' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    </button>
                                    <button
                                        onClick={() => { setEditDate(false); try { setDateVal(new Date(order.pickup_date).toISOString().slice(0, 16)) } catch {} }}
                                        disabled={isSaving === 'date'}
                                        style={{ background: 'var(--color-lift)', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                        className="hover:bg-[var(--color-well)]"
                                        title="Annuler"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                        {!isNaN(pickupDate.getTime())
                                            ? pickupDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                                            : 'Non définie'}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className={`badge ${
                                            diffMs < 0 ? 'badge-alert' : (diffHours < 2 || diffDays < 1 ? 'badge-pending' : 'badge-completed')
                                        }`} style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                                            {countdownText}
                                        </span>
                                        {isAuthorized && (
                                            <button
                                                onClick={() => setEditDate(true)}
                                                style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-muted)', transition: 'all 0.2s' }}
                                                className="hover:bg-[var(--color-lift)] hover:text-[var(--color-text)]"
                                                title="Modifier la date"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    {/* Suivi Financier & Paiements */}
                    <section style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                            Suivi Financier
                        </div>

                        <div style={{
                            background: 'var(--color-well)', borderRadius: 'var(--radius-md)', padding: '16px',
                            display: 'flex', flexDirection: 'column', gap: '14px'
                        }}>
                            {/* Récapitulatif financier */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Total</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-text)' }}>{Number(order.total_amount).toLocaleString('fr-FR')} {currency}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Payé</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#065F46' }}>{Number(order.paid_amount || 0).toLocaleString('fr-FR')} {currency}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Reste</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: Number(order.balance || 0) > 0 ? '#B91C1C' : '#065F46' }}>{Number(order.balance || 0).toLocaleString('fr-FR')} {currency}</div>
                                </div>
                            </div>

                            {/* Bouton tactile d'action d'enregistrement de paiement */}
                            {order.status !== 'cancelled' && (
                                <button
                                    onClick={() => setIsPaymentModalOpen(true)}
                                    style={{
                                        width: '100%',
                                        height: '48px',
                                        background: 'rgba(220, 95, 74, 0.08)',
                                        border: '1px dashed var(--color-primary)',
                                        color: 'var(--color-primary)',
                                        borderRadius: '9999px',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                    }}
                                    className="hover:bg-[rgba(220,95,74,0.14)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
                                >
                                    <Coins size={16} />
                                    Enregistrer un paiement
                                </button>
                            )}

                            {/* Ligne de séparation si historique présent */}
                            {order.order_payments && order.order_payments.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '2px' }} />
                            )}

                            {/* Historique des paiements */}
                            {order.order_payments && order.order_payments.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                        Historique des paiements ({order.order_payments.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {order.order_payments
                                            .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
                                            .map((payment) => {
                                                const pDate = new Date(payment.payment_date)
                                                const methodConfig = PAYMENT_METHODS.find(pm => pm.value === payment.payment_method)
                                                return (
                                                    <div key={payment.id} style={{
                                                        background: 'var(--color-lift)', padding: '10px 12px',
                                                        borderRadius: '8px', border: '1px solid var(--color-border)',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        fontSize: '0.8rem'
                                                    }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                                                                {Number(payment.amount).toLocaleString('fr-FR')} {currency}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>
                                                                {methodConfig ? methodConfig.label : payment.payment_method} · {!isNaN(pDate.getTime()) ? pDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                            </div>
                                                            {payment.note && (
                                                                <div style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--color-text)', opacity: 0.85, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <MessageSquare size={10} /> &quot;{payment.note}&quot;
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.78rem', color: 'var(--color-muted)', fontStyle: 'italic', textAlign: 'center', padding: '4px' }}>
                                    Aucun paiement enregistré pour le moment.
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Traçabilité / Créateur */}
                    {order.creator_profile && (
                        <section style={{ marginBottom: '24px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                                Traçabilité
                            </div>
                            <div style={{
                                background: 'var(--color-well)', borderRadius: 'var(--radius-md)', padding: '16px',
                                display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.88rem', color: 'var(--color-text)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>Enregistrée par :</span>
                                    <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        👤 {order.creator_profile.full_name} 
                                        <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', background: 'rgba(129, 84, 49, 0.08)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                            {order.creator_profile.role_slug === 'gerant' ? 'Gérant' : order.creator_profile.role_slug === 'vendeur' ? 'Vendeur' : order.creator_profile.role_slug === 'patissier' ? 'Pâtissier' : order.creator_profile.role_slug}
                                        </span>
                                    </span>
                                </div>
                                {order.created_at && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '10px', marginTop: '2px', opacity: 0.9 }}>
                                        <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>Date de saisie :</span>
                                        <span style={{ fontWeight: 600 }}>
                                            {(() => {
                                                const d = new Date(order.created_at)
                                                return !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Inconnue'
                                            })()}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </div>

                {/* Action fixe en bas (Avancer & Reculer) */}
                {((status.next && order.status !== 'completed' && order.status !== 'cancelled') || status.prev) && (
                    <div style={{
                        padding: '20px 24px',
                        borderTop: '1px solid var(--color-border)',
                        background: 'var(--color-lift)',
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
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {status.prevLabel}
                            </button>
                        )}
                        {status.next && order.status !== 'completed' && order.status !== 'cancelled' && (
                            <button
                                onClick={() => {
                                    if (status.next === 'delivered' && Number(order.balance || 0) > 0) {
                                        setShowDebtAlert(true)
                                    } else {
                                        onStatusChange(order.id, status.next)
                                    }
                                }}
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

            {/* Modale d'ajout de paiement */}
            <AddPaymentModal
                open={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                orderId={order.id}
                totalAmount={Number(order.total_amount)}
                paidAmount={Number(order.paid_amount || 0)}
                balance={Number(order.balance || 0)}
                currency={currency}
                onSuccess={() => {
                    if (onOrderUpdate) {
                        // Mettre à jour l'état de la commande localement pour forcer le re-rendu
                        // L'action addOrderPayment revalidera la page, ce qui déclenchera un refresh complet.
                    }
                }}
            />

            {/* Boîte de dialogue d'alerte de dette (Livraison non soldée) */}
            {showDebtAlert && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '16px'
                }}>
                    <div style={{
                        background: 'var(--color-bg)', width: '100%', maxWidth: '440px',
                        borderRadius: '16px', border: '1.5px solid var(--color-border)',
                        boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
                        overflow: 'hidden', padding: '24px', gap: '16px'
                    }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: '#B91C1C' }}>
                            <AlertTriangle size={28} style={{ flexShrink: 0 }} />
                            <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem' }}>
                                Commande non soldée !
                            </h3>
                        </div>

                        <div style={{ fontSize: '0.88rem', color: 'var(--color-text)', lineHeight: 1.5 }}>
                            Cette commande n’est pas encore soldée.
                            <br />
                            Reste à payer : <strong style={{ color: '#B91C1C', fontSize: '1rem' }}>{Number(order.balance).toLocaleString('fr-FR')} {currency}</strong>.
                            <br />
                            Voulez-vous encaisser le solde maintenant ?
                        </div>

                        {/* Optionnel : Commentaire de dette */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-muted)' }}>
                                Note / Commentaire sur la dette (Requis pour forcer) :
                            </span>
                            <textarea
                                value={debtNote}
                                onChange={e => setDebtNote(e.target.value)}
                                placeholder="Ex: Client régulier, paiera d'ici la fin du mois..."
                                className="input"
                                style={{
                                    width: '100%', minHeight: '60px', padding: '8px 12px',
                                    fontSize: '0.8rem', borderRadius: '8px', border: '1.5px solid var(--color-border)',
                                    background: 'var(--color-lift)', resize: 'none', fontFamily: 'inherit',
                                    color: 'var(--color-text)'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            <button
                                onClick={() => {
                                    setShowDebtAlert(false)
                                    setIsPaymentModalOpen(true)
                                }}
                                className="btn-primary"
                                style={{ minHeight: '44px', width: '100%', fontWeight: 700 }}
                            >
                                💵 Encaisser le solde
                            </button>
                            <button
                                onClick={handleDeliverWithDebt}
                                disabled={!debtNote.trim() || isSavingDebt}
                                className="btn-secondary"
                                style={{
                                    minHeight: '44px', width: '100%', fontWeight: 700,
                                    borderColor: '#D97706', color: '#D97706', background: 'rgba(217, 119, 6, 0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                            >
                                {isSavingDebt ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <>
                                        <ArrowRight size={16} />
                                        Livrer avec solde restant (Dette)
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setShowDebtAlert(false)
                                    setDebtNote('')
                                }}
                                disabled={isSavingDebt}
                                className="btn-secondary"
                                style={{ minHeight: '44px', width: '100%', fontWeight: 600, border: 'none', background: 'transparent' }}
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                    <Image
                        src={fullscreenImageUrl}
                        alt="Photo d'inspiration — Plein écran"
                        width={1600}
                        height={1200}
                        unoptimized
                        style={{ 
                            maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain',
                            borderRadius: '12px' 
                        }}
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    )
}
