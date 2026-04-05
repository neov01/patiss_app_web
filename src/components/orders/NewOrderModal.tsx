'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ShoppingBag, User, Phone, X, Loader2, Image as ImageIcon, MapPin, Search } from 'lucide-react'
import { createOrder } from '../../../lib/actions/orders'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import TouchInput from '@/components/ui/TouchInput'
import DatePicker from '@/components/ui/DatePicker'
import TimeDigiPad from '@/components/ui/TimeDigiPad'

interface Product { id: string; name: string; selling_price: number }

interface OrderItem {
    product_id?: string
    name: string
    quantity: number
    unit_price: number
    subtotal: number
    from_inventory: boolean
}

interface Props {
    open: boolean
    onClose: () => void
    products: Product[] // Initial products for fallback/default
    currency: string
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

export default function NewOrderModal({ open, onClose, products: initialProducts, currency }: Props) {
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
    const [deliveryFee, setDeliveryFee] = useState(0)
    const [deposit, setDeposit] = useState(0)
    const [depositPaymentMethod, setDepositPaymentMethod] = useState('Espèces')

    // Search Inventory
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<Product[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    // Calculate totals
    const subtotal = orderItems.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0)
    const total = subtotal + deliveryFee
    const balance = Math.max(0, total - deposit)

    useEffect(() => {
        if (open) {
            const year = new Date().getFullYear()
            const rand = Math.floor(1000 + Math.random() * 9000)
            setOrderNumber(`CMD-${year}-${rand}`)
        }
    }, [open])

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
            const { data } = await (supabase.from as any)('products').select('id, name, selling_price').ilike('name', `%${searchQuery}%`).limit(10)
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
        setDeliveryFee(0)
        setDeposit(0)
        setDepositPaymentMethod('Espèces')
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
        }
        // Format as 'YYYY-MM-DDTHH:MM' for datetime-local compat
        const pad = (n: number) => n.toString().padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    })()

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
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
                    const supabase = createSupabaseClient()
                    const ext = imageFile.name.split('.').pop() || 'jpg'
                    const filePath = `orders/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
                    const { error: uploadError } = await supabase.storage.from('order-images').upload(filePath, imageFile)
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
                order_number: orderNumber,
                status,
                priority,
                customer_name: clientName,
                customer_contact: clientPhone,
                reception_type: receptionType,
                pickup_date: pickupDeliveryDate,
                delivery_address: receptionType === 'livraison' ? deliveryAddress : undefined,
                order_channel: receptionType === 'retrait' ? orderChannel : undefined,
                subtotal,
                delivery_fee: deliveryFee,
                total_amount: total,
                deposit_amount: deposit,
                balance,
                customization_notes: customizationNotes,
                custom_image_url: customImageUrl,
                deposit_payment_method: deposit > 0 ? depositPaymentMethod : undefined,
                items: orderItems
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
        <div className="modal-overlay" onClick={handleClose} style={{ zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ maxWidth: '42rem', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '0' }} onClick={e => e.stopPropagation()}>
                <form onSubmit={handleSubmit}>
                    
                    {/* EN-TÊTE DU MODAL */}
                    <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-background)', zIndex: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Nouvelle commande</h2>
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)', fontFamily: 'monospace' }}>#{orderNumber}</span>
                            </div>
                            <button type="button" onClick={handleClose} className="btn-ghost" style={{ padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <select value={status} onChange={e => setStatus(e.target.value)} 
                                className="input" style={{ width: 'auto', padding: '4px 12px', minHeight: '32px', borderRadius: '99px', fontSize: '0.875rem', fontWeight: 600 }}>
                                {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                            
                            <div style={{ display: 'flex', background: 'var(--color-surface-secondary)', borderRadius: '8px', padding: '4px', gap: '4px' }}>
                                {PRIORITY_OPTIONS.map(opt => (
                                    <button 
                                        key={opt.value} 
                                        type="button" 
                                        onClick={() => setPriority(opt.value)}
                                        style={{ 
                                            flex: 1,
                                            padding: '6px 12px', 
                                            fontSize: '0.85rem', 
                                            fontWeight: 700, 
                                            borderRadius: '6px',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            background: priority === opt.value ? opt.color : 'transparent',
                                            color: priority === opt.value ? 'white' : 'var(--color-muted)',
                                            boxShadow: priority === opt.value ? `0 4px 12px ${opt.color}44` : 'none',
                                            border: 'none'
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        {/* CLIENT & LOGISTIQUE */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                            <div>
                                <label className="label">Client *</label>
                                <div style={{ position: 'relative' }}>
                                    <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#d4a87a' }} />
                                    <input className="input" style={{ paddingLeft: '36px', borderColor: '#d4a87a' }} value={clientName}
                                        onChange={e => setClientName(e.target.value)} placeholder="Nom du client" required />
                                </div>
                            </div>
                            <div>
                                <label className="label">Téléphone *</label>
                                <div style={{ position: 'relative' }}>
                                    <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#d4a87a' }} />
                                    <input type="tel" className="input" style={{ paddingLeft: '36px', borderColor: '#d4a87a' }} value={clientPhone}
                                        onChange={e => setClientPhone(e.target.value)} placeholder="+225 00000000" required />
                                </div>
                            </div>
                            
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ display: 'flex', background: 'var(--color-surface-secondary)', borderRadius: '8px', padding: '4px' }}>
                                    <button type="button" onClick={() => setReceptionType('retrait')}
                                        style={{ flex: 1, padding: '8px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s',
                                        background: receptionType === 'retrait' ? '#d4a87a' : 'transparent', color: receptionType === 'retrait' ? 'white' : 'var(--color-muted)' }}>
                                        🏠 Retrait en boutique
                                    </button>
                                    <button type="button" onClick={() => setReceptionType('livraison')}
                                        style={{ flex: 1, padding: '8px', borderRadius: '6px', fontWeight: 600, transition: 'all 0.2s',
                                        background: receptionType === 'livraison' ? '#d4a87a' : 'transparent', color: receptionType === 'livraison' ? 'white' : 'var(--color-muted)' }}>
                                        🚚 Livraison
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="label">{receptionType === 'retrait' ? 'Date de retrait *' : 'Date de livraison *'}</label>
                                <DatePicker
                                    value={pickupDate}
                                    onChange={setPickupDate}
                                    placeholder="Sélectionner une date"
                                    minDate={new Date()}
                                />
                            </div>
                            <div>
                                <label className="label">Heure</label>
                                <TimeDigiPad
                                    value={pickupTime}
                                    onChange={setPickupTime}
                                    placeholder="Sélectionner l'heure"
                                />
                            </div>

                            {receptionType === 'livraison' && (
                                <div>
                                    <label className="label">Adresse de livraison *</label>
                                    <div style={{ position: 'relative' }}>
                                        <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#d4a87a' }} />
                                        <input className="input" style={{ paddingLeft: '36px', borderColor: '#d4a87a' }} value={deliveryAddress}
                                            onChange={e => setDeliveryAddress(e.target.value)} placeholder="Quartier, rue..." required={receptionType === 'livraison'} />
                                    </div>
                                </div>
                            )}

                            {receptionType === 'retrait' && (
                                <div>
                                    <label className="label">Canal de commande</label>
                                    <select className="input" value={orderChannel} onChange={e => setOrderChannel(e.target.value)}>
                                        <option>Sur place</option>
                                        <option>WhatsApp</option>
                                        <option>Téléphone</option>
                                        <option>Instagram</option>
                                        <option>Messenger</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* PRODUITS COMMANDÉS */}
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>Produits</h3>
                            
                            <div style={{ position: 'relative', marginBottom: '12px' }} ref={searchRef}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                                <input className="input" style={{ paddingLeft: '36px' }} placeholder="Rechercher dans l'inventaire..."
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                
                                {isSearching && <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />}
                                
                                {searchResults.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', zIndex: 20, marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                                        {searchResults.map(res => (
                                            <button key={res.id} type="button" onClick={() => handleAddItem(res)}
                                                style={{ width: '100%', padding: '10px 12px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
                                                <span style={{ fontWeight: 600 }}>{res.name}</span>
                                                <span style={{ color: 'var(--color-muted)' }}>{res.selling_price.toLocaleString('fr-FR')} {currency}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {orderItems.map((item, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 100px 32px', gap: '8px', alignItems: 'center', background: 'var(--color-surface-secondary)', padding: '8px', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {item.from_inventory && <span className="badge badge-pending" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>Inv.</span>}
                                            <input className="input" value={item.name} onChange={e => handleUpdateItem(idx, 'name', e.target.value)} placeholder="Désignation" disabled={item.from_inventory} style={{ padding: '6px 8px', height: '32px' }} required />
                                        </div>
                                        <input type="number" min="1" className="input" value={item.quantity || ''} onChange={e => handleUpdateItem(idx, 'quantity', parseInt(e.target.value) || 0)} style={{ padding: '6px 8px', height: '32px', textAlign: 'center' }} required />
                                        <TouchInput value={item.unit_price.toString()} onChange={v => handleUpdateItem(idx, 'unit_price', parseFloat(v) || 0)} style={{ padding: '6px 8px', height: '32px', textAlign: 'right' }} />
                                        <button type="button" onClick={() => handleRemoveItem(idx)} className="btn-ghost" style={{ padding: '0', minHeight: '32px', color: '#D94F38' }}>
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                                
                                <button type="button" onClick={handleAddManual} className="btn-ghost" style={{ color: '#d4a87a', fontWeight: 600, alignSelf: 'flex-start', padding: '6px 0' }}>
                                    + Ajouter manuellement
                                </button>
                            </div>
                        </div>

                        {/* PERSONNALISATION */}
                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>Personnalisation</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <textarea className="input" rows={2} value={customizationNotes} onChange={e => setCustomizationNotes(e.target.value)}
                                    placeholder="Texte sur le gâteau, couleurs, allergies, instructions spéciales..." style={{ resize: 'none' }}></textarea>
                                
                                <div>
                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px dashed var(--color-border)', borderRadius: '8px', padding: '16px', cursor: 'pointer', background: 'var(--color-surface-secondary)', color: 'var(--color-muted)' }}>
                                        <ImageIcon size={20} />
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{imageFile ? imageFile.name : 'Ajouter une photo d\'inspiration'}</span>
                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => setImageFile(e.target.files?.[0] || null)} />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* RÉCAP FINANCIER */}
                        <div style={{ background: 'var(--color-surface-secondary)', borderRadius: '12px', padding: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)', fontSize: '0.9rem' }}>
                                    <span>Sous-total</span>
                                    <span>{subtotal.toLocaleString('fr-FR')} {currency}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>Frais de livraison</span>
                                    <div style={{ width: '100px' }}>
                                        <TouchInput value={deliveryFee.toString()} onChange={v => setDeliveryFee(parseFloat(v) || 0)} style={{ height: '32px', padding: '4px 8px', textAlign: 'right' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>Acompte reçu</span>
                                    <div style={{ width: '100px' }}>
                                        <TouchInput value={deposit.toString()} onChange={v => setDeposit(parseFloat(v) || 0)} style={{ height: '32px', padding: '4px 8px', textAlign: 'right' }} />
                                    </div>
                                </div>
                                {deposit > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>Paiement acompte</span>
                                        <div style={{ display: 'flex', background: 'var(--color-background)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                                            {['Espèces', 'Mobile Money', 'Carte Bancaire'].map(method => (
                                                <button
                                                    key={method}
                                                    type="button"
                                                    onClick={() => setDepositPaymentMethod(method)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        background: depositPaymentMethod === method ? '#d4a87a' : 'transparent',
                                                        color: depositPaymentMethod === method ? 'white' : 'var(--color-muted)',
                                                    }}
                                                >
                                                    {method === 'Espèces' ? '💵' : method === 'Mobile Money' ? '📱' : '💳'} {method}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: '1rem', color: '#d4a87a' }}>
                                    <span>Solde restant</span>
                                    <span>{balance.toLocaleString('fr-FR')} {currency}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                    
                    {/* FOOTER ACTIONS */}
                    <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px', background: 'var(--color-background)', position: 'sticky', bottom: 0 }}>
                        <button type="button" onClick={handleClose} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
                        <button type="submit" className="btn-primary" 
                            disabled={isPending || !clientName.trim() || orderItems.length === 0 || !pickupDate} 
                            style={{ flex: 2, background: '#d4a87a', color: 'white' }}>
                            {isPending ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                            {isPending ? 'Création...' : 'Créer la commande'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    )
}
