'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { startOfDay, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { 
    ShoppingBag, 
    Store,
    Clock,
    Search,
    X,
    Minus,
    Plus,
    CreditCard,
    DollarSign,
    Box,
    Loader2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import CatalogueModal from './CatalogueModal'
import DashboardNewOrderButton from '@/components/dashboard/DashboardNewOrderButton'
import { encaisserTransaction } from '@/lib/actions/caisse'

type CaisseProps = {
    organizationId: string
    currency: string
    profileName: string
    activeSession: any
    readyOrders: any[]
    caDuJour: number
    commandesEncaissees: number
    ventesVitrine: number
    recentHistory: any[]
    bestSellers: any[]
}

type PanierLine = {
    product_id: string | null
    nom: string
    prix: number
    qty: number
    fromCmd: boolean
}

const PAYMENT_METHODS = [
    { id: 'especes', label: 'Espèces', icon: DollarSign },
    { id: 'mobile_money', label: 'Mobile Money', icon: CreditCard },
    { id: 'carte', label: 'Carte Bancaire', icon: CreditCard }
]

export default function CaisseClient({
    organizationId,
    currency,
    profileName,
    activeSession,
    readyOrders: initialOrders,
    caDuJour: initialCA,
    commandesEncaissees: initialCmdCount,
    ventesVitrine: initialVitrineCount,
    recentHistory: initialHistory,
    bestSellers
}: CaisseProps) {
    // ÉTAT LOCAL
    const [panier, setPanier] = useState<PanierLine[]>([])
    const [activeOrder, setActiveOrder] = useState<any | null>(null)
    const [activeClient, setActiveClient] = useState<string | null>(null)
    const [acompte, setAcompte] = useState(0)
    
    const [modePayment, setModePayment] = useState('especes')
    const [montantRemisStr, setMontantRemisStr] = useState('')
    
    const [modalCatalogueOpen, setModalCatalogueOpen] = useState(false)
    const [searchClient, setSearchClient] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    
    const [readyOrders, setReadyOrders] = useState(initialOrders)
    
    // -- REALTIME --
    useEffect(() => {
        const supabase = createClient()
        const channel = supabase.channel('caisse-orders-ready')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: `organization_id=eq.${organizationId}`
            }, () => {
                // Invalidation fluide gérée par le Layout RealtimeSync
            })
            .subscribe()
            
        return () => {
            supabase.removeChannel(channel)
        }
    }, [organizationId])

    const searchParams = useSearchParams()

    // -- LOGIQUE PANIER --
    const chargerCommande = (order: any) => {
        setActiveOrder(order)
        setActiveClient(order.customer_name)
        setAcompte(Number(order.deposit_amount))
        
        const lines: PanierLine[] = order.order_items.map((item: any) => ({
            product_id: item.product_id,
            nom: item.products?.name || 'Produit',
            prix: Number(item.unit_price),
            qty: item.quantity,
            fromCmd: true
        }))
        
        // On remplace le panier courant
        setPanier(lines)
    }
    
    const addToCart = (product: any) => {
        setPanier(prev => {
            const existing = prev.find(p => p.product_id === product.id && !p.fromCmd)
            if (existing) {
                return prev.map(p => 
                    (p.product_id === product.id && !p.fromCmd) ? { ...p, qty: p.qty + 1 } : p
                )
            }
            return [...prev, {
                product_id: product.id,
                nom: product.name,
                prix: Number(product.selling_price),
                qty: 1,
                fromCmd: false
            }]
        })
    }
    
    const lastUpdateRef = useRef(0)
    const updateQty = (index: number, delta: number) => {
        const now = Date.now()
        if (now - lastUpdateRef.current < 150) return
        lastUpdateRef.current = now

        setPanier(prev => prev.map((item, i) => 
            i === index ? { ...item, qty: Math.max(1, item.qty + delta) } : item
        ))
    }
    
    const removeItem = (index: number) => {
        setPanier(prev => prev.filter((_, i) => i !== index))
    }
    
    const viderPanier = () => {
        setPanier([])
        setActiveOrder(null)
        setActiveClient(null)
        setAcompte(0)
        setMontantRemisStr('')
    }
    
    const detachClient = () => {
        // Enlève uniquement les items provenant de la commande
        setPanier(prev => prev.filter(p => !p.fromCmd))
        setActiveOrder(null)
        setActiveClient(null)
        setAcompte(0)
    }

    // Auto-load order from query param
    useEffect(() => {
        const orderId = searchParams.get('order')
        if (orderId && readyOrders.length > 0) {
            const orderToLoad = readyOrders.find((o: any) => o.id === orderId)
            if (orderToLoad) {
                chargerCommande(orderToLoad)
                // Clean the URL without fully reloading
                window.history.replaceState(null, '', '/caisse')
            }
        }
    }, [searchParams, readyOrders])

    // -- CALCULS --
    const sousTotal = panier.reduce((sum, item) => sum + (item.prix * item.qty), 0)
    const totalAEncaisser = Math.max(0, sousTotal - acompte)
    const montantRemis = Number(montantRemisStr) || 0
    const monnaieARendre = montantRemis - totalAEncaisser

    const canSubmit = panier.length > 0 && totalAEncaisser >= 0
    
    // -- ACTIONS --
    const handleEncaisser = async () => {
        if (!canSubmit) return
        if (modePayment === 'especes' && montantRemis < totalAEncaisser && totalAEncaisser > 0) {
            toast.error("Le montant remis est insuffisant")
            return
        }

        setIsSubmitting(true)
        
        const payload = {
            order_id: activeOrder?.id || null,
            client_name: activeClient || 'Vente vitrine',
            amount: totalAEncaisser,
            payment_method: modePayment,
            items: panier.map(item => ({
                product_id: item.product_id,
                name: item.nom,
                quantity: item.qty,
                unit_price: item.prix
            }))
        }
        
        const res = await encaisserTransaction(payload)
        
        if (res.error) {
            toast.error(res.error)
            setIsSubmitting(false)
            return
        }
        
        toast.success("Encaissé avec succès !")
        viderPanier()
        setIsSubmitting(false)
        // Petit délai pour laisser Supabase commiter
        setTimeout(() => window.location.reload(), 800)
    }

    return (
        <div style={{ display: 'flex', minHeight: 'calc(100dvh - 200px)', background: '#FDF8F3', borderRadius: '24px', overflow: 'hidden' }}>
            
            {/* ====== COLONNE GAUCHE (Main) ====== */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px' }}>
                
                {/* 1. TOPBAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#2D1B0E' }}>Caisse — Vente</h1>
                        <p style={{ margin: '4px 0 0', color: '#9C8070', fontSize: '0.9rem' }}>
                            {(() => {
                                const today = new Date();
                                return !isNaN(today.getTime()) ? format(today, 'EEEE d MMMM yyyy', { locale: fr }) : '';
                            })()} • {profileName}
                        </p>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                            padding: '6px 12px', borderRadius: '99px', fontSize: '0.85rem', fontWeight: 600,
                            background: activeSession ? '#D1FAE5' : '#FEE2E2',
                            color: activeSession ? '#065F46' : '#991B1B',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: activeSession ? '#10B981' : '#EF4444' }} />
                            {activeSession ? 'Boutique ouverte' : 'Boutique fermée'}
                        </div>
                    </div>
                </div>

                {/* 2. METRIQUES */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <div className="card" style={{ padding: '20px' }}>
                        <div style={{ fontSize: '0.9rem', color: '#9C8070', fontWeight: 600, marginBottom: '8px' }}>Ventes aujourd'hui</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2D1B0E' }}>{initialCmdCount + initialVitrineCount}</div>
                        <div style={{ fontSize: '0.8rem', color: '#C4836A', marginTop: '4px' }}>
                            {initialCmdCount} commandes · {initialVitrineCount} vitrine
                        </div>
                    </div>
                    <div className="card" style={{ padding: '20px' }}>
                        <div style={{ fontSize: '0.9rem', color: '#9C8070', fontWeight: 600, marginBottom: '8px' }}>Recettes du jour</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2D1B0E' }}>
                            {initialCA.toLocaleString('fr-FR')} {currency}
                        </div>
                    </div>
                    <div className="card" style={{ padding: '20px' }}>
                        <div style={{ fontSize: '0.9rem', color: '#9C8070', fontWeight: 600, marginBottom: '8px' }}>Commandes prêtes</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10B981' }}>{readyOrders.filter(o => o.status === 'ready').length}</div>
                    </div>
                </div>

                {/* 3.1 COMMANDES PRÊTES */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingBag size={18} color="#C4836A" /> Prêtes à encaisser
                </h2>
                {readyOrders.filter(o => o.status === 'ready').length === 0 ? (
                    <div style={{ background: 'white', padding: '32px', borderRadius: '16px', textAlign: 'center', color: '#9C8070', border: '1px solid #FDE8DB', marginBottom: '32px' }}>
                        <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                        <p>Aucune commande prête en attente.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '32px' }}>
                        {readyOrders.filter(o => o.status === 'ready').map(order => {
                            const isUrgent = order.priority === 'urgent'
                            const date = new Date(order.pickup_date)
                            return (
                                <button key={order.id} onClick={() => chargerCommande(order)}
                                    style={{
                                        background: 'white', padding: '16px', borderRadius: '16px',
                                        border: '1px solid #FDE8DB', borderLeft: isUrgent ? '4px solid #F59E0B' : '1px solid #FDE8DB',
                                        textAlign: 'left', cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s'
                                    }}
                                    className="card-clickable"
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ fontWeight: 700, color: '#2D1B0E', fontSize: '1.05rem' }}>{order.customer_name}</div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#C4836A' }}>
                                            {!isNaN(date.getTime()) ? format(date, 'HH:mm') : '--:--'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#9C8070', marginBottom: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {order.order_items.map((i: any) => i.products?.name).join(' · ')}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #FDF8F3', paddingTop: '12px' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#9C8070' }}>Reste à payer</span>
                                        <span style={{ fontWeight: 800, color: '#D97757' }}>{Number(order.balance).toLocaleString('fr-FR')} {currency}</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* 3.2 PIPELINE DU JOUR */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                    <Clock size={18} color="#9CA3AF" /> Pipeline du jour
                </h2>
                {readyOrders.filter(o => o.status === 'pending' || o.status === 'production').length === 0 ? (
                    <div style={{ background: 'white', padding: '16px', borderRadius: '16px', textAlign: 'center', color: '#9CA3AF', border: '1px solid #E5E7EB', marginBottom: '32px', fontSize: '0.9rem' }}>
                        Aucune commande en cours de production.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '32px' }}>
                        {readyOrders.filter(o => o.status === 'pending' || o.status === 'production').slice(0, 5).map(order => {
                            const date = new Date(order.pickup_date)
                            return (
                                <div key={order.id}
                                    style={{
                                        background: '#F9FAFB', padding: '16px', borderRadius: '16px',
                                        border: '1px dashed #E5E7EB', opacity: 0.8,
                                        display: 'flex', flexDirection: 'column', gap: '8px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.95rem' }}>{order.customer_name}</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>
                                            {!isNaN(date.getTime()) ? format(date, 'HH:mm') : '--:--'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {order.order_items.map((i: any) => i.products?.name).join(' · ')}
                                    </div>
                                    <div style={{ alignSelf: 'flex-start', marginTop: 'auto', background: order.status === 'pending' ? '#FEF3C7' : '#DBEAFE', color: order.status === 'pending' ? '#92400E' : '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                                        {order.status === 'pending' ? 'En attente' : 'En production'}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* 4. VENTE VITRINE */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Store size={18} color="#C4836A" /> Vente Rapide — Best-Sellers
                </h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    {bestSellers.map(bs => (
                        <button key={bs.id} onClick={() => addToCart(bs)}
                            style={{
                                background: 'white', padding: '12px', borderRadius: '16px', border: '1px solid #FDE8DB',
                                textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center'
                            }}
                            className="card-clickable"
                        >
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#FEF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                                <Box size={20} color="#D97757" />
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#2D1B0E', marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {bs.name}
                            </div>
                            <div style={{ fontWeight: 800, color: '#C4836A', fontSize: '0.9rem', marginTop: 'auto' }}>
                                {bs.selling_price.toLocaleString('fr-FR')} {currency}
                            </div>
                            {bs.stock_qty < 3 && (
                                <div style={{ fontSize: '0.7rem', color: '#F59E0B', fontWeight: 600, marginTop: '4px' }}>
                                    Plus que {bs.stock_qty}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
                
                <button onClick={() => setModalCatalogueOpen(true)} className="btn-secondary" style={{ width: '100%', marginBottom: '40px' }}>
                    <Search size={16} /> Voir tout le catalogue
                </button>

                {/* 5. HISTORIQUE */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} color="#C4836A" /> Historique récent
                </h2>
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #FDE8DB', overflow: 'hidden' }}>
                    {initialHistory.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#9C8070', fontSize: '0.85rem' }}>Aucune transaction aujourd'hui</div>
                    ) : (
                        initialHistory.map((t, i) => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: i < initialHistory.length - 1 ? '1px solid #FDF8F3' : 'none' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#2D1B0E', fontSize: '0.9rem' }}>{t.client_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#9C8070', marginTop: '4px' }}>
                                        {(() => {
                                            const date = new Date(t.created_at);
                                            return !isNaN(date.getTime()) ? format(date, 'HH:mm') : '--:--';
                                        })()} · {t.nb_items} article{t.nb_items > 1 ? 's' : ''} · {t.payment_method}
                                    </div>
                                </div>
                                <div style={{ fontWeight: 700, color: t.is_order ? '#10B981' : '#2D1B0E' }}>
                                    {Number(t.amount).toLocaleString('fr-FR')} {currency}
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>

            {/* ====== COLONNE DROITE (Panier) ====== */}
            <div style={{ width: '380px', background: 'white', borderLeft: '1.5px solid #FDE8DB', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                
                {/* Header Panier */}
                <div style={{ padding: '20px', borderBottom: '1px solid #FDE8DB', background: '#FAFAFA' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#2D1B0E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShoppingBag size={20} color="#D97757" /> Panier en cours
                        </h2>
                        {activeSession && <DashboardNewOrderButton organizationId={organizationId} currency={currency} />}
                    </div>
                    
                    <div style={{ position: 'relative', marginBottom: activeClient ? '16px' : 0 }}>
                        <Search size={16} color="#9C8070" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input 
                            type="text" 
                            className="input" 
                            placeholder="Rechercher une commande..."
                            value={searchClient}
                            onChange={e => setSearchClient(e.target.value)}
                            style={{ paddingLeft: '36px', height: '40px', fontSize: '0.85rem' }}
                        />
                        {/* Fake dropdown logic for standard filter */}
                        {searchClient && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, marginTop: '4px', overflow: 'hidden' }}>
                                {readyOrders.filter(o => o.customer_name.toLowerCase().includes(searchClient.toLowerCase())).map(o => (
                                    <button key={o.id} onClick={() => { chargerCommande(o); setSearchClient('') }}
                                        style={{ width: '100%', padding: '12px', textAlign: 'left', borderBottom: '1px solid #eee', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
                                        <div style={{ color: '#888' }}>{Number(o.balance).toLocaleString('fr-FR')} {currency} reste à payer</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {activeClient && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#FEF3EC', padding: '6px 12px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600, color: '#D97757' }}>
                            <span>Client : {activeClient}</span>
                            <button onClick={detachClient} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#D97757' }}>
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Lignes Panier */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    {panier.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9C8070', opacity: 0.6 }}>
                            <ShoppingBag size={48} style={{ marginBottom: '16px' }} />
                            <p style={{ fontWeight: 600 }}>Panier vide</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {panier.map((line, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 600, color: '#2D1B0E', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {line.nom}
                                            </span>
                                            {line.fromCmd && <span style={{ background: '#E0E7FF', color: '#4338CA', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>CMD</span>}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#9C8070' }}>{line.prix.toLocaleString('fr-FR')} {currency} / u</div>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', background: '#FDF8F3', borderRadius: '8px', overflow: 'hidden', border: '1px solid #FDE8DB' }}>
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    line.qty > 1 ? updateQty(idx, -1) : removeItem(idx);
                                                }}
                                                style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4836A' }}
                                            >
                                                {line.qty > 1 ? <Minus size={14} /> : <X size={14} color="#EF4444" />}
                                            </button>
                                            <span style={{ width: '24px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#2D1B0E' }}>{line.qty}</span>
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    updateQty(idx, 1);
                                                }}
                                                style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4836A' }}
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                        <div style={{ width: '70px', textAlign: 'right', fontWeight: 700, fontSize: '0.9rem', color: '#2D1B0E' }}>
                                            {(line.qty * line.prix).toLocaleString('fr-FR')} {currency}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Panier */}
                <div style={{ padding: '20px', borderTop: '1px solid #FDE8DB', background: '#FAFAFA' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: '#6B7280' }}>
                        <span>Sous-total</span>
                        <span style={{ fontWeight: 600, color: '#2D1B0E' }}>{sousTotal.toLocaleString('fr-FR')} {currency}</span>
                    </div>
                    {acompte > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: '#10B981' }}>
                            <span>Acompte versé</span>
                            <span style={{ fontWeight: 600 }}>- {acompte.toLocaleString('fr-FR')} {currency}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '1.4rem', color: '#2D1B0E', fontWeight: 800, marginTop: '12px', paddingTop: '12px', borderTop: '1.5px dashed #E5E7EB' }}>
                        <span>À encaisser</span>
                        <span style={{ color: totalAEncaisser > 0 ? '#D97757' : '#10B981' }}>{totalAEncaisser.toLocaleString('fr-FR')} {currency}</span>
                    </div>

                    {/* Modes de paiement */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                        {PAYMENT_METHODS.map(m => (
                            <button key={m.id} onClick={() => setModePayment(m.id)}
                                style={{
                                    flex: 1, padding: '10px 4px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer',
                                    transition: 'all 0.1s',
                                    border: modePayment === m.id ? '2px solid #D97757' : '1px solid #E5E7EB',
                                    background: modePayment === m.id ? '#FEF3EC' : 'white',
                                    color: modePayment === m.id ? '#C4836A' : '#6B7280'
                                }}
                            >
                                <m.icon size={18} />
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {/* Monnaie (seulement si Espèces et montant à payer > 0) */}
                    {modePayment === 'especes' && totalAEncaisser > 0 && (
                        <div style={{ marginBottom: '20px', background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Montant remis</label>
                                    <input 
                                        type="number" 
                                        className="input" 
                                        value={montantRemisStr}
                                        onChange={e => setMontantRemisStr(e.target.value)}
                                        placeholder="Ex: 10000"
                                    />
                                </div>
                                <div style={{ flex: 1, textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Monnaie à rendre</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: montantRemis > 0 ? (monnaieARendre >= 0 ? '#10B981' : '#EF4444') : '#D1D5DB' }}>
                                        {monnaieARendre > 0 ? monnaieARendre.toLocaleString('fr-FR') : '0'} {currency}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <button 
                        className="btn-primary" 
                        onClick={handleEncaisser}
                        disabled={!canSubmit || isSubmitting}
                        style={{ width: '100%', height: '54px', fontSize: '1.1rem', marginBottom: '12px',
                            opacity: (!canSubmit || isSubmitting) ? 0.5 : 1
                        }}
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={24} /> : `Encaisser ${totalAEncaisser.toLocaleString('fr-FR')} ${currency}`}
                    </button>
                    
                    {panier.length > 0 && (
                        <button onClick={viderPanier} className="btn-secondary" style={{ width: '100%', color: '#9C8070' }}>
                            Vider le panier
                        </button>
                    )}
                </div>
            </div>

            {/* Modal Catalogue Completely external to layout */}
            <CatalogueModal 
                open={modalCatalogueOpen} 
                onClose={() => setModalCatalogueOpen(false)}
                onAddToCart={addToCart}
                organizationId={organizationId}
                currency={currency}
            />

        </div>
    )
}
