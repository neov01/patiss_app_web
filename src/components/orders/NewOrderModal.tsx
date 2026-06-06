'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, User, Phone, X, Loader2, Image as ImageIcon, MapPin, Search, Grid, UserCheck, CheckCircle } from 'lucide-react'
import { createOrder } from '@/lib/actions/orders'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/image-compression'
import TouchInput from '@/components/ui/TouchInput'
import DatePicker from '@/components/ui/DatePicker'
import TimeDigiPad from '@/components/ui/TimeDigiPad'
import TouchSelect from '@/components/ui/TouchSelect'
import CatalogueModal from '@/components/caisse/CatalogueModal'
import { CRMSelector } from '@/components/caisse/CRMSelector'
import { usePhoneCRMLookup, type CRMMatch } from '@/hooks/usePhoneCRMLookup'

interface Product { id: string; name: string; selling_price: number; current_stock: number | null }

interface OrderItem {
    product_id?: string
    name: string
    quantity: number
    unit_price: number
    subtotal: number
    from_inventory: boolean
    parts?: number
    floors?: number
}

interface Props {
    open: boolean
    onClose: () => void
    products: Product[] // Initial products for fallback/default
    currency: string
    organizationId: string
}

const STATUS_OPTIONS = [
    { value: 'pending', label: 'En attente', color: 'badge-pending' },
    { value: 'production', label: 'En production', color: 'badge-production' },
    { value: 'ready', label: 'Prêt', color: 'badge-ready' },
    { value: 'completed', label: 'Livré / Retiré', color: 'badge-completed' },
]

const PRIORITY_OPTIONS = [
    { value: 'normale', label: 'Normale', color: '#3b82f6' },
    { value: 'urgent', label: 'Urgent', color: '#f59e0b' },
    { value: 'vip', label: 'VIP', color: '#10b981' },
]

const ORDER_CHANNELS = [
    { value: 'Sur place', label: '📍 Sur place' },
    { value: 'WhatsApp', label: '💬 WhatsApp' },
    { value: 'Téléphone', label: '📞 Téléphone' },
    { value: 'Instagram', label: '📸 Instagram' },
    { value: 'Messenger', label: '🔵 Messenger' },
]

const PAYMENT_METHODS = [
    { value: 'Espèces', label: '💵 Espèces' },
    { value: 'Orange Money', label: '🟠 Orange Money' },
    { value: 'Wave', label: '🌊 Wave' },
    { value: 'MTN MOMO', label: '🍌 MTN MOMO' },
    { value: 'Moov Money', label: '🔵 Moov Money' },
]

