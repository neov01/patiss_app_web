'use client'

import { useState, useEffect, useRef, useOptimistic, useTransition } from 'react'
import SessionPill from '@/components/layout/SessionPill'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useActionFeedback } from '@/hooks/useActionFeedback'
import { 
    ShoppingBag,
    Store,
    X,
    Minus,
    Plus,
    CreditCard,
    DollarSign,
    Box,
    Loader2,
    UserCheck,
    BadgeCheck,
    Info,
    Clock,
    Search,
    Trash2,
    Printer,
    CheckCircle,
    ChevronDown,
    Coins,
    Ticket,
    Calendar,
    TrendingUp,
    Filter,
    FileWarning,
    DoorClosed,
    ArrowLeft,
    SearchIcon,
    Copy
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import CatalogueModal from './CatalogueModal'
import DashboardNewOrderButton from '@/components/dashboard/DashboardNewOrderButton'
import CartQuantityButton from './CartQuantityButton'
import { encaisserTransaction, finaliserCommandeDejaPayee } from '@/lib/actions/caisse'
import TouchInput from '@/components/ui/TouchInput'
import TouchSelect from '@/components/ui/TouchSelect'
import { useOffline } from '@/components/providers/OfflineProvider'
import { getCachedReadyOrders } from '@/lib/offline/db'
import { CRMSelector } from './CRMSelector'
import SessionsHistoryClient from './SessionsHistoryClient'

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
    sessions?: any[]
    roleSlug: string
}

type PanierLine = {
    product_id: string | null
    nom: string
    prix: number
    qty: number
    fromCmd: boolean
}

