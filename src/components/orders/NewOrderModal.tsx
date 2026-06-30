'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, User, Phone, X, Loader2, Image as ImageIcon, MapPin, Search, Grid, UserCheck, CheckCircle, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { createOrder } from '@/lib/actions/orders'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/utils/image-compression'
import TouchInput from '@/components/ui/TouchInput'
import { useActionFeedback } from '@/hooks/useActionFeedback'
import DatePicker from '@/components/ui/DatePicker'
import TimeDigiPad from '@/components/ui/TimeDigiPad'
import TouchSelect from '@/components/ui/TouchSelect'
import CatalogueModal from '@/components/caisse/CatalogueModal'
import { CRMSelector } from '@/components/caisse/CRMSelector'
import { usePhoneCRMLookup, type CRMMatch } from '@/hooks/usePhoneCRMLookup'
import { useOffline } from '@/components/providers/OfflineProvider'

interface Product { id: string; name: string; selling_price: number; current_stock: number | null }
type ReceptionType = 'retrait' | 'livraison'

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
    imageUrl?: string
}

interface Props {
    open: boolean
    onClose: () => void
    products: Product[] // Initial products for fallback/default
    currency: string
    organizationId: string
}

const STATUS_OPTIONS = [
    { value: 'confirmed', label: '⏳ Confirmée', color: 'badge-pending' },
    { value: 'in_preparation', label: '👨‍🍳 En préparation', color: 'badge-production' },
    { value: 'ready', label: '✅ Prête', color: 'badge-ready' },
    { value: 'awaiting_pickup', label: '📦 Attente retrait', color: 'badge-ready' },
    { value: 'delivered', label: '✔ Livrée / Retirée', color: 'badge-completed' },
]

const PRIORITY_OPTIONS = [
    { value: 'normale', label: 'Normale', color: 'var(--color-text)' },
    { value: 'urgent', label: 'Urgent', color: '#b91c1c' }, // Rouge brique élégant
    { value: 'vip', label: 'VIP', color: '#b57c1e' }, // Doré sourd élégant
]

const PAYMENT_METHODS = [
    { value: 'cash', label: '💵 Espèces' },
    { value: 'orange_money', label: '🟠 Orange Money' },
    { value: 'wave', label: '🌊 Wave' },
    { value: 'mobile_money', label: '🍌 MTN MOMO' },
    { value: 'moov_money', label: '🔵 Moov Money' }
]

