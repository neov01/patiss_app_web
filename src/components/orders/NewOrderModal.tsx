'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, User, Phone, X, Loader2, Image as ImageIcon, MapPin, Search, Grid, UserCheck, CheckCircle, Plus, Trash2, CheckCircle2 } from 'lucide-react'
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
    notes?: string
    imageFile?: File | null
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
    const [orderItems, setOrderItems] = useState<OrderItem[]>([
        {
            name: '',
            quantity: 1,
            unit_price: 0,
            subtotal: 0,
            from_inventory: false,
            notes: '',
            imageFile: null
        }
    ])
    
    // Financials
    const [deposit, setDeposit] = useState(0)
    const [depositPaymentMethod, setDepositPaymentMethod] = useState('Espèces')
    const [paymentType, setPaymentType] = useState<'ACOMPTE' | 'SOLDE'>('ACOMPTE')

    // Paiement Multiple
    const [isMultiplePayment, setIsMultiplePayment] = useState(false)
    const [payments, setPayments] = useState<Array<{ id: string, amount: number, payment_method: string, label_type: 'ACOMPTE' | 'SOLDE' }>>([
        { id: '1', amount: 0, payment_method: 'Espèces', label_type: 'ACOMPTE' }
    ])

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
    const totalPayments = isMultiplePayment
        ? payments.reduce((sum, p) => sum + p.amount, 0)
        : deposit
    const balance = Math.max(0, total - totalPayments)

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
            const { data } = await supabase.from('products')
                .select('id, name, selling_price, current_stock')
                .eq('is_active', true)
                .ilike('name', `%${searchQuery}%`)
                .limit(10)
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
                from_inventory: true,
                notes: '',
                imageFile: null
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
            from_inventory: false,
            notes: '',
            imageFile: null
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
        setOrderItems([
            {
                name: '',
                quantity: 1,
                unit_price: 0,
                subtotal: 0,
                from_inventory: false,
                notes: '',
                imageFile: null
            }
        ])
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
        if (orderItems.some(item => !item.name.trim())) {
            toast.error('Tous les articles de la commande doivent avoir une désignation.')
            return
        }
        if (receptionType === 'livraison' && !deliveryAddress.trim()) {
            toast.error('L\'adresse de livraison est requise.')
            return
        }
        if (!isMultiplePayment && deposit > total) {
            toast.warning('L\'acompte ne peut pas être supérieur au total.')
            return
        }

        if (isMultiplePayment) {
            const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
            if (totalPaid > total) {
                toast.warning('Le montant total payé ne peut pas être supérieur au total de la commande.')
                return
            }
        }

        start(async () => {
            // Fonction interne d'upload d'une image d'article
            const uploadImage = async (file: File): Promise<string | undefined> => {
                try {
                    const compressed = await compressImage(file, { maxWidth: 1200, quality: 0.7 })
                    const supabase = createSupabaseClient()
                    const filePath = `orders/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
                    
                    const { error: uploadError } = await supabase.storage.from('order-images').upload(filePath, compressed, {
                        contentType: 'image/webp',
                        upsert: true
                    })
                    
                    if (!uploadError) {
                        const { data } = supabase.storage.from('order-images').getPublicUrl(filePath)
                        return data.publicUrl
                    } else {
                        console.error('Upload de la photo échoué:', uploadError)
                    }
                } catch (err) {
                    console.error("Erreur compression/upload:", err)
                }
                return undefined
            }

            // Uploader toutes les images en parallèle
            const itemsWithUrls = await Promise.all(
                orderItems.map(async (item) => {
                    let imageUrl: string | undefined = undefined
                    if (item.imageFile) {
                        imageUrl = await uploadImage(item.imageFile)
                    }
                    return { ...item, imageUrl }
                })
            )

            // Trouver la première URL d'image disponible pour custom_image_url
            const firstImageUrl = itemsWithUrls.find(i => i.imageUrl)?.imageUrl

            // Construire le JSON structuré des notes et images pour chaque article
            const notesArray = itemsWithUrls.map((item) => {
                let finalName = item.name.trim()
                const partsStr = item.parts ? `${item.parts} parts` : ''
                const floorsStr = item.floors ? `${item.floors} étage${item.floors > 1 ? 's' : ''}` : ''
                const details = [partsStr, floorsStr].filter(Boolean).join(', ')
                if (details) {
                    finalName = `${finalName} (${details})`
                }
                return {
                    name: finalName,
                    notes: item.notes?.trim() || '',
                    image_url: item.imageUrl || ''
                }
            })

            // On n'enregistre le JSON que si au moins un article a des notes ou une image
            const hasCustomization = notesArray.some(n => n.notes || n.image_url)
            const customizationNotes = hasCustomization ? JSON.stringify(notesArray) : undefined

            const calculatedDeposit = isMultiplePayment
                ? payments.filter(p => p.label_type === 'ACOMPTE').reduce((sum, p) => sum + p.amount, 0)
                : deposit

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
                deposit_amount: calculatedDeposit,
                balance,
                customization_notes: customizationNotes,
                custom_image_url: firstImageUrl,
                deposit_payment_method: !isMultiplePayment && deposit > 0 ? depositPaymentMethod : undefined,
                payments: isMultiplePayment ? payments.map(p => ({
                    amount: p.amount,
                    payment_method: p.payment_method,
                    label_type: p.label_type
                })) : undefined,
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
                                <div style={{ position: 'relative', width: '50%', flexShrink: 0 }}>
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
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '12px' }}>
                                <label className="label" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Articles du bon de commande</label>
                                <button type="button" onClick={handleAddManual} className="btn-secondary" style={{ padding: '6px 12px', minHeight: '34px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Plus size={16} /> Ajouter un article sur mesure
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {orderItems.map((item, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        background: 'var(--color-well)',
                                        padding: '16px',
                                        borderRadius: '18px',
                                        border: '1.5px solid var(--color-border)',
                                        position: 'relative'
                                    }}>
                                        {/* Entête de la carte */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-rose-dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                🍰 Article #{idx + 1}
                                                {item.from_inventory && <span className="badge badge-pending" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>Inventaire</span>}
                                            </span>
                                            {orderItems.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveItem(idx)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#D94F38',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        padding: '2px 6px',
                                                        borderRadius: '6px',
                                                        transition: 'background-color 0.2s'
                                                    }}
                                                >
                                                    <Trash2 size={14} /> Supprimer
                                                </button>
                                            )}
                                        </div>

                                        {/* Ligne 1 : Désignation + Parts + Étages */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 2fr) 1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Désignation *</label>
                                                <input
                                                    className="input"
                                                    value={item.name}
                                                    onChange={e => handleUpdateItem(idx, 'name', e.target.value)}
                                                    placeholder="ex: Gâteau d'anniversaire..."
                                                    disabled={item.from_inventory}
                                                    style={{ padding: '6px 8px', height: '36px', borderRadius: '10px', background: item.from_inventory ? 'var(--color-well)' : '#ffffff', border: '1.5px solid var(--color-border)' }}
                                                    required
                                                />
                                            </div>
                                            {!item.from_inventory ? (
                                                <>
                                                    <div>
                                                        <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Parts</label>
                                                        <TouchInput
                                                            value={item.parts?.toString() || ''}
                                                            onChange={v => handleUpdateItem(idx, 'parts', parseInt(v) || undefined)}
                                                            allowDecimal={false}
                                                            placeholder="Parts"
                                                            title={`Nombre de parts : ${item.name || 'Produit'}`}
                                                            hideIcon={true}
                                                            style={{ padding: '6px 2px', height: '36px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Étages</label>
                                                        <TouchInput
                                                            value={item.floors?.toString() || ''}
                                                            onChange={v => handleUpdateItem(idx, 'floors', parseInt(v) || undefined)}
                                                            allowDecimal={false}
                                                            placeholder="Étages"
                                                            title={`Nombre d'étages : ${item.name || 'Produit'}`}
                                                            hideIcon={true}
                                                            style={{ padding: '6px 2px', height: '36px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ gridColumn: 'span 2' }} />
                                            )}
                                        </div>

                                        {/* Ligne 2 : Quantité + Prix unitaire */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px' }}>
                                            <div>
                                                <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Quantité</label>
                                                <TouchInput
                                                    value={item.quantity.toString()}
                                                    onChange={v => handleUpdateItem(idx, 'quantity', parseInt(v) || 1)}
                                                    allowDecimal={false}
                                                    title={`Quantité : ${item.name || 'Produit'}`}
                                                    placeholder="Qté"
                                                    hideIcon={true}
                                                    style={{ padding: '6px 8px', height: '36px', textAlign: 'center', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                                />
                                            </div>
                                            <div>
                                                <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Prix Unitaire</label>
                                                <TouchInput
                                                    value={item.unit_price === 0 ? '' : item.unit_price.toString()}
                                                    onChange={v => handleUpdateItem(idx, 'unit_price', parseFloat(v) || 0)}
                                                    placeholder="Prix"
                                                    title={`Prix unitaire : ${item.name || 'Produit'}`}
                                                    hideIcon={true}
                                                    style={{ padding: '6px 8px', height: '36px', textAlign: 'right', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                                                />
                                            </div>
                                        </div>

                                        {/* Notes particulières + image d'inspiration pour cet article */}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '4px' }}>
                                            <textarea
                                                className="input"
                                                rows={2}
                                                placeholder="Notes particulières pour cet article (parfum, écritures, etc.)..."
                                                style={{ resize: 'none', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: '12px', background: '#ffffff', flex: 1, fontSize: '0.78rem', minHeight: '48px' }}
                                                value={item.notes || ''}
                                                onChange={e => handleUpdateItem(idx, 'notes', e.target.value)}
                                            />
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '48px',
                                                    height: '48px',
                                                    border: '1.5px dashed var(--color-border)',
                                                    borderRadius: '12px',
                                                    cursor: 'pointer',
                                                    background: item.imageFile ? 'var(--color-primary-container)' : '#ffffff',
                                                    color: item.imageFile ? 'var(--color-primary)' : 'var(--color-muted)',
                                                    flexShrink: 0,
                                                    position: 'relative'
                                                }}
                                                title={item.imageFile ? item.imageFile.name : "Photo d'inspiration pour cet article"}
                                            >
                                                {item.imageFile ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                        <CheckCircle2 size={16} color="var(--color-primary)" />
                                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '2px', maxWidth: '44px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            Ok
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <ImageIcon size={18} />
                                                )}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={e => handleUpdateItem(idx, 'imageFile', e.target.files?.[0] || null)}
                                                />
                                            </label>
                                        </div>

                                    </div>
                                ))}
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px' }}>
                                        <button type="button" onClick={() => {
                                            setPaymentType('ACOMPTE');
                                            setDeposit(0);
                                            if (isMultiplePayment) {
                                                setPayments(prev => prev.map((p, idx) => idx === 0 ? { ...p, label_type: 'ACOMPTE' } : p));
                                            }
                                        }}
                                            style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'ACOMPTE' && !isMultiplePayment ? 'var(--color-warning)' : 'transparent', color: paymentType === 'ACOMPTE' && !isMultiplePayment ? 'white' : 'var(--color-muted)' }}>
                                            Acompte reçu
                                        </button>
                                        <button type="button" onClick={() => {
                                            setPaymentType('SOLDE');
                                            setDeposit(total);
                                            if (isMultiplePayment) {
                                                setPayments(prev => prev.map((p, idx) => idx === 0 ? { ...p, label_type: 'SOLDE' } : p));
                                            }
                                        }}
                                            style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'SOLDE' && !isMultiplePayment ? 'var(--color-secondary)' : 'transparent', color: paymentType === 'SOLDE' && !isMultiplePayment ? 'white' : 'var(--color-muted)' }}>
                                            Soldé
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!isMultiplePayment) {
                                                setIsMultiplePayment(true);
                                                const initialAmount = paymentType === 'SOLDE' ? total : deposit;
                                                const initialType = paymentType;
                                                const initialMethod = depositPaymentMethod;
                                                setPayments([
                                                    { id: '1', amount: initialAmount, payment_method: initialMethod, label_type: initialType },
                                                    { id: '2', amount: Math.max(0, total - initialAmount), payment_method: 'Espèces', label_type: initialType === 'ACOMPTE' ? 'SOLDE' : 'ACOMPTE' }
                                                ]);
                                            } else {
                                                const remaining = Math.max(0, total - payments.reduce((sum, p) => sum + p.amount, 0));
                                                setPayments(prev => [
                                                    ...prev,
                                                    { id: Date.now().toString(), amount: remaining, payment_method: 'Espèces', label_type: 'SOLDE' }
                                                ]);
                                            }
                                        }}
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '8px',
                                            border: '1.5px solid var(--color-primary)',
                                            background: isMultiplePayment ? 'var(--color-primary)' : 'transparent',
                                            color: isMultiplePayment ? 'white' : 'var(--color-primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '1rem',
                                            transition: 'all 0.15s'
                                        }}
                                        title="Ajouter un mode de paiement multiple"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {/* Section paiement unique classique */}
                            {!isMultiplePayment && paymentType === 'ACOMPTE' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Montant acompte</span>
                                    <div style={{ width: '110px' }}>
                                        <TouchInput value={deposit.toString()} onChange={v => setDeposit(parseFloat(v) || 0)} style={{ height: '34px', padding: '4px 8px', textAlign: 'right' }} />
                                    </div>
                                </div>
                            )}

                            {!isMultiplePayment && deposit > 0 && (
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

                            {/* Section paiement multiple */}
                            {isMultiplePayment && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                                    {payments.map((p, index) => (
                                        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                {/* Toggle Acompte / Solde pour cette ligne */}
                                                <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '2px', gap: '2px' }}>
                                                    <button type="button" onClick={() => {
                                                        setPayments(prev => prev.map(item => item.id === p.id ? { ...item, label_type: 'ACOMPTE' } : item))
                                                    }}
                                                        style={{ padding: '3px 8px', fontSize: '0.65rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: p.label_type === 'ACOMPTE' ? 'var(--color-warning)' : 'transparent', color: p.label_type === 'ACOMPTE' ? 'white' : 'var(--color-muted)' }}>
                                                        Acompte
                                                    </button>
                                                    <button type="button" onClick={() => {
                                                        setPayments(prev => prev.map(item => item.id === p.id ? { ...item, label_type: 'SOLDE' } : item))
                                                    }}
                                                        style={{ padding: '3px 8px', fontSize: '0.65rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: p.label_type === 'SOLDE' ? 'var(--color-secondary)' : 'transparent', color: p.label_type === 'SOLDE' ? 'white' : 'var(--color-muted)' }}>
                                                        Solde
                                                    </button>
                                                </div>

                                                {/* Saisie montant */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <div style={{ width: '90px' }}>
                                                        <TouchInput value={p.amount.toString()} onChange={v => {
                                                            const newAmount = parseFloat(v) || 0;
                                                            setPayments(prev => prev.map(item => item.id === p.id ? { ...item, amount: newAmount } : item));
                                                        }} style={{ height: '28px', padding: '2px 6px', textAlign: 'right', fontSize: '0.75rem' }} />
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-muted)' }}>FCFA</span>
                                                    
                                                    {payments.length > 1 && (
                                                        <button type="button" onClick={() => {
                                                            setPayments(prev => {
                                                                const next = prev.filter(item => item.id !== p.id);
                                                                if (next.length === 1) {
                                                                    setIsMultiplePayment(false);
                                                                    setDeposit(next[0].amount);
                                                                    setDepositPaymentMethod(next[0].payment_method);
                                                                    setPaymentType(next[0].label_type);
                                                                }
                                                                return next;
                                                            });
                                                        }} style={{ width: '22px', height: '22px', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Modes de paiement */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {PAYMENT_METHODS.map(m => (
                                                    <button key={m.value} type="button" onClick={() => {
                                                        setPayments(prev => prev.map(item => item.id === p.id ? { ...item, payment_method: m.value } : item))
                                                    }}
                                                        style={{
                                                            padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700,
                                                            borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s',
                                                            border: '1.5px solid', borderColor: p.payment_method === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                                                            background: p.payment_method === m.value ? '#FDE8E0' : 'var(--color-lift)',
                                                            color: p.payment_method === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                                                        }}>
                                                        {m.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
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