const PAYMENT_METHODS = [
    { id: 'Espèces', label: 'Espèces', icon: DollarSign },
    { id: 'Orange Money', label: 'Orange Money', icon: CreditCard },
    { id: 'Wave', label: 'Wave', icon: CreditCard },
    { id: 'MTN MOMO', label: 'MTN MOMO', icon: CreditCard },
    { id: 'Moov Money', label: 'Moov Money', icon: CreditCard },
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
    bestSellers,
    sessions = [],
    roleSlug
}: CaisseProps) {
    // ÉTAT LOCAL
    const [caisseTab, setCaisseTab] = useState<'vente' | 'historique'>('vente')
    const [panier, setPanier] = useState<PanierLine[]>([])
    const [activeOrder, setActiveOrder] = useState<any | null>(null)
    const [activeClient, setActiveClient] = useState<string | null>(null)
    const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null)
    const [activeClientPhone, setActiveClientPhone] = useState<string | null>(null)
    const [acompte, setAcompte] = useState(0)
    
    const [activePayments, setActivePayments] = useState<Record<string, number>>({ 'Espèces': 0 })
    const [montantRemisStr, setMontantRemisStr] = useState('')
    
    const [modalCatalogueOpen, setModalCatalogueOpen] = useState(false)
    const [caisseMode, setCaisseMode] = useState<'commande' | 'vitrine'>('commande')
    const [searchClient, setSearchClient] = useState('')
    const { execute, isPending: isSubmitting, renderFeedback } = useActionFeedback()
    
    // Optimistic UI pour le panier (Zéro Latence)
    const [optimisticPanier, setOptimisticPanier] = useOptimistic<PanierLine[], { type: 'add' | 'update' | 'remove' | 'clear', payload?: any }>(
        panier,
        (state, action) => {
            switch (action.type) {
                case 'add':
                    const existing = state.find(p => p.product_id === action.payload.id && !p.fromCmd)
                    if (existing) {
                        return state.map(p => (p.product_id === action.payload.id && !p.fromCmd) ? { ...p, qty: p.qty + 1 } : p)
                    }
                    return [...state, { product_id: action.payload.id, nom: action.payload.name, prix: Number(action.payload.selling_price), qty: 1, fromCmd: false }]
                case 'update':
                    return state.map((item, i) => i === action.payload.index ? { ...item, qty: Math.max(1, item.qty + action.payload.delta) } : item)
                case 'remove':
                    return state.filter((_, i) => i !== action.payload.index)
                case 'clear':
                    return []
                default:
                    return state
            }
        }
    )
    const [isPending, startTransition] = useTransition()
    
    const [readyOrders, setReadyOrders] = useState(initialOrders)

    // Offline support
    const { isOffline, saveTransactionOffline, refreshProductCache, refreshReadyOrdersCache } = useOffline()

    // Cache les best-sellers pour le mode hors-ligne
    useEffect(() => {
        if (bestSellers && bestSellers.length > 0) {
            refreshProductCache(bestSellers.map(bs => ({
                id: bs.id,
                name: bs.name,
                selling_price: bs.selling_price,
                current_stock: bs.stock_qty,
                category: '',
            })))
        }
    }, [bestSellers, refreshProductCache])
    
    // Cache les commandes prêtes
    useEffect(() => {
        if (!isOffline && initialOrders.length > 0) {
            refreshReadyOrdersCache(initialOrders)
            setReadyOrders(initialOrders)
        } else if (isOffline) {
            getCachedReadyOrders().then(cached => {
                if (cached && cached.length > 0) {
                    setReadyOrders(cached)
                }
            }).catch(console.error)
        }
    }, [isOffline, initialOrders, refreshReadyOrdersCache])
    
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

    // Lire l'onglet depuis l'URL si présent
    useEffect(() => {
        const tab = searchParams.get('tab')
        if (tab === 'historique' && (roleSlug === 'gerant' || roleSlug === 'super_admin')) {
            setCaisseTab('historique')
        }
    }, [searchParams, roleSlug])

    // -- LOGIQUE PANIER --
    const chargerCommande = (order: any) => {
        setActiveOrder(order)
        setActiveClient(order.customer_name)
        setActiveCustomerId(order.customer_id || null)
        setAcompte(Number(order.paid_amount ?? order.deposit_amount ?? 0))
        
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
        // MAJ UI Immédiate Optimiste
        startTransition(() => {
            setOptimisticPanier({ type: 'add', payload: product })
        })
        
        // MAJ Etat Réel
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

        startTransition(() => {
            setOptimisticPanier({ type: 'update', payload: { index, delta } })
        })
        setPanier(prev => prev.map((item, i) => 
            i === index ? { ...item, qty: Math.max(1, item.qty + delta) } : item
        ))
    }
    
    const removeItem = (index: number) => {
        startTransition(() => {
            setOptimisticPanier({ type: 'remove', payload: { index } })
        })
        setPanier(prev => prev.filter((_, i) => i !== index))
    }
    
    const viderPanier = () => {
        startTransition(() => {
            setOptimisticPanier({ type: 'clear' })
        })
        setPanier([])
        setActiveOrder(null)
        setActiveClient(null)
        setActiveCustomerId(null)
        setActiveClientPhone(null)
        setAcompte(0)
        setMontantRemisStr('')
        setActivePayments({ 'Espèces': 0 })
    }
    
    const detachClient = () => {
        // Enlève uniquement les items provenant de la commande
        setPanier(prev => prev.filter(p => !p.fromCmd))
        setActiveOrder(null)
        setActiveClient(null)
        setActiveCustomerId(null)
        setActiveClientPhone(null)
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
    // Use optimisticPanier instead of panier for zero-latency display
    const sousTotal = optimisticPanier.reduce((sum, item) => sum + (item.prix * item.qty), 0)    
    const totalAEncaisser = Math.max(0, sousTotal - acompte)
    
    const sommePayee = Object.values(activePayments).reduce((sum, val) => sum + val, 0)
    const resteAPercevoir = Math.max(0, totalAEncaisser - sommePayee)
    
    // Si l'utilisateur a saisi un montant supérieur au total dans le champ espèces,
    // on calcule la monnaie automatiquement à partir de cet extra.
    const extraEspeces = (activePayments['Espèces'] || 0) > 0 ? Math.max(0, sommePayee - totalAEncaisser) : 0
    const montantRemis = Number(montantRemisStr) || 0
    const monnaieARendre = montantRemis > 0 ? Math.max(0, montantRemis - (activePayments['Espèces'] || 0)) : extraEspeces

    const canSubmit = optimisticPanier.length > 0 && resteAPercevoir === 0 && (sommePayee > 0 || totalAEncaisser === 0)
    
    // -- ACTIONS --
    const handleEncaisser = async () => {
        if (!canSubmit) return

        // Cas commande déjà intégralement payée : juste marquer completed, pas de nouvelle transaction
        if (totalAEncaisser === 0 && activeOrder?.id) {
            await execute(
                async () => finaliserCommandeDejaPayee(activeOrder.id),
                {
                    successMessage: "Commande remise au client !",
                    type: 'simple',
                    onSuccess: () => {
                        viderPanier()
                        setTimeout(() => window.location.reload(), 800)
                    }
                }
            )
            return
        }

        const primaryMethod = Object.entries(activePayments).sort((a,b) => b[1] - a[1])[0][0]

        // Pour l'enregistrement, on s'assure que le total des détails de paiement ne dépasse pas l'en-caisser
        // On réduit le montant espèces si nécessaire (c'est lui qui génère la monnaie)
        const paymentDetailsForDb = { ...activePayments }
        const surplus = Math.max(0, sommePayee - totalAEncaisser)
        if (surplus > 0 && paymentDetailsForDb['Espèces']) {
            paymentDetailsForDb['Espèces'] = Math.max(0, paymentDetailsForDb['Espèces'] - surplus)
        }

        const payload = {
            id: crypto.randomUUID(),
            order_id: activeOrder?.id || null,
            customer_id: activeCustomerId,
            client_name: activeClient || 'Vente vitrine',
            client_phone: activeClientPhone ?? undefined,
            amount: totalAEncaisser,
            payment_method: primaryMethod,
            payment_details: paymentDetailsForDb,
            items: optimisticPanier.map(item => ({
                id: crypto.randomUUID(),
                product_id: item.product_id,
                name: item.nom,
                quantity: item.qty,
                unit_price: item.prix
            }))
        }
        
        // MODE OFFLINE : sauvegarder en IndexedDB
        if (isOffline) {
            await execute(
                async () => {
                    await saveTransactionOffline(payload)
                    return { success: true }
                },
                {
                    successMessage: "Enregistré en local (hors-ligne) ✓",
                    type: 'simple',
                    onSuccess: () => {
                        viderPanier()
                    }
                }
            )
            return
        }

        // MODE ONLINE : envoi normal au serveur
        await execute(
            async () => encaisserTransaction(payload),
            {
                successMessage: "Encaissé avec succès !",
                type: 'simple',
                onSuccess: () => {
                    viderPanier()
                    setTimeout(() => window.location.reload(), 800)
                }
            }
        )
    }

    const showTabs = roleSlug === 'gerant' || roleSlug === 'super_admin'

    return (
        <div className="caisse-layout-container" style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--color-caisse-bg)', borderRadius: '24px', overflow: 'hidden' }}>
            
            {caisseTab === 'historique' && showTabs ? (
                <div className="caisse-main-column" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px', flex: 1, minHeight: 0, height: '100%' }}>
                    {/* Onglets */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                        <div role="tablist" aria-label="Navigation de la caisse" style={{
                            display: 'flex',
                            background: 'var(--color-caisse-tab-bg)',
                            padding: '4px',
                            borderRadius: '99px',
                            border: '1px solid rgba(131, 116, 107, 0.15)',
                        }}>
                            <button
                                onClick={() => setCaisseTab('vente')}
                                role="tab"
                                aria-selected={false}
                                aria-label="Afficher l'enregistrement des ventes"
                                style={{
                                    padding: '8px 24px',
                                    borderRadius: '99px',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    background: 'transparent',
                                    color: '#9C8070',
                                }}
                            >
                                🛒 Enregistrer une vente
                            </button>
                            <button
                                onClick={() => setCaisseTab('historique')}
                                role="tab"
                                aria-selected={true}
                                aria-label="Afficher l'historique des sessions"
                                style={{
                                    padding: '8px 24px',
                                    borderRadius: '99px',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    background: 'white',
                                    color: '#2D1B0E',
                                    boxShadow: '0 2px 8px rgba(45, 27, 14, 0.08)',
                                }}
                            >
                                📜 Historique des sessions
                            </button>
                        </div>
                    </div>

                    <SessionsHistoryClient 
                        sessions={sessions} 
                        currency={currency} 
                        roleSlug={roleSlug} 
                        embedded={true} 
                    />
                </div>
            ) : (
                <>
                    {/* ====== COLONNE GAUCHE (Main) ====== */}
                    <div className="caisse-main-column" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px', flex: 1, minHeight: 0, height: '100%' }}>
                        
                        {/* Onglets */}
                        {showTabs && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                                <div role="tablist" aria-label="Navigation de la caisse" style={{
                                    display: 'flex',
                                    background: 'var(--color-caisse-tab-bg)',
                                    padding: '4px',
                                    borderRadius: '99px',
                                    border: '1px solid rgba(131, 116, 107, 0.15)',
                                }}>
                                    <button
                                        onClick={() => setCaisseTab('vente')}
                                        role="tab"
                                        aria-selected={true}
                                        aria-label="Afficher l'enregistrement des ventes"
                                        style={{
                                            padding: '8px 24px',
                                            borderRadius: '99px',
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            background: 'white',
                                            color: '#2D1B0E',
                                            boxShadow: '0 2px 8px rgba(45, 27, 14, 0.08)',
                                        }}
                                    >
                                        🛒 Enregistrer une vente
                                    </button>
                                    <button
                                        onClick={() => setCaisseTab('historique')}
                                        role="tab"
                                        aria-selected={false}
                                        aria-label="Afficher l'historique des sessions"
                                        style={{
                                            padding: '8px 24px',
                                            borderRadius: '99px',
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                            background: 'transparent',
                                            color: '#9C8070',
                                        }}
                                    >
                                        📜 Historique des sessions
                                    </button>
                                </div>
                            </div>
                        )}
                
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
                        {isOffline && (
                            <div style={{ 
                                padding: '6px 12px', borderRadius: '99px', fontSize: '0.85rem', fontWeight: 600,
                                background: 'var(--color-badge-warning-bg)', color: 'var(--color-badge-warning-text)',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                                Mode hors-ligne
                            </div>
                        )}
                        <SessionPill />
                    </div>
                </div>

                {/* TOGGLE COMMANDE / VITRINE */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <button
                        onClick={() => setCaisseMode('commande')}
                        style={{
                            flex: 1, padding: '10px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.15s',
                            background: caisseMode === 'commande' ? '#2C1A0E' : 'white',
                            color: caisseMode === 'commande' ? 'white' : '#2C1A0E',
                            border: caisseMode === 'commande' ? '1px solid #2C1A0E' : '1px solid #E5DDD5',
                        }}
                    >
                        Commande
                    </button>
                    <button
                        onClick={() => setCaisseMode('vitrine')}
                        style={{
                            flex: 1, padding: '10px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.15s',
                            background: caisseMode === 'vitrine' ? '#2C1A0E' : 'white',
                            color: caisseMode === 'vitrine' ? 'white' : '#2C1A0E',
                            border: caisseMode === 'vitrine' ? '1px solid #2C1A0E' : '1px solid #E5DDD5',
                        }}
                    >
                        Vitrine
                    </button>
                </div>

                {/* 2. METRIQUES */}
                <div className="metrics-container" style={{ display: 'flex', gap: '16px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px', scrollSnapType: 'x mandatory' }}>
                    <div className="card" style={{ padding: '20px', minWidth: '160px', flex: 1, scrollSnapAlign: 'start' }}>
                        <div style={{ fontSize: '0.9rem', color: '#9C8070', fontWeight: 600, marginBottom: '8px' }}>Ventes aujourd'hui</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2D1B0E' }}>{initialCmdCount + initialVitrineCount}</div>
                        <div style={{ fontSize: '0.8rem', color: '#C4836A', marginTop: '4px' }}>
                            {initialCmdCount} commandes · {initialVitrineCount} vitrine
                        </div>
                    </div>
                    <div className="card" style={{ padding: '20px', minWidth: '160px', flex: 1, scrollSnapAlign: 'start' }}>
                        <div style={{ fontSize: '0.9rem', color: '#9C8070', fontWeight: 600, marginBottom: '8px' }}>Recettes du jour</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2D1B0E' }}>
                            {initialCA.toLocaleString('fr-FR')} {currency}
                        </div>
                    </div>
                    <div className="card" style={{ padding: '20px', minWidth: '160px', flex: 1, scrollSnapAlign: 'start' }}>
                        <div style={{ fontSize: '0.9rem', color: '#9C8070', fontWeight: 600, marginBottom: '8px' }}>Commandes prêtes</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-badge-success-accent)' }}>{readyOrders.filter(o => o.status === 'ready' || o.status === 'awaiting_pickup').length}</div>
                    </div>
                </div>

                {caisseMode === 'commande' && <>{/* 3.1 COMMANDES PRÊTES */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingBag size={18} color="#C4836A" /> Prêtes à encaisser
                </h2>
                {readyOrders.filter(o => o.status === 'ready' || o.status === 'awaiting_pickup').length === 0 ? (
                    <div style={{ background: 'white', padding: '32px', borderRadius: '16px', textAlign: 'center', color: '#9C8070', border: '1px solid var(--color-caisse-border)', marginBottom: '32px' }}>
                        <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                        <p>Aucune commande prête en attente.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '32px' }}>
                        {readyOrders.filter(o => o.status === 'ready' || o.status === 'awaiting_pickup').map(order => {
                            const isUrgent = order.priority === 'urgent'
                            const date = new Date(order.pickup_date)
                            return (
                                <button key={order.id} onClick={() => chargerCommande(order)}
                                    style={{
                                        background: 'white', padding: '16px', borderRadius: '16px',
                                        border: '1px solid var(--color-caisse-border)', borderLeft: isUrgent ? '4px solid #F59E0B' : '1px solid #FDE8DB',
                                        textAlign: 'left', cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s'
                                    }}
                                    className="card-clickable"
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                                            <span style={{ fontWeight: 700, color: '#2D1B0E', fontSize: '1.05rem' }}>{order.customer_name}</span>
                                            {order.customer_id && (
                                                <span title="Client CRM identifié" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'var(--color-badge-crm-bg)', color: 'var(--color-badge-crm-text)', borderRadius: '99px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                    <BadgeCheck size={11} /> CRM
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#C4836A', flexShrink: 0 }}>
                                            {!isNaN(date.getTime()) ? format(date, 'HH:mm') : '--:--'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#9C8070', marginBottom: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {order.order_items.map((i: any) => i.products?.name).join(' · ')}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-caisse-bg)', paddingTop: '12px' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#9C8070' }}>Reste à payer</span>
                                        <span style={{ fontWeight: 800, color: 'var(--color-caisse-accent)' }}>{Number(order.balance).toLocaleString('fr-FR')} {currency}</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* 3.2 PIPELINE DU JOUR */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                    <Clock size={18} color="var(--color-muted)" /> Pipeline du jour
                </h2>
                {readyOrders.filter(o => ['pending', 'production', 'confirmed', 'in_preparation'].includes(o.status)).length === 0 ? (
                    <div style={{ background: 'white', padding: '16px', borderRadius: '16px', textAlign: 'center', color: 'var(--color-muted)', border: '1px solid #E5E7EB', marginBottom: '32px', fontSize: '0.9rem' }}>
                        Aucune commande en cours de production.
                    </div>
                ) : (
                    <div className="pipeline-carousel" style={{ display: 'flex', gap: '12px', marginBottom: '32px', overflowX: 'auto', paddingBottom: '8px', scrollSnapType: 'x mandatory' }}>
                        {readyOrders.filter(o => ['pending', 'production', 'confirmed', 'in_preparation'].includes(o.status)).map(order => {
                            const date = new Date(order.pickup_date)
                            return (
                                <div key={order.id}
                                    style={{
                                        background: '#F9FAFB', padding: '12px', borderRadius: '12px',
                                        border: '1px dashed #E5E7EB', opacity: 0.8,
                                        display: 'flex', flexDirection: 'column', gap: '6px',
                                        minWidth: '200px', flex: '0 0 auto', scrollSnapAlign: 'start'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.85rem' }}>{order.customer_name}</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)' }}>
                                            {!isNaN(date.getTime()) ? format(date, 'HH:mm') : '--:--'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '4px' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                                            {order.order_items.map((i: any) => i.products?.name).join(' · ')}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: (order.status === 'pending' || order.status === 'confirmed') ? 'var(--color-badge-warning-bg)' : 'var(--color-badge-production-bg)', color: (order.status === 'pending' || order.status === 'confirmed') ? 'var(--color-badge-warning-text)' : 'var(--color-badge-production-text)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: (order.status === 'pending' || order.status === 'confirmed') ? 'var(--color-badge-warning-accent)' : 'var(--color-badge-crm-text)' }} />
                                            {(order.status === 'pending' || order.status === 'confirmed') ? 'En attente' : 'En préparation'}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                </>}

                {caisseMode === 'vitrine' && <>{/* 4. VENTE VITRINE */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Store size={18} color="#C4836A" /> Vente Rapide — Best-Sellers
                </h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    {bestSellers.map(bs => (
                        <button key={bs.id} onClick={() => addToCart(bs)}
                            style={{
                                background: 'white', padding: '12px', borderRadius: '16px', border: '1px solid var(--color-caisse-border)',
                                textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center'
                            }}
                            className="card-clickable"
                        >
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#FEF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                                <Box size={20} color="var(--color-caisse-accent)" />
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

                </>}

                {/* 5. HISTORIQUE */}
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} color="#C4836A" /> Historique récent
                </h2>
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid var(--color-caisse-border)', overflow: 'hidden' }}>
                    {initialHistory.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#9C8070', fontSize: '0.85rem' }}>Aucune transaction aujourd'hui</div>
                    ) : (
                        initialHistory.map((t, i) => {
                            const hasMultiPayments = t.payments && t.payments.length > 1;

                            if (hasMultiPayments) {
                                // Tri chronologique des paiements (du plus ancien au plus récent)
                                const sortedPayments = [...t.payments].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                                const totalEncaisse = sortedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

                                return (
                                    <div key={t.id} style={{ padding: '16px', borderBottom: i < initialHistory.length - 1 ? '1px solid var(--color-caisse-bg)' : 'none' }}>
                                        {/* En-tête de la commande (Famille) */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                {t.has_crm && (
                                                    <div title="Client CRM identifié" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-badge-crm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <UserCheck size={14} color="var(--color-badge-crm-text)" />
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#2D1B0E', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span>{t.client_name}</span>
                                                        {t.order_number && (
                                                            <span style={{ color: '#C4836A', fontSize: '0.8rem', fontWeight: 700, background: '#FEF3EC', padding: '1px 6px', borderRadius: '4px' }}>
                                                                #{t.order_number}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#9C8070', marginTop: '2px' }}>
                                                        Commande · {t.nb_items} article{t.nb_items > 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Montant total cumulé de la transaction (acompte + solde) */}
                                            <div style={{ fontWeight: 800, color: '#2D1B0E', fontSize: '1.05rem' }}>
                                                {totalEncaisse.toLocaleString('fr-FR')} {currency}
                                            </div>
                                        </div>

                                        {/* Liste des paiements indentés vers la droite */}
                                        <div style={{ 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            gap: '6px', 
                                            paddingLeft: '16px', 
                                            borderLeft: '2px solid var(--color-caisse-border)', 
                                            marginLeft: t.has_crm ? '13px' : '6px', 
                                            marginTop: '6px' 
                                        }}>
                                            {sortedPayments.map((p) => (
                                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#9C8070', fontWeight: 600 }}>
                                                            {(() => {
                                                                const date = new Date(p.created_at);
                                                                return !isNaN(date.getTime()) ? format(date, 'HH:mm') : '--:--';
                                                            })()}
                                                        </span>
                                                        
                                                        {p.label_type === 'ACOMPTE' && (
                                                            <span style={{ background: 'var(--color-badge-warning-bg)', color: 'var(--color-badge-warning-accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                                                                Acompte
                                                            </span>
                                                        )}
                                                        {p.label_type === 'SOLDE' && (
                                                            <span style={{ background: 'var(--color-badge-success-bg)', color: 'var(--color-badge-success-accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                                                                Solde
                                                            </span>
                                                        )}

                                                        <span style={{ fontSize: '0.75rem', color: '#9C8070' }}>
                                                            · {p.payment_method}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontWeight: 700, color: p.label_type === 'SOLDE' ? '#10B981' : '#2D1B0E', fontSize: '0.85rem' }}>
                                                        {Number(p.amount).toLocaleString('fr-FR')} {currency}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            } else {
                                // Affichage classique s'il n'y a qu'un seul paiement (ou vente vitrine)
                                const p = t.payments && t.payments[0];
                                return (
                                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: i < initialHistory.length - 1 ? '1px solid var(--color-caisse-bg)' : 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {t.has_crm && (
                                                <div title="Client CRM identifié" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-badge-crm-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <UserCheck size={14} color="var(--color-badge-crm-text)" />
                                                </div>
                                            )}
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#2D1B0E', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span>{t.client_name}</span>
                                                    {t.order_number && (
                                                        <span style={{ color: '#C4836A', fontSize: '0.75rem', fontWeight: 700, background: '#FEF3EC', padding: '1px 6px', borderRadius: '4px' }}>
                                                            #{t.order_number}
                                                        </span>
                                                    )}
                                                    {p && p.label_type === 'ACOMPTE' && (
                                                        <span style={{ background: 'var(--color-badge-warning-bg)', color: 'var(--color-badge-warning-accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                                                            Acompte
                                                        </span>
                                                    )}
                                                    {p && p.label_type === 'SOLDE' && (
                                                        <span style={{ background: 'var(--color-badge-success-bg)', color: 'var(--color-badge-success-accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                                                            Solde
                                                        </span>
                                                    )}
                                                    {(!t.is_order) && (
                                                        <span style={{ background: '#F3F4F6', color: '#4B5563', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                                                            Vitrine
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#9C8070', marginTop: '4px' }}>
                                                    {(() => {
                                                        const date = new Date(t.created_at);
                                                        return !isNaN(date.getTime()) ? format(date, 'HH:mm') : '--:--';
                                                    })()} · {t.nb_items} article{t.nb_items > 1 ? 's' : ''} {p ? `· ${p.payment_method}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 700, color: (p && p.label_type === 'SOLDE') ? '#10B981' : '#2D1B0E' }}>
                                            {Number(p ? p.amount : 0).toLocaleString('fr-FR')} {currency}
                                        </div>
                                    </div>
                                );
                            }
                        })
                    )}
                </div>

            </div>

            {/* ====== COLONNE DROITE (Panier) ====== */}
            <div className="caisse-cart-column" style={{ background: 'white', borderLeft: '1.5px solid var(--color-caisse-border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                
                {/* Header Panier */}
                <div style={{ padding: '20px', borderBottom: '1px solid var(--color-caisse-border)', background: 'var(--color-caisse-well)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#2D1B0E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShoppingBag size={20} color="var(--color-caisse-accent)" /> Panier en cours
                        </h2>
                        {activeSession && <DashboardNewOrderButton organizationId={organizationId} currency={currency} isFloating={true} />}
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                        <CRMSelector
                            selectedCustomer={activeClient ? { id: activeCustomerId || '', name: activeClient } : null}
                            onCustomerSelected={(id, name, phone) => {
                                setActiveCustomerId(id)
                                setActiveClient(name)
                                setActiveClientPhone(phone ?? null)
                            }}
                            onClear={detachClient}
                        />
                    </div>
                </div>

                {/* Lignes Panier */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    {optimisticPanier.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9C8070', opacity: 0.6 }}>
                            <ShoppingBag size={48} style={{ marginBottom: '16px' }} />
                            <p style={{ fontWeight: 600 }}>Panier vide</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {optimisticPanier.map((line, idx) => (
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
                                        <CartQuantityButton 
                                            qty={line.qty} 
                                            productName={line.nom}
                                            onChange={(newQty) => {
                                                setPanier(prev => prev.map((item, i) => i === idx ? { ...item, qty: newQty } : item))
                                            }}
                                            onRemove={() => removeItem(idx)}
                                        />
                                        <div style={{ width: '80px', textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: '#2D1B0E' }}>
                                            {(line.qty * line.prix).toLocaleString('fr-FR')} {currency}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Panier */}
                <div style={{ padding: '20px', borderTop: '1px solid #FDE8DB', background: 'var(--color-caisse-well)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
                        <span>Sous-total</span>
                        <span style={{ fontWeight: 600, color: '#2D1B0E' }}>{sousTotal.toLocaleString('fr-FR')} {currency}</span>
                    </div>
                    {acompte > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-badge-success-accent)' }}>
                            <span>Acompte versé</span>
                            <span style={{ fontWeight: 600 }}>- {acompte.toLocaleString('fr-FR')} {currency}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '1.4rem', color: '#2D1B0E', fontWeight: 800, marginTop: '12px', paddingTop: '12px', borderTop: '1.5px dashed #E5E7EB' }}>
                        <span>À encaisser</span>
                        <span style={{ color: totalAEncaisser > 0 ? 'var(--color-caisse-accent)' : 'var(--color-badge-success-accent)' }}>{totalAEncaisser.toLocaleString('fr-FR')} {currency}</span>
                    </div>

                    {/* Modes de paiement — Ventilation (masqué si commande déjà soldée) */}
                    {totalAEncaisser > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#9C8070', marginBottom: '4px' }}>Répartition du paiement</div>

                        {/* Lignes de paiement existantes */}
                        {Object.entries(activePayments).map(([method, amount]) => {
                            const methodInfo = PAYMENT_METHODS.find(m => m.id === method)
                            if (!methodInfo) return null

                            return (
                                <div key={method} style={{
                                    background: 'white',
                                    padding: '12px',
                                    borderRadius: '16px',
                                    border: amount > 0 ? '1.5px solid var(--color-caisse-accent)' : '1.5px solid var(--color-border)',
                                    boxShadow: 'var(--shadow-sm)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    transition: 'all 0.2s ease'
                                }}>
                                    {/* Top Row: Method Selector & Delete Button */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <TouchSelect
                                                value={method}
                                                direction="up"
                                                options={PAYMENT_METHODS.map(m => ({
                                                    value: m.id,
                                                    label: m.label,
                                                    icon: m.id === 'Espèces' ? '💵' : '📱'
                                                }))}
                                                title="Mode de paiement"
                                                onChange={(newMethod) => {
                                                    setActivePayments(prev => {
                                                        const { [method]: val, ...rest } = prev
                                                        return { ...rest, [newMethod]: val }
                                                    })
                                                }}
                                                style={{
                                                    minHeight: '44px',
                                                    background: 'var(--color-well)',
                                                    border: '1.5px solid var(--color-border)',
                                                    borderRadius: '12px',
                                                    padding: '0 12px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 700
                                                }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActivePayments(prev => {
                                                    const { [method]: _, ...rest } = prev
                                                    return rest
                                                })
                                            }}
                                            aria-label={`Supprimer le mode de paiement ${methodInfo.label}`}
                                            style={{
                                                background: 'var(--color-badge-danger-bg)',
                                                border: 'none',
                                                color: 'var(--color-badge-danger-accent)',
                                                width: '44px',
                                                height: '44px',
                                                borderRadius: '12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                fontSize: '1.1rem',
                                                fontWeight: 800,
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                                            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {/* Bottom Row: Amount TouchInput & MAX Button */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <TouchInput
                                                value={amount.toString()}
                                                onChange={(val) => {
                                                    const v = Math.max(0, parseFloat(val) || 0)
                                                    setActivePayments(prev => ({ ...prev, [method]: v }))
                                                }}
                                                allowDecimal={true}
                                                placeholder="0"
                                                title={`Montant pour ${methodInfo.label}`}
                                                style={{
                                                    minHeight: '44px',
                                                    border: '1.5px solid var(--color-border)',
                                                    background: 'white',
                                                    fontSize: '1rem',
                                                    textAlign: 'right',
                                                    borderRadius: '12px',
                                                    paddingRight: '12px'
                                                }}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                const otherTotal = Object.entries(activePayments)
                                                    .filter(([key]) => key !== method)
                                                    .reduce((s, [_, v]) => s + v, 0)
                                                const needed = Math.max(0, totalAEncaisser - otherTotal)
                                                setActivePayments(prev => ({ ...prev, [method]: needed }))
                                            }}
                                            aria-label={`Attribuer le montant maximum restant pour ${methodInfo.label}`}
                                            style={{
                                                background: 'var(--color-badge-warning-bg)',
                                                border: 'none',
                                                color: 'var(--color-badge-warning-text)',
                                                padding: '0 16px',
                                                height: '44px',
                                                borderRadius: '12px',
                                                fontSize: '0.85rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.15s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                                            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                        >
                                            MAX
                                        </button>
                                    </div>
                                </div>
                            )
                        })}

                        {/* Bouton ajouter un mode de paiement */}
                        {Object.keys(activePayments).length < PAYMENT_METHODS.length && (
                            <button
                                onClick={() => {
                                    const usedMethods = Object.keys(activePayments)
                                    const availableMethod = PAYMENT_METHODS.find(m => !usedMethods.includes(m.id))
                                    if (availableMethod) {
                                        setActivePayments(prev => ({ ...prev, [availableMethod.id]: 0 }))
                                    }
                                }}
                                style={{
                                    padding: '12px',
                                    background: 'transparent',
                                    border: '2px dashed var(--color-primary-container)',
                                    borderRadius: '16px',
                                    color: 'var(--color-primary)',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    textAlign: 'center',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                + Ajouter un mode de paiement
                            </button>
                        )}
                    </div>}

                    {/* Reste à percevoir (Alerte si non soldé) */}
                    {resteAPercevoir > 0 && totalAEncaisser > 0 && (
                        <div style={{ marginBottom: '20px', padding: '12px', borderRadius: '12px', background: 'var(--color-badge-warning-bg)', color: 'var(--color-badge-warning-text)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Reste à percevoir :</span>
                            <span style={{ fontWeight: 800 }}>{resteAPercevoir.toLocaleString('fr-FR')} {currency}</span>
                        </div>
                    )}

                    {/* Monnaie à rendre — Apparaît seulement en cas de surplus */}
                    {monnaieARendre > 0 && (
                        <div style={{ 
                            marginBottom: '20px', background: 'var(--color-badge-success-soft-bg)', padding: '16px', borderRadius: '16px', 
                            border: '1.5px solid var(--color-badge-success-accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.1)'
                        }}>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-badge-success-text)' }}>Monnaie à rendre</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--color-badge-success-accent)' }}>
                                {monnaieARendre.toLocaleString('fr-FR')} {currency}
                            </div>
                        </div>
                    )}

                    {/* Rappel acompte pour commandes déjà soldées */}
                    {totalAEncaisser === 0 && acompte > 0 && (
                        <div style={{
                            marginBottom: '16px', padding: '14px 16px', borderRadius: '14px',
                            background: 'var(--color-badge-success-soft-bg)', border: '1.5px solid var(--color-badge-success-accent)',
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                            <Info size={18} color="var(--color-badge-success-accent)" style={{ flexShrink: 0 }} />
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-badge-success-text)' }}>Commande intégralement réglée</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-badge-success-accent)', marginTop: '2px' }}>
                                    Acompte versé à la prise : <strong>{acompte.toLocaleString('fr-FR')} {currency}</strong>
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
                        {isSubmitting ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                <Loader2 className="animate-spin" size={24} />
                                <span>Paiement en cours…</span>
                            </div>
                        ) : totalAEncaisser === 0
                            ? 'Confirmer la remise'
                            : `Encaisser ${totalAEncaisser.toLocaleString('fr-FR')} ${currency}`
                        }
                    </button>
                    {optimisticPanier.length > 0 && (
                        <button onClick={viderPanier} className="btn-secondary" style={{ width: '100%', color: '#9C8070' }}>
                            Vider le panier
                        </button>
                    )}
                </div>
            </div>

                </>
            )}

            {/* Modal Catalogue Completely external to layout */}
            <CatalogueModal 
                open={modalCatalogueOpen} 
                onClose={() => setModalCatalogueOpen(false)}
                onAddToCart={addToCart}
                organizationId={organizationId}
                currency={currency}
            />

            {renderFeedback()}

            <style>{`
                .caisse-layout-container {
                    flex-direction: row;
                }
                .pipeline-carousel::-webkit-scrollbar {
                    display: none;
                }
                .pipeline-carousel {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .metrics-container::-webkit-scrollbar {
                    display: none;
                }
                .metrics-container {
                    -ms-overflow-style: none;  /* IE and Edge */
                    scrollbar-width: none;  /* Firefox */
                }
                .caisse-main-column {
                    flex: 1;
                }
                .caisse-cart-column {
                    width: 380px;
                }

                @media (min-width: 901px) {
                    /* Laisser le navigateur calculer la hauteur de main via son flex: 1 inline */
                    main:has(.caisse-layout-container) {
                        overflow-y: hidden !important;
                        padding: 16px !important;
                        display: flex !important;
                        flex-direction: column !important;
                        height: auto !important; /* Évite le conflit de hauteur */
                    }

                    /* Forcer les wrappers de SessionMaster à s'étendre verticalement sans dépasser */
                    main:has(.caisse-layout-container) > div {
                        flex: 1 !important;
                        height: 100% !important;
                        display: flex !important;
                        flex-direction: column !important;
                        min-height: 0 !important;
                    }

                    main:has(.caisse-layout-container) > div > div {
                        flex: 1 !important;
                        height: 100% !important;
                        display: flex !important;
                        flex-direction: column !important;
                        min-height: 0 !important;
                    }

                    .caisse-layout-container {
                        height: 100% !important;
                        min-height: 0 !important;
                        flex: 1 !important;
                    }

                    /* Bloc 2 : Faire défiler uniquement le bloc central */
                    .caisse-main-column {
                        height: 100% !important;
                        overflow-y: auto !important;
                        min-height: 0 !important;
                        display: flex !important;
                        flex-direction: column !important;
                    }

                    /* Empêcher Flexbox de compresser verticalement les cartes de la colonne centrale */
                    .caisse-main-column > * {
                        flex-shrink: 0 !important;
                    }

                    /* Bloc 3 : Colonne panier figée */
                    .caisse-cart-column {
                        height: 100% !important;
                        min-height: 0 !important;
                        display: flex !important;
                        flex-direction: column !important;
                    }

                    /* Figer le header et le footer du panier, et ne laisser scroller que les articles */
                    .caisse-cart-column > div:first-child,
                    .caisse-cart-column > div:last-child {
                        flex-shrink: 0 !important;
                    }
                    .caisse-cart-column > div:nth-child(2) {
                        flex-shrink: 1 !important;
                        min-height: 0 !important;
                    }
                }
                
                @media (max-width: 900px) {
                    .caisse-layout-container {
                        flex-direction: column !important;
                        overflow-y: auto !important;
                    }
                    .caisse-main-column {
                        flex: none !important;
                        overflow-y: visible !important;
                    }
                    .caisse-cart-column {
                        width: 100% !important;
                        border-left: none !important;
                        border-top: 1.5px solid var(--color-caisse-border) !important;
                        padding-bottom: 80px !important;
                    }
                }
            `}</style>
        </div>
    )
}