export default function NewOrderModal({ open, onClose, products: initialProducts, currency, organizationId }: Props) {
    const [isPending, start] = useTransition()
    
    // Auto Order Number
    const [orderNumber, setOrderNumber] = useState('')
    
    // Header States
    const [status, setStatus] = useState('pending')
    const [priority, setPriority] = useState('normale')
    
    // Customer Logistics States
    const [clientName, setClientName] = useState('')
    const [clientPhone, setClientPhone] = useState('')
    const [receptionType, setReceptionType] = useState<'retrait' | 'livraison'>('retrait')
    const [pickupDate, setPickupDate] = useState<Date | null>(null)
    const [pickupTime, setPickupTime] = useState('')
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [orderChannel, setOrderChannel] = useState('Sur place')
    
    // Items
    const [orderItems, setOrderItems] = useState<OrderItem[]>([])
    
    // Customization
    const [customizationNotes, setCustomizationNotes] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    
    // Financials
    const [deposit, setDeposit] = useState(0)
    const [depositPaymentMethod, setDepositPaymentMethod] = useState('Espèces')
    const [paymentType, setPaymentType] = useState<'ACOMPTE' | 'SOLDE'>('ACOMPTE')

    // CRM Customer Link
    const [crmCustomerId, setCrmCustomerId] = useState<string | null>(null)
    const [crmCustomerName, setCrmCustomerName] = useState<string | null>(null)
    const [showErrors, setShowErrors] = useState(false)

    // CRM auto-lookup par téléphone
    const { match: crmPhoneMatch, isLooking: isCrmLooking } = usePhoneCRMLookup(clientPhone)

    // Search Inventory
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<Product[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [catalogModalOpen, setCatalogModalOpen] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    // Calculate totals
    const subtotal = orderItems.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0)
    const total = subtotal
    const balance = Math.max(0, total - deposit)

    useEffect(() => {
        if (open) {
            const year = new Date().getFullYear()
            const rand = Math.floor(1000 + Math.random() * 9000)
            setOrderNumber(`CMD-${year}-${rand}`)
        }
    }, [open])

    // Effacer le lien CRM si le téléphone est modifié après la liaison
    const prevPhoneRef = useRef<string>('')
    useEffect(() => {
        if (clientPhone !== prevPhoneRef.current) {
            prevPhoneRef.current = clientPhone
            if (crmCustomerId) {
                setCrmCustomerId(null)
                setCrmCustomerName(null)
            }
        }
    }, [clientPhone])

    // Quand mode Soldé : le dépôt suit automatiquement le total
    useEffect(() => {
        if (paymentType === 'SOLDE') {
            setDeposit(total)
        }
    }, [paymentType, total])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setSearchResults([])
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([])
            return
        }
        
        const fetchSearch = async () => {
            setIsSearching(true)
            const supabase = createSupabaseClient()
            const { data } = await supabase.from('products').select('id, name, selling_price, current_stock').ilike('name', `%${searchQuery}%`).limit(10)
            if (data) setSearchResults(data)
            setIsSearching(false)
        }
        
        const delay = setTimeout(fetchSearch, 300)
        return () => clearTimeout(delay)
    }, [searchQuery])

    const handleAddItem = (product: Product) => {
        setOrderItems(prev => {
            const existing = prev.find(i => i.product_id === product.id && i.from_inventory)
            if (existing) {
                return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price } : i)
            }
            return [...prev, {
                product_id: product.id,
                name: product.name,
                unit_price: product.selling_price,
                quantity: 1,
                subtotal: product.selling_price,
                from_inventory: true
            }]
        })
        setSearchQuery('')
        setSearchResults([])
    }

    const handleAddManual = () => {
        setOrderItems([...orderItems, {
            name: '',
            quantity: 1,
            unit_price: 0,
            subtotal: 0,
            from_inventory: false
        }])
    }

    const handleUpdateItem = (index: number, field: keyof OrderItem, value: any) => {
        setOrderItems(prev => {
            const newItems = [...prev]
            const item = { ...newItems[index], [field]: value }
            item.subtotal = item.quantity * item.unit_price
            newItems[index] = item
            return newItems
        })
    }

    const handleRemoveItem = (index: number) => {
        setOrderItems(prev => prev.filter((_, i) => i !== index))
    }

    function handleReset() {
        setStatus('pending')
        setPriority('normale')
        setClientName('')
        setClientPhone('')
        setReceptionType('retrait')
        setPickupDate(null)
        setPickupTime('')
        setDeliveryAddress('')
        setOrderChannel('Sur place')
        setOrderItems([])
        setCustomizationNotes('')
        setImageFile(null)
        setDeposit(0)
        setDepositPaymentMethod('Espèces')
        setPaymentType('ACOMPTE')
        setCrmCustomerId(null)
        setCrmCustomerName(null)
        setShowErrors(false)
    }

    function handleClose() {
        handleReset()
        onClose()
    }

    // Combine date + time into ISO datetime string
    const pickupDeliveryDate = (() => {
        if (!pickupDate) return ''
        const d = new Date(pickupDate)
        if (pickupTime) {
            const [hh, mm] = pickupTime.split(':')
            d.setHours(parseInt(hh), parseInt(mm), 0, 0)
        } else {
            // Default to 10:00 AM if no time specified, or just leave as is (midnight)
            // Setting to midnight local is fine as Supabase will store it correctly
            d.setHours(10, 0, 0, 0) // Default 10h for pickup if not specified
        }
        
        // Use a safe ISO-like format that Supabase likes
        const pad = (n: number) => n.toString().padStart(2, '0')
        const yyyy = d.getFullYear()
        const mm = pad(d.getMonth() + 1)
        const dd = pad(d.getDate())
        const hh = pad(d.getHours())
        const min = pad(d.getMinutes())
        
        return `${yyyy}-${mm}-${dd}T${hh}:${min}:00`
    })()

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setShowErrors(true)
        if (!clientName.trim() || !clientPhone.trim() || !pickupDate || orderItems.length === 0) {
            toast.error('Veuillez remplir tous les champs obligatoires et ajouter au moins un produit.')
            return
        }
        if (receptionType === 'livraison' && !deliveryAddress.trim()) {
            toast.error('L\'adresse de livraison est requise.')
            return
        }
        if (deposit > total) {
            toast.warning('L\'acompte ne peut pas être supérieur au total.')
            return
        }

        start(async () => {
            let customImageUrl: string | undefined

            if (imageFile) {
                try {
                    // Compression de l'image (max 1200px, qualité 0.7, format WebP)
                    const compressed = await compressImage(imageFile, { maxWidth: 1200, quality: 0.7 })
                    
                    const supabase = createSupabaseClient()
                    // On force le format .webp car notre utilitaire sort du WebP
                    const filePath = `orders/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
                    
                    const { error: uploadError } = await supabase.storage.from('order-images').upload(filePath, compressed, {
                        contentType: 'image/webp',
                        upsert: true
                    })
                    
                    if (!uploadError) {
                        const { data } = supabase.storage.from('order-images').getPublicUrl(filePath)
                        customImageUrl = data.publicUrl
                    } else {
                        toast.error('Upload de la photo échoué. Poursuite sans image.')
                    }
                } catch {
                    // Ignore storage error
                }
            }

            const result = await createOrder({
                id: crypto.randomUUID(),
                order_number: orderNumber,
                status,
                priority,
                customer_id: crmCustomerId || undefined,
                customer_name: clientName,
                customer_contact: clientPhone,
                reception_type: receptionType,
                pickup_date: pickupDeliveryDate,
                delivery_address: receptionType === 'livraison' ? deliveryAddress : undefined,
                order_channel: receptionType === 'retrait' ? orderChannel : undefined,
                subtotal,
                delivery_fee: 0,
                total_amount: total,
                deposit_amount: deposit,
                balance,
                customization_notes: customizationNotes,
                custom_image_url: customImageUrl,
                deposit_payment_method: deposit > 0 ? depositPaymentMethod : undefined,
                items: orderItems.map(item => {
                    let finalName = item.name.trim()
                    const partsStr = item.parts ? `${item.parts} parts` : ''
                    const floorsStr = item.floors ? `${item.floors} étage${item.floors > 1 ? 's' : ''}` : ''
                    const details = [partsStr, floorsStr].filter(Boolean).join(', ')
                    if (details) {
                        finalName = `${finalName} (${details})`
                    }
                    return {
                        id: crypto.randomUUID(),
                        product_id: item.product_id,
                        name: finalName,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        subtotal: item.subtotal,
                        from_inventory: item.from_inventory
                    }
                })
            })

            if ('error' in result && result.error) {
                toast.error(result.error)
                return
            }

            toast.success(`Commande #${orderNumber} créée ✓`)
            handleClose()
        })
    }

    if (!open) return null

    return (
        <>
        <div className="modal-overlay" onClick={handleClose} style={{ zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '42rem', width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '0' }} onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>

                    {/* EN-TÊTE — une seule ligne */}
                    <div style={{ padding: '12px 16px', borderBottom: '1.5px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-lift)', zIndex: 10 }}>
                        {/* Ligne 1 : titre + numéro + fermer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)' }}>Nouvelle commande</h2>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontFamily: 'monospace', background: 'var(--color-well)', padding: '2px 8px', borderRadius: '99px' }}>#{orderNumber}</span>
                            </div>
                            <button type="button" onClick={handleClose} className="btn-ghost" style={{ padding: '4px', flexShrink: 0 }}>
                                <X size={18} />
                            </button>
                        </div>
                        {/* Ligne 2 : statut + priorité */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TouchSelect
                                value={status}
                                onChange={setStatus}
                                options={STATUS_OPTIONS}
                                title="Statut de la commande"
                                style={{ flex: 1, minHeight: '32px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', padding: '0 10px' }}
                            />
                            <div style={{ display: 'flex', background: 'var(--color-well)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px', flexShrink: 0 }}>
                                {PRIORITY_OPTIONS.map(opt => (
                                    <button key={opt.value} type="button" onClick={() => setPriority(opt.value)}
                                        style={{
                                            padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700,
                                            borderRadius: '8px', border: 'none', cursor: 'pointer',
                                            transition: 'all 0.15s',
                                            background: priority === opt.value ? opt.color : 'transparent',
                                            color: priority === opt.value ? 'white' : 'var(--color-muted)',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >{opt.label}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                        {/* CRM SELECTOR */}
                        <div>
                            <label className="label">Lier à un client CRM <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: '0.78rem' }}>(optionnel)</span></label>
                            <CRMSelector
                                selectedCustomer={crmCustomerId ? { id: crmCustomerId, name: crmCustomerName || '' } : null}
                                onCustomerSelected={(id, name) => {
                                    setCrmCustomerId(id)
                                    setCrmCustomerName(name)
                                    if (!clientName.trim()) setClientName(name)
                                }}
                                onClear={() => { setCrmCustomerId(null); setCrmCustomerName(null) }}
                            />
                        </div>

                        {/* CLIENT & LOGISTIQUE */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px' }}>
                            <div>
                                <label className="label" style={{ fontSize: '0.78rem', fontWeight: 500, marginBottom: '3px' }}>Client *</label>
                                <div style={{ position: 'relative' }}>
                                    <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: showErrors && !clientName.trim() ? 'var(--color-error)' : 'var(--color-primary)' }} />
                                    <input className={`input ${showErrors && !clientName.trim() ? 'has-error' : ''}`} style={{ paddingLeft: '36px', borderColor: showErrors && !clientName.trim() ? 'var(--color-error)' : 'var(--color-primary)' }} value={clientName}
                                        onChange={e => setClientName(e.target.value)} placeholder="Nom du client" required inputMode="text" autoComplete="name" />
                                </div>
                            </div>
                            <div>
                                <label className="label" style={{ fontSize: '0.78rem', fontWeight: 500, marginBottom: '3px' }}>Téléphone *</label>
                                <TouchInput
                                    value={clientPhone}
                                    onChange={setClientPhone}
                                    placeholder="+225 00000000"
                                    title="Numéro de téléphone"
                                    isPhone={true}
                                    icon={<Phone size={16} style={{ color: showErrors && !clientPhone.trim() ? 'var(--color-error)' : '#d97757' }} />}
                                    style={{ borderColor: showErrors && !clientPhone.trim() ? 'var(--color-error)' : (crmCustomerId ? '#10B981' : 'var(--color-primary)') }}
                                    hasError={showErrors && !clientPhone.trim()}
                                />
                                <CrmPhoneMatchBadge
                                    match={crmPhoneMatch}
                                    isLooking={isCrmLooking}
                                    isLinked={!!crmCustomerId && crmCustomerId === crmPhoneMatch?.id}
                                    onLink={() => {
                                        if (!crmPhoneMatch) return
                                        setCrmCustomerId(crmPhoneMatch.id)
                                        setCrmCustomerName(crmPhoneMatch.name)
                                        if (!clientName.trim()) setClientName(crmPhoneMatch.name)
                                    }}
                                />
                            </div>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ display: 'flex', background: 'var(--color-well)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '3px' }}>
                                    {[
                                        { val: 'retrait', label: '🏠 Retrait en boutique' },
                                        { val: 'livraison', label: '🚚 Livraison' },
                                    ].map(({ val, label }) => (
                                        <button key={val} type="button" onClick={() => setReceptionType(val as any)}
                                            style={{
                                                flex: 1, padding: '7px 8px', borderRadius: '10px', fontWeight: 700, fontSize: '0.875rem',
                                                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                                background: receptionType === val ? 'var(--color-primary)' : 'transparent',
                                                color: receptionType === val ? 'white' : 'var(--color-muted)',
                                            }}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="label" style={{ fontSize: '0.78rem', fontWeight: 500, marginBottom: '3px' }}>{receptionType === 'retrait' ? 'Date de retrait *' : 'Date de livraison *'}</label>
                                <DatePicker
                                    value={pickupDate}
                                    onChange={setPickupDate}
                                    placeholder="Sélectionner une date"
                                    minDate={new Date()}
                                    hasError={showErrors && !pickupDate}
                                />
                            </div>
                            <div>
                                <label className="label" style={{ fontSize: '0.78rem', fontWeight: 500, marginBottom: '3px' }}>Heure</label>
                                <TimeDigiPad
                                    value={pickupTime}
                                    onChange={setPickupTime}
                                    placeholder="Sélectionner l'heure"
                                />
                            </div>

                            {receptionType === 'livraison' && (
                                <div>
                                    <label className="label" style={{ fontSize: '0.78rem', fontWeight: 500, marginBottom: '3px' }}>Adresse de livraison *</label>
                                    <div style={{ position: 'relative' }}>
                                        <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: showErrors && !deliveryAddress.trim() ? 'var(--color-error)' : 'var(--color-primary)' }} />
                                        <input className={`input ${showErrors && !deliveryAddress.trim() ? 'has-error' : ''}`} style={{ paddingLeft: '36px', borderColor: showErrors && !deliveryAddress.trim() ? 'var(--color-error)' : 'var(--color-primary)' }} value={deliveryAddress}
                                            onChange={e => setDeliveryAddress(e.target.value)} placeholder="Quartier, rue..." required={receptionType === 'livraison'} inputMode="text" autoComplete="street-address" />
                                    </div>
                                </div>
                            )}

                            {receptionType === 'retrait' && (
                                <div style={{ height: '0px', width: '0px', display: 'none' }}>
                                    {/* Canal de commande masqué, fixé par défaut à Sur place */}
                                </div>
                            )}
                        </div>

                        {/* PRODUITS */}
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }} ref={searchRef}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: showErrors && orderItems.length === 0 ? 'var(--color-error)' : 'var(--color-muted)' }} />
                                    <input className={`input ${showErrors && orderItems.length === 0 ? 'has-error' : ''}`} style={{ paddingLeft: '36px', paddingRight: '44px' }} placeholder="Rechercher un produit..."
                                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                    <button type="button"
                                        onClick={() => setCatalogModalOpen(true)}
                                        style={{
                                            position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                            background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px',
                                            color: 'var(--color-muted)', display: 'flex', alignItems: 'center'
                                        }}
                                        title="Voir le catalogue">
                                        <Grid size={18} />
                                    </button>
                                    {isSearching && <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '44px', top: '50%', transform: 'translateY(-50%)' }} />}
                                    {searchResults.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', zIndex: 20, marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                            {searchResults.map(res => {
                                                const isOut = res.current_stock === 0
                                                return (
                                                    <button key={res.id} type="button"
                                                        onClick={() => !isOut && handleAddItem(res)}
                                                        disabled={isOut}
                                                        style={{
                                                            width: '100%', padding: '10px 12px', textAlign: 'left', display: 'flex',
                                                            justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)',
                                                            opacity: isOut ? 0.6 : 1,
                                                            cursor: isOut ? 'not-allowed' : 'pointer',
                                                            background: isOut ? '#f9fafb' : 'transparent'
                                                        }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{
                                                                minWidth: '24px', height: '20px', borderRadius: '4px',
                                                                background: isOut ? '#DC2626' : ((res.current_stock || 0) < 5 ? '#F59E0B' : '#10B981'),
                                                                color: 'white', fontSize: '0.65rem', fontWeight: 800,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
                                                            }}>
                                                                {isOut ? '!' : res.current_stock}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, color: isOut ? '#9ca3af' : 'inherit' }}>{res.name}</div>
                                                                {isOut && <div style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 700 }}>Stock épuisé</div>}
                                                            </div>
                                                        </div>
                                                        <span style={{ color: isOut ? '#9ca3af' : 'var(--color-muted)' }}>{Number(res.selling_price).toLocaleString('fr-FR')} {currency}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                                <button type="button" onClick={handleAddManual}
                                    style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '0 14px', height: '42px', background: 'transparent', color: 'var(--color-primary)', fontWeight: 700, fontSize: '1.2rem', flexShrink: 0, cursor: 'pointer' }}>
                                    +
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {orderItems.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '16px', color: 'var(--color-muted)', fontSize: '0.8rem', border: '1.5px dashed var(--color-border)', borderRadius: '12px', background: 'var(--color-well)' }}>
                                        Aucun produit ajouté. Recherchez un produit ci-dessus ou cliquez sur <strong style={{ color: 'var(--color-primary)' }}>+</strong> pour ajouter un gâteau sur mesure.
                                    </div>
                                )}
                                {orderItems.map((item, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 100px 32px', gap: '6px', alignItems: 'center', background: 'var(--color-well)', padding: '6px', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                            {item.from_inventory && <span className="badge badge-pending" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>Inv.</span>}
                                            <input className="input" value={item.name} onChange={e => handleUpdateItem(idx, 'name', e.target.value)} placeholder="Désignation" disabled={item.from_inventory} style={{ padding: '6px 8px', height: '32px', flex: item.from_inventory ? 1 : 2, minWidth: '80px', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }} required />
                                            {!item.from_inventory && (
                                                <>
                                                    <TouchInput
                                                        value={item.parts?.toString() || ''}
                                                        onChange={v => handleUpdateItem(idx, 'parts', parseInt(v) || undefined)}
                                                        allowDecimal={false}
                                                        placeholder="Parts"
                                                        title={`Nombre de parts : ${item.name || 'Produit'}`}
                                                        hideIcon={true}
                                                        style={{ padding: '6px 2px', height: '32px', width: '62px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                                    />
                                                    <TouchInput
                                                        value={item.floors?.toString() || ''}
                                                        onChange={v => handleUpdateItem(idx, 'floors', parseInt(v) || undefined)}
                                                        allowDecimal={false}
                                                        placeholder="Étages"
                                                        title={`Nombre d'étages : ${item.name || 'Produit'}`}
                                                        hideIcon={true}
                                                        style={{ padding: '6px 2px', height: '32px', width: '62px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                                    />
                                                </>
                                            )}
                                        </div>
                                        <TouchInput
                                            value={item.quantity.toString()}
                                            onChange={v => handleUpdateItem(idx, 'quantity', parseInt(v) || 1)}
                                            allowDecimal={false}
                                            title={`Quantité : ${item.name || 'Produit'}`}
                                            placeholder="Qté"
                                            hideIcon={true}
                                            style={{ padding: '6px 8px', height: '32px', textAlign: 'center', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                        />
                                        <TouchInput
                                            value={item.unit_price === 0 ? '' : item.unit_price.toString()}
                                            onChange={v => handleUpdateItem(idx, 'unit_price', parseFloat(v) || 0)}
                                            placeholder="Prix"
                                            title={`Prix unitaire : ${item.name || 'Produit'}`}
                                            hideIcon={true}
                                            style={{ padding: '6px 8px', height: '32px', textAlign: 'right', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                        />
                                        <button type="button" onClick={() => handleRemoveItem(idx)} className="btn-ghost" style={{ padding: '0', minHeight: '32px', color: '#D94F38' }}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* PERSONNALISATION */}
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <textarea className="input" rows={2} value={customizationNotes} onChange={e => setCustomizationNotes(e.target.value)}
                                    placeholder="Texte sur le gâteau, couleurs, allergies, instructions spéciales..." style={{ resize: 'none', flex: 1 }}></textarea>
                                <label
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', border: '1px dashed var(--color-border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--color-well)', color: imageFile ? 'var(--color-primary)' : 'var(--color-muted)', flexShrink: 0 }}
                                    title={imageFile ? imageFile.name : "Ajouter une photo d'inspiration"}
                                >
                                    <ImageIcon size={18} />
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setImageFile(e.target.files?.[0] || null)} />
                                </label>
                            </div>
                        </div>

                        {/* RÉCAP FINANCIER */}
                        <div style={{ background: 'var(--color-well)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                                <span>Sous-total</span>
                                <span style={{ fontWeight: 700 }}>{subtotal.toLocaleString('fr-FR')} {currency}</span>
                            </div>

                            {/* Toggle Acompte / Soldé */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Paiement reçu</span>
                                <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px' }}>
                                    <button type="button" onClick={() => { setPaymentType('ACOMPTE'); setDeposit(0) }}
                                        style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'ACOMPTE' ? 'var(--color-warning)' : 'transparent', color: paymentType === 'ACOMPTE' ? 'white' : 'var(--color-muted)' }}>
                                        Acompte reçu
                                    </button>
                                    <button type="button" onClick={() => { setPaymentType('SOLDE'); setDeposit(total) }}
                                        style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'SOLDE' ? 'var(--color-secondary)' : 'transparent', color: paymentType === 'SOLDE' ? 'white' : 'var(--color-muted)' }}>
                                        Soldé
                                    </button>
                                </div>
                            </div>

                            {paymentType === 'ACOMPTE' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Montant acompte</span>
                                    <div style={{ width: '110px' }}>
                                        <TouchInput value={deposit.toString()} onChange={v => setDeposit(parseFloat(v) || 0)} style={{ height: '34px', padding: '4px 8px', textAlign: 'right' }} />
                                    </div>
                                </div>
                            )}

                            {deposit > 0 && (
                                <div>
                                    <label className="label" style={{ marginBottom: '4px' }}>Mode de paiement</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {PAYMENT_METHODS.map(m => (
                                            <button key={m.value} type="button" onClick={() => setDepositPaymentMethod(m.value)}
                                                style={{
                                                    padding: '5px 10px', fontSize: '0.75rem', fontWeight: 700,
                                                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.15s',
                                                    border: '1.5px solid', borderColor: depositPaymentMethod === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                                                    background: depositPaymentMethod === m.value ? '#FDE8E0' : 'var(--color-lift)',
                                                    color: depositPaymentMethod === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                                                }}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ height: '1px', background: 'var(--color-border)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-primary)' }}>
                                <span>Solde restant</span>
                                <span>{balance.toLocaleString('fr-FR')} {currency}</span>
                            </div>
                        </div>

                    </div>

                    {/* FOOTER */}
                    <div style={{ padding: '12px 16px', borderTop: '1.5px solid var(--color-border)', display: 'flex', gap: '8px', background: 'var(--color-lift)', position: 'sticky', bottom: 0 }}>
                        <button type="button" onClick={handleClose} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
                        <button type="submit" className="btn-primary"
                            disabled={isPending || !clientName.trim() || orderItems.length === 0 || !pickupDate}
                            style={{ flex: 2 }}>
                            {isPending ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                            {isPending ? 'Création…' : 'Créer la commande'}
                        </button>
                    </div>

                </form>
            </div>

        </div>

        <CatalogueModal
            open={catalogModalOpen}
            onClose={() => setCatalogModalOpen(false)}
            onAddToCart={(product: any) => {
                handleAddItem(product)
                setCatalogModalOpen(false)
            }}
            organizationId={organizationId}
            currency={currency}
        />
        </>
    )
}

// ---------------------------------------------------------------------------
// Composant local : badge de correspondance CRM sous le champ téléphone
// ---------------------------------------------------------------------------

interface CrmPhoneMatchBadgeProps {
    match: CRMMatch | null
    isLooking: boolean
    isLinked: boolean
    onLink: () => void
}

function CrmPhoneMatchBadge({ match, isLooking, isLinked, onLink }: CrmPhoneMatchBadgeProps) {
    if (isLooking) {
        return (
            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px',
                          color: 'var(--color-muted)', fontSize: '0.75rem' }}>
                <Loader2 size={12} className="animate-spin" />
                <span>Vérification CRM…</span>
            </div>
        )
    }

    if (!match) return null

    // Déjà lié → pill vert de confirmation
    if (isLinked) {
        return (
            <div className="animate-slide-up" style={{
                marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', background: 'var(--color-secondary-container)',
                borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600,
                color: 'var(--color-secondary)',
            }}>
                <CheckCircle size={14} />
                <span>Client CRM lié · {match.name}</span>
                {(match.loyalty_points ?? 0) > 0 && (
                    <span style={{ marginLeft: 'auto', background: '#FEF3C7', color: '#92400E',
                                   padding: '2px 8px', borderRadius: '99px', fontSize: '0.7rem' }}>
                        ★ {match.loyalty_points} pts
                    </span>
                )}
            </div>
        )
    }

    // Correspondance trouvée, pas encore liée → badge amber avec bouton "Associer"
    return (
        <div className="animate-slide-up" style={{
            marginTop: '6px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '8px 12px',
            background: '#FEF3C7', borderRadius: '10px', fontSize: '0.8rem',
            border: '1px solid #FDE68A',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px',
                          fontWeight: 600, color: '#92400E' }}>
                <UserCheck size={14} />
                <span>👤 {match.name}</span>
                <span style={{ fontWeight: 400, color: '#B45309' }}>— Client trouvé</span>
            </div>
            <button type="button" onClick={onLink} style={{
                padding: '4px 12px', borderRadius: '99px', border: 'none',
                background: '#92400E', color: 'white',
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
            }}>
                Associer
            </button>
        </div>
    )
}