export default function NewOrderModal({ open, onClose, currency, organizationId }: Props) {
    const { execute, isPending, renderFeedback } = useActionFeedback()
    const { isOffline, saveOrderOffline, cachedProducts } = useOffline()
    
    // Auto Order Number
    const [orderNumber, setOrderNumber] = useState('')
    
    // Header States
    const [status, setStatus] = useState('confirmed')
    const [priority, setPriority] = useState('normale')
    const [vipNote, setVipNote] = useState('')
    
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
    const [depositPaymentMethod, setDepositPaymentMethod] = useState('cash')
    const [paymentType, setPaymentType] = useState<'ACOMPTE' | 'SOLDE'>('ACOMPTE')

    // Paiement Multiple
    const [isMultiplePayment, setIsMultiplePayment] = useState(false)
    const [payments, setPayments] = useState<Array<{ id: string, amount: number, payment_method: string, label_type: 'ACOMPTE' | 'SOLDE' }>>([
        { id: '1', amount: 0, payment_method: 'cash', label_type: 'ACOMPTE' }
    ])

    // CRM Customer Link
    const [crmCustomerId, setCrmCustomerId] = useState<string | null>(null)
    const [crmCustomerName, setCrmCustomerName] = useState<string | null>(null)
    const [showErrors, setShowErrors] = useState(false)
    const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0)
    const [paymentAccordionOpen, setPaymentAccordionOpen] = useState(true)
    const [discountAmount, setDiscountAmount] = useState<number>(0)
    const [showDiscountInput, setShowDiscountInput] = useState<boolean>(false)

    // CRM auto-lookup par téléphone
    const { match: crmPhoneMatch, isLooking: isCrmLooking } = usePhoneCRMLookup(clientPhone)

    // Search Inventory
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<Product[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [catalogModalOpen, setCatalogModalOpen] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)
    const creationStartedAtRef = useRef<number | null>(null)

    // Calculate totals
    const subtotal = orderItems.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0)
    const total = Math.max(0, subtotal - discountAmount)
    const totalPayments = isMultiplePayment
        ? payments.reduce((sum, p) => sum + p.amount, 0)
        : deposit
    const balance = Math.max(0, total - totalPayments)

    useEffect(() => {
        if (open) {
            creationStartedAtRef.current = Date.now()
            const year = new Date().getFullYear()
            const rand = Math.floor(1000 + Math.random() * 9000)
            setOrderNumber(`CMD-${year}-${rand}`)
        } else {
            creationStartedAtRef.current = null
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
    }, [clientPhone, crmCustomerId])

    // Auto-lier si un profil CRM est trouvé par lookup de téléphone
    const lastAutoLinkedIdRef = useRef<string | null>(null)
    useEffect(() => {
        if (crmPhoneMatch) {
            if (crmPhoneMatch.id !== lastAutoLinkedIdRef.current) {
                lastAutoLinkedIdRef.current = crmPhoneMatch.id
                setCrmCustomerId(crmPhoneMatch.id)
                setCrmCustomerName(crmPhoneMatch.name)
                setClientName(crmPhoneMatch.name)
            }
        } else {
            lastAutoLinkedIdRef.current = null
        }
    }, [crmPhoneMatch])

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
        let newIdx = 0
        setOrderItems(prev => {
            const existing = prev.find(i => i.product_id === product.id && i.from_inventory)
            if (existing) {
                const idx = prev.indexOf(existing)
                newIdx = idx
                return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price } : i)
            }
            newIdx = prev.length
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
        setSelectedItemIndex(newIdx)
    }

    const handleAddManual = () => {
        setSelectedItemIndex(orderItems.length)
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

    const handleUpdateItem = <K extends keyof OrderItem>(index: number, field: K, value: OrderItem[K]) => {
        setOrderItems(prev => {
            const newItems = [...prev]
            const item = { ...newItems[index], [field]: value }
            item.subtotal = item.quantity * item.unit_price
            newItems[index] = item
            return newItems
        })
    }

    const handleRemoveItem = (index: number) => {
        setOrderItems(prev => {
            const next = prev.filter((_, i) => i !== index)
            return next
        })
        setSelectedItemIndex(prev => {
            if (prev >= orderItems.length - 1) {
                return Math.max(0, orderItems.length - 2)
            }
            return prev
        })
    }

    function handleReset() {
        setStatus('confirmed')
        setPriority('normale')
        setVipNote('')
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
        setDepositPaymentMethod('cash')
        setPaymentType('ACOMPTE')
        setIsMultiplePayment(false)
        setPayments([
            { id: '1', amount: 0, payment_method: 'cash', label_type: 'ACOMPTE' }
        ])
        setCrmCustomerId(null)
        setCrmCustomerName(null)
        setShowErrors(false)
        setSelectedItemIndex(0)
        setPaymentAccordionOpen(true)
        setDiscountAmount(0)
        setShowDiscountInput(false)
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

        if (!clientName.trim()) {
            toast.error("Le nom du client est obligatoire.")
            return
        }
        if (!clientPhone.trim() || clientPhone.trim().length < 8) {
            toast.error("Un numéro de téléphone valide (minimum 8 caractères) est obligatoire.")
            return
        }
        if (!pickupDate) {
            toast.error("La date de retrait est obligatoire.")
            return
        }
        if (orderItems.length === 0) {
            toast.error("La commande doit contenir au moins un article.")
            return
        }

        // Validation des articles du panier
        const invalidPriceIdx = orderItems.findIndex(item => !item.unit_price || item.unit_price <= 0)
        if (invalidPriceIdx !== -1) {
            toast.error(`Le prix unitaire pour l'article #${invalidPriceIdx + 1} (${orderItems[invalidPriceIdx].name || 'sans désignation'}) est obligatoire et doit être supérieur à 0.`)
            return
        }
        const invalidNameIdx = orderItems.findIndex(item => !item.name.trim())
        if (invalidNameIdx !== -1) {
            toast.error(`La désignation de l'article #${invalidNameIdx + 1} est obligatoire.`)
            return
        }

        if (receptionType === 'livraison' && !deliveryAddress.trim()) {
            toast.error("L'adresse de livraison est requise.")
            return
        }

        // Validation de la note VIP obligatoire
        if (priority === 'vip' && !vipNote.trim()) {
            toast.error("Veuillez saisir une note de commentaire pour la commande VIP.")
            return
        }

        // Validation de l'acompte (optionnel si VIP)
        if (!isMultiplePayment) {
            if (paymentType === 'ACOMPTE' && (!deposit || deposit <= 0) && priority !== 'vip') {
                toast.error("Le montant de l'acompte est obligatoire pour un règlement en acompte.")
                return
            }
            if (deposit > total) {
                toast.warning("L'acompte ne peut pas être supérieur au total net.")
                return
            }
        }

        if (isMultiplePayment) {
            if (paymentType === 'ACOMPTE' && priority !== 'vip') {
                const acomptePaid = payments.filter(p => p.label_type === 'ACOMPTE').reduce((sum, p) => sum + p.amount, 0)
                if (acomptePaid <= 0) {
                    toast.error("Le montant de l'acompte est obligatoire pour un règlement en acompte.")
                    return
                }
            }
            const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
            if (totalPaid > total) {
                toast.warning("Le montant total payé ne peut pas être supérieur au total de la commande.")
                return
            }
        }
        // Capture au moment exact où le formulaire validé est soumis.
        // eslint-disable-next-line react-hooks/purity
        const creationCompletedAtMs = Date.now()
        const creationStartedAtMs = creationStartedAtRef.current ?? creationCompletedAtMs
        const creationDurationSeconds = Math.max(0, Math.round((creationCompletedAtMs - creationStartedAtMs) / 1000))

        await execute(async () => {
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
                    
                    if (uploadError) throw uploadError
                    const { data: { publicUrl } } = supabase.storage.from('order-images').getPublicUrl(filePath)
                    return publicUrl
                } catch (err) {
                    console.error("Image upload failed:", err)
                    return undefined
                }
            }

            // Uploader l'image du premier article si elle existe
            let firstImageUrl: string | undefined = undefined
            const itemsWithUrls = [...orderItems]
            if (itemsWithUrls[0]?.imageFile) {
                const url = await uploadImage(itemsWithUrls[0].imageFile)
                if (url) {
                    firstImageUrl = url
                    itemsWithUrls[0] = { ...itemsWithUrls[0], imageUrl: url }
                }
            }

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

            const hasCustomization = notesArray.some(n => n.notes || n.image_url)
            const cleanVipNote = priority === 'vip' ? vipNote.trim() : undefined

            // Structurer le JSON pour inclure à la fois les personnalisations d'articles et la note VIP
            let customizationNotes: string | undefined = undefined
            if (hasCustomization || cleanVipNote) {
                customizationNotes = JSON.stringify({
                    items: notesArray,
                    vip_note: cleanVipNote
                })
            }

            const calculatedDeposit = isMultiplePayment
                ? payments.filter(p => p.label_type === 'ACOMPTE').reduce((sum, p) => sum + p.amount, 0)
                : deposit

            if (isOffline) {
                await saveOrderOffline({
                    id: crypto.randomUUID(),
                    customer_name: clientName,
                    customer_contact: clientPhone,
                    pickup_date: pickupDeliveryDate,
                    reception_type: receptionType,
                    customization_notes: customizationNotes,
                    priority,
                    deposit_amount: calculatedDeposit,
                    discount_amount: discountAmount,
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
                            product_id: item.product_id || null,
                            name: finalName,
                            quantity: item.quantity,
                            unit_price: item.unit_price
                        }
                    })
                })
                return { offline: true }
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
                discount_amount: discountAmount,
                delivery_fee: 0,
                total_amount: total,
                deposit_amount: calculatedDeposit,
                balance,
                customization_notes: customizationNotes,
                custom_image_url: firstImageUrl,
                creation_started_at: new Date(creationStartedAtMs).toISOString(),
                creation_completed_at: new Date(creationCompletedAtMs).toISOString(),
                creation_duration_seconds: creationDurationSeconds,
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
                throw new Error(result.error)
            }
            return result
        }, {
            type: 'toast',
            successMessage: isOffline 
                ? `Commande #${orderNumber} enregistrée en local (hors-ligne)` 
                : `Commande #${orderNumber} créée avec succès`,
            onSuccess: () => {
                handleClose()
            }
        })
    }

    if (!open) return null
    return (
        <>
        <div className="modal-overlay" onClick={handleClose} style={{ zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '54rem', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: '0' }} onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>

                    {/* EN-TÊTE — ultra-épuré et minimaliste */}
                    <div style={{ 
                        padding: '12px 20px', 
                        borderBottom: '1px solid var(--color-border)', 
                        position: 'sticky', 
                        top: 0, 
                        background: 'var(--color-lift)', 
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px'
                    }}>
                        {/* Titre & ID */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>Nouvelle commande</h2>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600, background: 'var(--color-well)', padding: '2px 8px', borderRadius: '6px' }}>#{orderNumber}</span>
                        </div>
                        
                        {/* Contrôles d'en-tête (Statut, Priorité, Fermeture) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* Statut */}
                            <TouchSelect
                                value={status}
                                onChange={setStatus}
                                options={STATUS_OPTIONS}
                                title="Statut"
                                style={{ minHeight: '36px', height: '36px', borderRadius: '8px', fontSize: '0.78rem', padding: '0 10px', background: 'var(--color-well)', border: 'none' }}
                            />
                            
                            {/* Priorité (Segment Control minimaliste) */}
                            <div style={{ display: 'flex', background: 'var(--color-well)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
                                {PRIORITY_OPTIONS.map(opt => (
                                    <button key={opt.value} type="button" onClick={() => setPriority(opt.value)}
                                        style={{
                                            padding: '0 12px', fontSize: '0.75rem', fontWeight: 700,
                                            borderRadius: '6px', border: 'none', cursor: 'pointer',
                                            transition: 'all 0.15s',
                                            background: priority === opt.value ? opt.color : 'transparent',
                                            color: priority === opt.value ? 'white' : 'var(--color-muted)',
                                            whiteSpace: 'nowrap',
                                            height: '32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >{opt.label}</button>
                                ))}
                            </div>
                            
                            {/* Fermer */}
                            <button type="button" onClick={handleClose} className="btn-ghost" style={{ padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', color: 'var(--color-muted)' }}>
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                            
                            {/* COLONNE GAUCHE : Client, Logistique & Paiement (5 colonnes) */}
                            <div className="md:col-span-5" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                
                                {/* Carte Client & Logistique */}
                                <div style={{
                                    background: 'var(--color-well)',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--color-border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                        <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Client & Logistique
                                        </h3>
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

                                    {/* Grid Saisie Client & Téléphone */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div>
                                            <div style={{ position: 'relative' }}>
                                                <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: showErrors && !clientName.trim() ? 'var(--color-error)' : 'var(--color-primary)' }} />
                                                <input className={`input ${showErrors && !clientName.trim() ? 'has-error' : ''}`} 
                                                    style={{ 
                                                        paddingLeft: '36px', 
                                                        borderColor: showErrors && !clientName.trim() ? 'var(--color-error)' : 'var(--color-border)',
                                                        height: '48px',
                                                        minHeight: '48px',
                                                        fontSize: '0.9rem',
                                                        borderRadius: 'var(--radius-sm)',
                                                        background: 'var(--color-lift)'
                                                    }} 
                                                    value={clientName}
                                                    onChange={e => setClientName(e.target.value)} 
                                                    placeholder="Nom du client *" 
                                                    required 
                                                    inputMode="text" 
                                                    autoComplete="name" 
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <TouchInput
                                                value={clientPhone}
                                                onChange={setClientPhone}
                                                placeholder="+225 00000000 *"
                                                title="Numéro de téléphone *"
                                                isPhone={true}
                                                icon={<Phone size={16} style={{ color: showErrors && !clientPhone.trim() ? 'var(--color-error)' : '#d97757' }} />}
                                                style={{ 
                                                    borderColor: showErrors && !clientPhone.trim() ? 'var(--color-error)' : (crmCustomerId ? '#10B981' : 'var(--color-border)'),
                                                    height: '48px',
                                                    fontSize: '0.9rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--color-lift)'
                                                }}
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
                                    </div>

                                    {/* Mode de réception */}
                                    <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '4px', gap: '4px' }}>
                                        {([
                                            { val: 'retrait', label: '🏠 Retrait boutique' },
                                            { val: 'livraison', label: '🚚 Livraison' },
                                        ] satisfies Array<{ val: ReceptionType; label: string }>).map(({ val, label }) => (
                                            <button key={val} type="button" onClick={() => setReceptionType(val)}
                                                style={{
                                                    flex: 1, padding: '8px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem',
                                                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                                    background: receptionType === val ? 'var(--color-primary)' : 'transparent',
                                                    color: receptionType === val ? 'white' : 'var(--color-muted)',
                                                    minHeight: '40px'
                                                }}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Date & Heure */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <DatePicker
                                            value={pickupDate}
                                            onChange={setPickupDate}
                                            placeholder="Date retrait *"
                                            minDate={new Date()}
                                            hasError={showErrors && !pickupDate}
                                        />
                                        <TimeDigiPad
                                            value={pickupTime}
                                            onChange={setPickupTime}
                                            placeholder="Heure retrait"
                                            position="top"
                                        />
                                    </div>

                                    {/* Adresse si livraison */}
                                    {receptionType === 'livraison' && (
                                        <div className="animate-slide-up" style={{ position: 'relative' }}>
                                            <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: showErrors && !deliveryAddress.trim() ? 'var(--color-error)' : 'var(--color-primary)' }} />
                                            <input className={`input ${showErrors && !deliveryAddress.trim() ? 'has-error' : ''}`} 
                                                style={{ 
                                                    paddingLeft: '36px', 
                                                    borderColor: showErrors && !deliveryAddress.trim() ? 'var(--color-error)' : 'var(--color-border)',
                                                    height: '48px',
                                                    minHeight: '48px',
                                                    fontSize: '0.9rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--color-lift)'
                                                }} 
                                                value={deliveryAddress}
                                                onChange={e => setDeliveryAddress(e.target.value)} 
                                                placeholder="Quartier, rue... *" 
                                                required={receptionType === 'livraison'} 
                                                inputMode="text" 
                                                autoComplete="street-address" 
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Carte Règlement / Finances (Version épurée) */}
                                <div style={{
                                    background: 'var(--color-well)',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--color-border)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Règlement
                                            </h3>
                                            <button 
                                                type="button" 
                                                onClick={() => setShowDiscountInput(!showDiscountInput)} 
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                                                    color: discountAmount > 0 ? 'var(--color-warning)' : 'var(--color-muted)',
                                                    display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '4px'
                                                 }}
                                                 className="hover:bg-[rgba(129,84,49,0.06)]"
                                            >
                                                🏷️ {discountAmount > 0 ? `Réduction: ${discountAmount.toLocaleString('fr-FR')} ${currency}` : 'Ajouter réduction'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', marginTop: '4px', borderTop: discountAmount > 0 ? '1px dashed var(--color-border)' : 'none', paddingTop: discountAmount > 0 ? '4px' : '0' }}>
                                            {discountAmount > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                                     <span>Sous-total:</span>
                                                     <span>{subtotal.toLocaleString('fr-FR')} {currency}</span>
                                                </div>
                                            )}
                                            {discountAmount > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>
                                                     <span>Réduction:</span>
                                                     <span>-{discountAmount.toLocaleString('fr-FR')} {currency}</span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '2px' }}>
                                                 <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>À payer:</span>
                                                 <strong style={{ color: 'var(--color-text)', fontSize: '0.95rem', fontWeight: 800 }}>{total.toLocaleString('fr-FR')} {currency}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    {showDiscountInput && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-bg)', padding: '8px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', minWidth: '60px' }}>Montant :</span>
                                            <TouchInput
                                                value={discountAmount === 0 ? '' : discountAmount.toString()}
                                                onChange={v => {
                                                    const val = Math.min(subtotal, Math.max(0, parseFloat(v) || 0))
                                                    setDiscountAmount(val)
                                                }}
                                                placeholder="Montant réduction"
                                                title="Réduction de la commande"
                                                hideIcon={true}
                                                style={{ padding: '4px 8px', height: '36px', minHeight: '36px', fontSize: '0.8rem', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-lift)', flex: 1 }}
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setDiscountAmount(0);
                                                    setShowDiscountInput(false);
                                                }}
                                                style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '4px' }}
                                                className="hover:bg-[rgba(186,26,26,0.08)]"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}

                                    {/* Sélections de base (Acompte / Soldé) */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg)', padding: '4px', borderRadius: 'var(--radius-sm)', gap: '4px' }}>
                                        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                                            <button type="button" 
                                                onClick={() => {
                                                    setPaymentType('ACOMPTE');
                                                    setDeposit(0);
                                                    if (isMultiplePayment) {
                                                        setPayments(prev => prev.map((p, idx) => idx === 0 ? { ...p, label_type: 'ACOMPTE' } : p));
                                                    }
                                                }}
                                                style={{ 
                                                    flex: 1, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', 
                                                    background: paymentType === 'ACOMPTE' && !isMultiplePayment ? 'var(--color-warning)' : 'transparent', 
                                                    color: paymentType === 'ACOMPTE' && !isMultiplePayment ? 'white' : 'var(--color-muted)',
                                                    minHeight: '40px'
                                                }}>
                                                Acompte
                                            </button>
                                            <button type="button" 
                                                onClick={() => {
                                                    setPaymentType('SOLDE');
                                                    setDeposit(total);
                                                    if (isMultiplePayment) {
                                                        setPayments(prev => prev.map((p, idx) => idx === 0 ? { ...p, label_type: 'SOLDE' } : p));
                                                    }
                                                }}
                                                style={{ 
                                                    flex: 1, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', 
                                                    background: paymentType === 'SOLDE' && !isMultiplePayment ? 'var(--color-secondary)' : 'transparent', 
                                                    color: paymentType === 'SOLDE' && !isMultiplePayment ? 'white' : 'var(--color-muted)',
                                                    minHeight: '40px'
                                                }}>
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
                                                        { id: '2', amount: 0, payment_method: 'cash', label_type: 'ACOMPTE' }
                                                    ]);
                                                } else {
                                                    setPayments(prev => [
                                                        ...prev,
                                                        { id: Date.now().toString(), amount: 0, payment_method: 'cash', label_type: 'ACOMPTE' }
                                                    ]);
                                                }
                                                setPaymentAccordionOpen(true);
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: isMultiplePayment ? 'var(--color-primary)' : 'transparent',
                                                color: isMultiplePayment ? 'white' : 'var(--color-primary)',
                                                cursor: 'pointer',
                                                marginLeft: '4px',
                                                transition: 'all 0.15s',
                                                minHeight: '40px'
                                            }}
                                            title="Ajouter un mode de paiement multiple"
                                        >
                                            {isMultiplePayment ? '+ Ajouter' : '🔗 Multi-pay'}
                                        </button>
                                    </div>

                                    {/* Solde restant */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '0.85rem', color: 'var(--color-primary)', borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: '2px' }}>
                                        <span>Solde restant :</span>
                                        <span>{balance.toLocaleString('fr-FR')} {currency}</span>
                                    </div>
                                </div>

                            </div>

                            {/* COLONNE DROITE : Panier & Articles (7 colonnes) */}
                            <div className="md:col-span-7" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                
                                {/* Barre de recherche & Ajout manuel (Grandes cibles tactiles) */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }} ref={searchRef}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: showErrors && orderItems.length === 0 ? 'var(--color-error)' : 'var(--color-muted)' }} />
                                            <input 
                                                className={`input ${showErrors && orderItems.length === 0 ? 'has-error' : ''}`} 
                                                style={{ 
                                                    paddingLeft: '36px', 
                                                    paddingRight: '44px', 
                                                    height: '48px', 
                                                    minHeight: '48px', 
                                                    borderRadius: 'var(--radius-sm)', 
                                                    fontSize: '0.9rem' 
                                                }} 
                                                placeholder="Rechercher un produit..."
                                                value={searchQuery} 
                                                onChange={e => setSearchQuery(e.target.value)} 
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setCatalogModalOpen(true)}
                                                style={{
                                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                                    background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px',
                                                    color: 'var(--color-muted)', display: 'flex', alignItems: 'center'
                                                }}
                                                title="Voir le catalogue"
                                            >
                                                <Grid size={18} />
                                            </button>
                                            {isSearching && <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '44px', top: '50%', transform: 'translateY(-50%)' }} />}
                                            
                                            {/* Résultats de recherche */}
                                            {searchResults.length > 0 && (
                                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', zIndex: 120, marginTop: '4px', boxShadow: 'var(--shadow-md)', maxHeight: '200px', overflowY: 'auto' }}>
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
                                                                    background: isOut ? 'var(--color-well)' : 'transparent',
                                                                    fontSize: '0.85rem'
                                                                }}
                                                                className="hover:bg-[rgba(129,84,49,0.05)]"
                                                            >
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
                                                                <span style={{ color: isOut ? '#9ca3af' : 'var(--color-muted)', fontWeight: 600 }}>{Number(res.selling_price).toLocaleString('fr-FR')} {currency}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <button 
                                        type="button" 
                                        onClick={handleAddManual} 
                                        style={{
                                            height: '48px',
                                            minHeight: '48px',
                                            padding: '0 20px',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            borderRadius: '9999px'
                                        }}
                                        className="btn-secondary"
                                    >
                                        <Plus size={16} /> Sur mesure
                                    </button>
                                </div>

                                {/* Liste des articles (Sélection tactile sur toute la ligne) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '42vh', overflowY: 'auto', paddingRight: '4px' }}>
                                    {orderItems.length === 0 ? (
                                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                                            Aucun article dans la commande. Recherchez un produit ou ajoutez un article sur mesure.
                                        </div>
                                    ) : (
                                        orderItems.map((item, idx) => {
                                            const isSelected = selectedItemIndex === idx
                                            return (
                                                <div key={idx} 
                                                    onClick={() => setSelectedItemIndex(idx)}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        background: isSelected ? 'rgba(129, 84, 49, 0.07)' : 'var(--color-lift)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid',
                                                        borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                                                        transition: 'all 0.2s',
                                                        cursor: 'pointer',
                                                        overflow: 'hidden'
                                                    }}
                                                    className="hover:border-[var(--color-primary-container)]"
                                                >
                                                    {/* Ligne principale */}
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '8px 12px',
                                                        width: '100%'
                                                    }}>
                                                        {/* Numéro */}
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            #{idx + 1}
                                                        </span>
                                                        
                                                        {/* Quantité input tactile */}
                                                        <div style={{ width: '64px' }} onClick={e => e.stopPropagation()}>
                                                            <TouchInput
                                                                value={item.quantity.toString()}
                                                                onChange={v => handleUpdateItem(idx, 'quantity', parseInt(v) || 1)}
                                                                allowDecimal={false}
                                                                title={`Quantité`}
                                                                placeholder="Qté"
                                                                hideIcon={true}
                                                                style={{ padding: '4px 6px', height: '40px', minHeight: '40px', textAlign: 'center', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-lift)' }}
                                                            />
                                                        </div>

                                                        {/* Désignation */}
                                                        <div style={{ flex: 1 }} onClick={e => e.stopPropagation()}>
                                                            <input
                                                                className="input"
                                                                value={item.name}
                                                                onChange={e => handleUpdateItem(idx, 'name', e.target.value)}
                                                                placeholder="ex: Gâteau d'anniversaire..."
                                                                disabled={item.from_inventory}
                                                                style={{
                                                                    padding: '0 8px',
                                                                    height: '40px',
                                                                    minHeight: '40px',
                                                                    borderRadius: '8px',
                                                                    background: item.from_inventory ? 'transparent' : 'var(--color-lift)',
                                                                    border: item.from_inventory ? 'none' : '1px solid var(--color-border)',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: 600,
                                                                    color: 'var(--color-text)'
                                                                }}
                                                                required
                                                            />
                                                        </div>

                                                        {/* Prix Unitaire */}
                                                        <div style={{ width: '80px' }} onClick={e => e.stopPropagation()}>
                                                            <TouchInput
                                                                value={item.unit_price === 0 ? '' : item.unit_price.toString()}
                                                                onChange={v => handleUpdateItem(idx, 'unit_price', parseFloat(v) || 0)}
                                                                placeholder="Prix *"
                                                                title={`Prix unitaire *`}
                                                                hideIcon={true}
                                                                hasError={showErrors && (!item.unit_price || item.unit_price <= 0)}
                                                                style={{ padding: '4px 6px', height: '40px', minHeight: '40px', textAlign: 'right', fontSize: '0.85rem', border: '1px solid', borderColor: showErrors && (!item.unit_price || item.unit_price <= 0) ? 'var(--color-error)' : 'var(--color-border)', borderRadius: '8px', background: 'var(--color-lift)' }}
                                                            />
                                                        </div>

                                                        {/* Sous-total */}
                                                        <div style={{ width: '70px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)' }}>
                                                            {item.subtotal.toLocaleString('fr-FR')}
                                                        </div>

                                                        {/* Supprimer l'article */}
                                                        {orderItems.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRemoveItem(idx);
                                                                }}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: 'var(--color-error)',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    width: '40px',
                                                                    height: '40px',
                                                                    borderRadius: '8px',
                                                                    transition: 'background-color 0.2s',
                                                                    flexShrink: 0
                                                                }}
                                                                className="hover:bg-[rgba(186,26,26,0.08)]"
                                                                title="Supprimer l'article"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Options de l'article fusionnées en un seul bloc */}
                                                    {isSelected && (
                                                        <div 
                                                            onClick={e => e.stopPropagation()}
                                                            style={{
                                                                padding: '12px',
                                                                background: 'transparent',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '8px',
                                                                borderTop: '1px solid var(--color-border)'
                                                            }}
                                                        >
                                                            {/* Parts & Étages (si custom) */}
                                                            {!item.from_inventory && (
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', minWidth: '48px' }}>Parts:</span>
                                                                        <TouchInput
                                                                            value={item.parts?.toString() || ''}
                                                                            onChange={v => handleUpdateItem(idx, 'parts', parseInt(v) || undefined)}
                                                                            allowDecimal={false}
                                                                            placeholder="Parts"
                                                                            title={`Nombre de parts`}
                                                                            hideIcon={true}
                                                                            style={{ padding: '4px 6px', height: '40px', minHeight: '40px', textAlign: 'center', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-lift)', flex: 1 }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', minWidth: '48px' }}>Étages:</span>
                                                                        <TouchInput
                                                                            value={item.floors?.toString() || ''}
                                                                            onChange={v => handleUpdateItem(idx, 'floors', parseInt(v) || undefined)}
                                                                            allowDecimal={false}
                                                                            placeholder="Étages"
                                                                            title={`Nombre d'étages`}
                                                                            hideIcon={true}
                                                                            style={{ padding: '4px 6px', height: '40px', minHeight: '40px', textAlign: 'center', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-lift)', flex: 1 }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Notes & Image */}
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <textarea
                                                                    className="input"
                                                                    rows={2}
                                                                    placeholder="Notes particulières pour cet article (parfum, écritures, etc.)..."
                                                                    style={{
                                                                        resize: 'none',
                                                                        padding: '8px 10px',
                                                                        border: '1px solid var(--color-border)',
                                                                        borderRadius: '8px',
                                                                        background: 'var(--color-lift)',
                                                                        flex: 1,
                                                                        fontSize: '0.8rem',
                                                                        minHeight: '48px',
                                                                        height: '48px',
                                                                        lineHeight: '1.3'
                                                                    }}
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
                                                                        border: '1px dashed var(--color-border)',
                                                                        borderRadius: '8px',
                                                                        cursor: 'pointer',
                                                                        background: item.imageFile ? 'var(--color-secondary-container)' : 'var(--color-lift)',
                                                                        color: item.imageFile ? 'var(--color-secondary)' : 'var(--color-muted)',
                                                                        flexShrink: 0,
                                                                        position: 'relative'
                                                                    }}
                                                                    title={item.imageFile ? item.imageFile.name : "Photo d'inspiration"}
                                                                >
                                                                    {item.imageFile ? (
                                                                        <CheckCircle2 size={18} color="var(--color-secondary)" />
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
                                                    )}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>

                                {/* Double Accordéon de la colonne droite basse */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                    


                                    {/* Accordéon 2 : Options de règlement */}
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                        <button
                                            type="button"
                                            onClick={() => setPaymentAccordionOpen(!paymentAccordionOpen)}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                background: 'var(--color-well)',
                                                border: 'none',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                fontWeight: 800,
                                                fontSize: '0.8rem',
                                                color: 'var(--color-primary)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                minHeight: '44px'
                                            }}
                                        >
                                            <span>💳 Modes de paiement & Multi-pay</span>
                                            <span style={{ fontSize: '0.65rem' }}>{paymentAccordionOpen ? '▲' : '▼'}</span>
                                        </button>

                                        {paymentAccordionOpen && (
                                            <div style={{ padding: '12px', background: 'var(--color-lift)', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--color-border)' }}>
                                                
                                                {/* Unique Payment, Acompte */}
                                                {!isMultiplePayment && paymentType === 'ACOMPTE' && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ color: showErrors && priority !== 'vip' && (!deposit || deposit <= 0) ? 'var(--color-error)' : 'var(--color-muted)', fontSize: '0.78rem', fontWeight: 600 }}>
                                                                Saisir le montant de l&apos;acompte {priority === 'vip' ? '(Optionnel)' : '*'} :
                                                            </span>
                                                            <div style={{ width: '110px' }}>
                                                                <TouchInput 
                                                                    value={deposit.toString()} 
                                                                    onChange={v => setDeposit(parseFloat(v) || 0)} 
                                                                    placeholder={priority === 'vip' ? "Acompte" : "Acompte *"}
                                                                    hasError={showErrors && priority !== 'vip' && (!deposit || deposit <= 0)}
                                                                    style={{ height: '40px', minHeight: '40px', padding: '4px 8px', textAlign: 'right', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid', borderColor: showErrors && priority !== 'vip' && (!deposit || deposit <= 0) ? 'var(--color-error)' : 'var(--color-border)', background: 'var(--color-lift)' }} 
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Champ Note / Commentaire obligatoire pour les commandes VIP */}
                                                {priority === 'vip' && (
                                                    <div style={{
                                                        background: '#FEFCE8',
                                                        border: '1.5px solid #B57C1E',
                                                        borderRadius: 'var(--radius-md)',
                                                        padding: '12px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '6px',
                                                        marginTop: '4px'
                                                    }}>
                                                        <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#B57C1E', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            ⭐ Note / Commentaire VIP *
                                                        </label>
                                                        <textarea
                                                            value={vipNote}
                                                            onChange={e => setVipNote(e.target.value)}
                                                            placeholder="Motif / Commentaire pour la commande VIP..."
                                                            rows={2}
                                                            style={{
                                                                width: '100%',
                                                                borderRadius: '8px',
                                                                border: showErrors && !vipNote.trim() ? '1.5px solid var(--color-error)' : '1px solid #EAB308',
                                                                padding: '8px 10px',
                                                                fontSize: '0.82rem',
                                                                outline: 'none',
                                                                background: 'white',
                                                                color: 'var(--color-text)',
                                                                resize: 'none'
                                                            }}
                                                        />
                                                        {showErrors && !vipNote.trim() && (
                                                            <span style={{ color: 'var(--color-error)', fontSize: '0.72rem', fontWeight: 700 }}>
                                                                La note de commentaire est obligatoire pour les commandes VIP.
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Unique Payment Methods (Chips tactiles) */}
                                                {!isMultiplePayment && (paymentType === 'SOLDE' || deposit > 0) && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)' }}>Méthode de paiement :</span>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                            {PAYMENT_METHODS.map(m => (
                                                                <button key={m.value} type="button" onClick={() => setDepositPaymentMethod(m.value)}
                                                                    style={{
                                                                        padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700,
                                                                        borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                                                                        border: '1px solid', 
                                                                        borderColor: depositPaymentMethod === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                                                                        background: depositPaymentMethod === m.value ? 'rgba(129, 84, 49, 0.08)' : 'var(--color-well)',
                                                                        color: depositPaymentMethod === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                                                                        minHeight: '40px',
                                                                        display: 'flex',
                                                                        alignItems: 'center'
                                                                    }}>
                                                                    {m.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Multiple Payments details */}
                                                {isMultiplePayment && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
                                                        {payments.map((p) => (
                                                            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', background: 'var(--color-well)', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                                                    {/* Toggle */}
                                                                    <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: '8px', padding: '2px', gap: '2px' }}>
                                                                        <button type="button" onClick={() => {
                                                                            setPayments(prev => prev.map(item => item.id === p.id ? { ...item, label_type: 'ACOMPTE' } : item))
                                                                        }}
                                                                            style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: p.label_type === 'ACOMPTE' ? 'var(--color-warning)' : 'transparent', color: p.label_type === 'ACOMPTE' ? 'white' : 'var(--color-muted)', minHeight: '32px' }}>
                                                                            Acompte
                                                                        </button>
                                                                        <button type="button" onClick={() => {
                                                                            setPayments(prev => prev.map(item => item.id === p.id ? { ...item, label_type: 'SOLDE' } : item))
                                                                        }}
                                                                            style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: p.label_type === 'SOLDE' ? 'var(--color-secondary)' : 'transparent', color: p.label_type === 'SOLDE' ? 'white' : 'var(--color-muted)', minHeight: '32px' }}>
                                                                            Solde
                                                                        </button>
                                                                    </div>

                                                                    {/* Amount Input */}
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <div style={{ width: '90px' }}>
                                                                            <TouchInput value={p.amount.toString()} onChange={v => {
                                                                                const newAmount = parseFloat(v) || 0;
                                                                                setPayments(prev => prev.map(item => item.id === p.id ? { ...item, amount: newAmount } : item));
                                                                            }} 
                                                                            placeholder="Montant *"
                                                                            hasError={showErrors && (!p.amount || p.amount <= 0)}
                                                                            style={{ height: '36px', minHeight: '36px', padding: '2px 6px', textAlign: 'right', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid', borderColor: showErrors && (!p.amount || p.amount <= 0) ? 'var(--color-error)' : 'var(--color-border)', background: 'var(--color-lift)' }} />
                                                                        </div>
                                                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-muted)' }}>{currency}</span>
                                                                        
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
                                                                            }} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', background: 'rgba(186, 26, 26, 0.08)', color: 'var(--color-error)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                                                ✕
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Method Chips */}
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                    {PAYMENT_METHODS.map(m => (
                                                                        <button key={m.value} type="button" onClick={() => {
                                                                            setPayments(prev => prev.map(item => item.id === p.id ? { ...item, payment_method: m.value } : item))
                                                                        }}
                                                                            style={{
                                                                                padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700,
                                                                                borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s',
                                                                                border: '1px solid', borderColor: p.payment_method === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                                                                                background: p.payment_method === m.value ? 'rgba(129, 84, 49, 0.08)' : 'var(--color-lift)',
                                                                                color: p.payment_method === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                                                                                minHeight: '32px',
                                                                                display: 'flex',
                                                                                alignItems: 'center'
                                                                            }}>
                                                                            {m.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                            </div>
                                        )}
                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>

                    {/* FOOTER */}
                    <div style={{ padding: '10px 16px', borderTop: '1.5px solid var(--color-border)', display: 'flex', gap: '8px', background: 'var(--color-lift)', position: 'sticky', bottom: 0 }}>
                        <button type="button" onClick={handleClose} className="btn-secondary" style={{ flex: 1, minHeight: '44px', height: '44px' }}>Annuler</button>
                        <button type="submit" className="btn-primary"
                            disabled={isPending || !clientName.trim() || orderItems.length === 0 || !pickupDate}
                            style={{ flex: 2, minHeight: '44px', height: '44px' }}>
                            {isPending ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                            {isPending ? 'Création en cours…' : 'Créer la commande'}
                        </button>
                    </div>

                </form>
            </div>

        </div>

        <CatalogueModal
            open={catalogModalOpen}
            onClose={() => setCatalogModalOpen(false)}
            onAddToCart={(product: Product) => {
                handleAddItem(product)
                setCatalogModalOpen(false)
            }}
            organizationId={organizationId}
            currency={currency}
            initialProducts={cachedProducts}
        />
        {renderFeedback()}
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
