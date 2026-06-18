'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useActionFeedback } from '@/hooks/useActionFeedback'
import { ShoppingBag, Plus, Trash2, AlertTriangle, Wallet, Loader2, BadgeCheck, CheckCircle2, Search, SlidersHorizontal, X, Eye } from 'lucide-react'
import { updateOrderStatus, deleteOrder, getHistoricalOrders } from '@/lib/actions/orders'
import NewOrderModal from './NewOrderModal'
import OrderDrawer from './OrderDrawer'
import HistoricalImportModal from './HistoricalImportModal'
import DatePicker from '@/components/ui/DatePicker'
import SessionPill from '@/components/layout/SessionPill'

interface Product { id: string; name: string; selling_price: number; current_stock: number | null }
interface OrderItem { id: string; order_id: string; product_id: string | null; quantity: number; unit_price: number; created_at: string | null; products: { name: string } | null }
export interface OrderWithItems {
    id: string
    organization_id: string
    order_number: string | null
    customer_name: string
    customer_contact: string | null
    customer_id: string | null
    pickup_date: string
    status: string
    priority: string | null
    payment_status: string | null
    total_amount: number
    deposit_amount: number
    custom_image_url: string | null
    customization_notes: string | null
    created_by: string | null
    created_at: string | null
    order_items: OrderItem[]
    creator_profile?: {
        full_name: string
        role_slug: string
    } | null
}

const STATUS_LABELS: Record<string, { label: string; next: string; color: string; bg: string; text: string }> = {
    pending: { label: '⏳ En attente', next: 'production', color: '#FEF3C7', bg: '#FEF3C7', text: '#92400E' },
    production: { label: '👨‍🍳 En production', next: 'ready', color: '#DBEAFE', bg: '#DBEAFE', text: '#1E40AF' },
    ready: { label: '✅ Prête', next: 'completed', color: '#D1FAE5', bg: '#D1FAE5', text: '#065F46' },
    completed: { label: '✔ Livré / Retiré', next: 'completed', color: '#F3F4F6', bg: '#F3F4F6', text: '#374151' },
    cancelled: { label: '✖ Annulée', next: 'cancelled', color: '#FEE2E2', bg: '#FEE2E2', text: '#991B1B' },
}

const ACTIVE_STATUSES = ['pending', 'production', 'ready']

function formatPickupDate(date: Date): string {
    if (isNaN(date.getTime())) return 'Non définie'
    const day = date.getDate()
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
    const month = months[date.getMonth()]
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${day} ${month} à ${hours}:${minutes}`
}

export default function OrdersClient({
    orders,
    products,
    currency,
    organizationId,
    roleSlug,
    canImportHistory = false,
    isSessionOpen = false
}: {
    orders: OrderWithItems[];
    products: Product[];
    currency: string;
    organizationId: string;
    roleSlug: string;
    canImportHistory?: boolean;
    isSessionOpen?: boolean;
}) {
    const router = useRouter()

    // --- États Communs ---
    const [activeTab, setActiveTab] = useState<'todo' | 'history'>('todo')
    const [showModal, setShowModal] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const { isPending, renderFeedback } = useActionFeedback()
    const [orderToDelete, setOrderToDelete] = useState<{id: string, name: string} | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
    const [search, setSearch] = useState('')

    // --- États Commandes actives ("À traiter") ---
    const [localOrders, setLocalOrders] = useState(orders)
    const [paymentFilter, setPaymentFilter] = useState('all')
    const [pickupToday, setPickupToday] = useState(false)
    const [createdToday, setCreatedToday] = useState(false)

    // Synchronisation des commandes actives reçues du serveur
    useEffect(() => {
        setLocalOrders(orders)
    }, [orders])

    // --- États Historique (Server-Side) ---
    const [historyOrders, setHistoryOrders] = useState<OrderWithItems[]>([])
    const [historyCount, setHistoryCount] = useState(0)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyHasMore, setHistoryHasMore] = useState(false)
    const [historyPage, setHistoryPage] = useState(1)

    // Filtres Historique
    const [histPeriod, setHistPeriod] = useState<'today' | 'week' | 'month' | 'custom' | 'all'>('month')
    const [histStartDate, setHistStartDate] = useState('')
    const [histEndDate, setHistEndDate] = useState('')
    const [histStatus, setHistStatus] = useState<string>('all')
    const [histPaymentStatus, setHistPaymentStatus] = useState<'all' | 'solded' | 'deposit' | 'unpaid'>('all')
    const [histPaymentMethod, setHistPaymentMethod] = useState<string>('')
    const [histAmount, setHistAmount] = useState<string>('')
    
    // États pour le Drawer de filtres tactiles et les sous-modales tactiles
    const [showFiltersDrawer, setShowFiltersDrawer] = useState(false)
    const [showNumpad, setShowNumpad] = useState(false)

    // --- États Recherche Universelle ---
    const [searchHistoryOrders, setSearchHistoryOrders] = useState<OrderWithItems[]>([])
    const [searchHistoryLoading, setSearchHistoryLoading] = useState(false)

    const isSearching = search.trim().length >= 2

    // --- Logique de Recherche Universelle dans l'Historique (Debounced) ---
    useEffect(() => {
        if (!isSearching) {
            setSearchHistoryOrders([])
            return
        }

        const timer = setTimeout(async () => {
            setSearchHistoryLoading(true)
            try {
                const result = await getHistoricalOrders({
                    page: 1,
                    pageSize: 30,
                    searchQuery: search
                })
                if ('orders' in result && result.orders) {
                    setSearchHistoryOrders(result.orders as unknown as OrderWithItems[])
                }
            } catch (err) {
                console.error("Erreur recherche historique:", err)
            } finally {
                setSearchHistoryLoading(false)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [search, isSearching])

    // --- Chargement de l'Historique ---
    const loadHistory = async (page: number, replace = false) => {
        setHistoryLoading(true)
        try {
            const amountNum = histAmount.trim() !== '' ? Number(histAmount) : undefined
            const result = await getHistoricalOrders({
                page,
                pageSize: 20,
                period: histPeriod,
                startDate: histStartDate || undefined,
                endDate: histEndDate || undefined,
                status: histStatus,
                paymentStatus: histPaymentStatus,
                paymentMethod: histPaymentMethod || undefined,
                amount: amountNum
            })

            if ('error' in result && result.error) {
                toast.error(result.error)
                return
            }

            if ('orders' in result && result.orders) {
                const fetchedOrders = result.orders as unknown as OrderWithItems[]
                if (replace) {
                    setHistoryOrders(fetchedOrders)
                } else {
                    setHistoryOrders(prev => {
                        const existingIds = new Set(prev.map(o => o.id))
                        const uniqueNew = fetchedOrders.filter(o => !existingIds.has(o.id))
                        return [...prev, ...uniqueNew]
                    })
                }
                setHistoryCount(result.count || 0)
                setHistoryHasMore(!!result.hasMore)
                setHistoryPage(page)
            }
        } catch (err) {
            toast.error("Impossible de charger l'historique")
            console.error(err)
        } finally {
            setHistoryLoading(false)
        }
    }

    // Déclencheur de rechargement de l'historique quand les filtres changent (hors recherche)
    useEffect(() => {
        if (activeTab === 'history' && !isSearching) {
            loadHistory(1, true)
        }
    }, [activeTab, histPeriod, histStartDate, histEndDate, histStatus, histPaymentStatus, histPaymentMethod, histAmount, isSearching])

    // --- Filtrage Local "À traiter" ---
    const filteredTodo = useMemo(() => {
        let result = localOrders

        // Filtre paiement
        if (paymentFilter === 'solde') result = result.filter(o => o.payment_status === 'SOLDEE')
        else if (paymentFilter === 'acompte') result = result.filter(o => o.payment_status === 'PARTIEL')
        else if (paymentFilter === 'crm') result = result.filter(o => !!o.customer_id)

        // Filtre Retraits du Jour
        if (pickupToday) {
            const todayStr = new Date().toDateString()
            result = result.filter(o => {
                const d = new Date(o.pickup_date)
                return !isNaN(d.getTime()) && d.toDateString() === todayStr
            })
        }

        // Filtre Créées ce Jour
        if (createdToday) {
            const todayStr = new Date().toDateString()
            result = result.filter(o => {
                if (!o.created_at) return false
                const d = new Date(o.created_at)
                return !isNaN(d.getTime()) && d.toDateString() === todayStr
            })
        }

        // Recherche locale sur les commandes à traiter
        if (isSearching) {
            const q = search.toLowerCase()
            result = result.filter(o => 
                o.customer_name.toLowerCase().includes(q) ||
                (o.customer_contact && o.customer_contact.toLowerCase().includes(q)) ||
                (o.order_number && o.order_number.toLowerCase().includes(q))
            )
        }

        return result
    }, [localOrders, paymentFilter, pickupToday, createdToday, search, isSearching])

    // Compteurs pour les badges d'onglets
    const counts = useMemo(() => {
        return {
            todo: localOrders.length,
            history: historyCount
        }
    }, [localOrders, historyCount])

    // --- Actions ───
    async function handleStatusChange(orderId: string, nextStatus: string) {
        // MAJ Optimiste Zéro Latence
        const previousLocalOrders = localOrders
        const previousHistoryOrders = historyOrders
        const previousSelectedOrder = selectedOrder

        setLocalOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o))
        setHistoryOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o))
        
        if (selectedOrder && selectedOrder.id === orderId) {
            setSelectedOrder(prev => prev ? { ...prev, status: nextStatus } : null)
        }

        const updatePromise = async () => {
            const result = await updateOrderStatus(orderId, nextStatus)
            if (result && typeof result === 'object' && 'error' in result && result.error) {
                throw new Error(String(result.error))
            }
            return result
        }

        toast.promise(updatePromise(), {
            loading: 'Mise à jour du statut...',
            success: () => {
                router.refresh()
                if (nextStatus === 'completed' || nextStatus === 'cancelled') {
                    if (activeTab === 'history') {
                        loadHistory(1, true)
                    }
                }
                return 'Statut mis à jour !'
            },
            error: (err) => {
                // Annulation de la MAJ optimiste en cas d'erreur
                setLocalOrders(previousLocalOrders)
                setHistoryOrders(previousHistoryOrders)
                setSelectedOrder(previousSelectedOrder)
                router.refresh()
                return err instanceof Error ? err.message : 'Une erreur est survenue.'
            }
        })
    }

    const handleDelete = async () => {
        if (!orderToDelete) return
        
        const { id } = orderToDelete
        setDeletingId(id)
        setOrderToDelete(null)
        
        const deletePromise = async () => {
            const result = await deleteOrder(id)
            if (result && typeof result === 'object' && 'error' in result && result.error) {
                throw new Error(String(result.error))
            }
            return result
        }

        toast.promise(deletePromise(), {
            loading: 'Suppression de la commande...',
            success: () => {
                setLocalOrders(prev => prev.filter(o => o.id !== id))
                setHistoryOrders(prev => prev.filter(o => o.id !== id))
                router.refresh()
                setDeletingId(null)
                return 'Commande supprimée'
            },
            error: (err) => {
                setDeletingId(null)
                router.refresh()
                return err instanceof Error ? err.message : 'Une erreur est survenue.'
            }
        })
    }

    const handleOrderUpdate = (updatedOrder: { id: string } & Record<string, unknown>) => {
        const patch = updatedOrder as Partial<OrderWithItems> & { id: string }
        setLocalOrders(prev => prev.map(o => o.id === patch.id ? { ...o, ...patch } : o))
        setHistoryOrders(prev => prev.map(o => o.id === patch.id ? { ...o, ...patch } : o))
        if (selectedOrder && selectedOrder.id === patch.id) {
            setSelectedOrder(prev => prev ? { ...prev, ...patch } : null)
        }
    }



    // --- Logique du Pavé Numérique Tactile (Numpad) ---
    const handleNumpadPress = (val: string) => {
        if (val === 'C') {
            setHistAmount('')
        } else if (val === '⌫') {
            setHistAmount(prev => prev.slice(0, -1))
        } else {
            // Empêcher de mettre plusieurs zéros au début
            if (histAmount === '0' && val === '0') return
            setHistAmount(prev => (prev === '0' ? val : prev + val))
        }
    }

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {renderFeedback()}
            
            {/* --- HEADER --- */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        Commandes
                    </h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {isSearching ? (
                            `Recherche universelle : ${filteredTodo.length} actives, ${searchHistoryOrders.length} passées`
                        ) : activeTab === 'todo' ? (
                            `${filteredTodo.length} commande${filteredTodo.length > 1 ? 's' : ''} à traiter`
                        ) : (
                            `${historyCount} commande${historyCount > 1 ? 's' : ''} dans l'historique`
                        )}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <SessionPill />
                    {(roleSlug === 'gerant' || roleSlug === 'super_admin' || canImportHistory) && (
                        <button onClick={() => setShowImportModal(true)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '40px', fontSize: '0.85rem', padding: '0 16px' }}>
                            📥 Saisie Historique
                        </button>
                    )}
                    <button onClick={() => setShowModal(true)} className="btn-primary" style={{ minHeight: '40px', padding: '0 20px', fontSize: '0.85rem' }}>
                        <Plus size={16} /> Nouvelle commande
                    </button>
                </div>
            </div>

            {/* --- RECHERCHE GLOBALE --- */}
            <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, paddingLeft: '16px', display: 'flex', alignItems: 'center', pointerEvents: 'none', height: '100%' }}>
                    <Search size={18} color="var(--color-muted)" />
                </div>
                <input
                    type="text"
                    placeholder="Recherche universelle (Nom client, téléphone, n° commande...)"
                    style={{
                        width: '100%',
                        padding: '14px 16px 14px 48px',
                        borderRadius: '9999px',
                        border: '1.5px solid var(--color-border)',
                        background: 'var(--color-well)',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        outline: 'none',
                        transition: 'all 0.2s'
                    }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <X size={18} color="var(--color-muted)" />
                    </button>
                )}
            </div>

            {/* --- RECHERCHE ACTIVER VUE DOUBLE --- */}
            {isSearching ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Section Actives */}
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '12px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            ⚡ Commandes actives ({filteredTodo.length})
                        </h2>
                        {filteredTodo.length === 0 ? (
                            <div className="card" style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--color-muted)' }}>
                                Aucun résultat actif pour &ldquo;{search}&rdquo;
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                {filteredTodo.map(order => renderActiveCard(order))}
                            </div>
                        )}
                    </div>

                    {/* Section Historique */}
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '12px', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📜 Historique des commandes ({searchHistoryOrders.length})
                            {searchHistoryLoading && <Loader2 size={16} className="animate-spin" />}
                        </h2>
                        {searchHistoryLoading && searchHistoryOrders.length === 0 ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                                <Loader2 size={32} className="animate-spin" color="var(--color-secondary)" />
                            </div>
                        ) : searchHistoryOrders.length === 0 ? (
                            <div className="card" style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--color-muted)' }}>
                                Aucun résultat dans l&apos;historique pour &ldquo;{search}&rdquo;
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {renderHistoryHeader()}
                                {searchHistoryOrders.map(order => renderHistoryRow(order))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* --- MODE ONGLETS STANDARD --- */
                <>
                    {/* Switcher d'onglets Workbench */}
                    <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', gap: '16px' }}>
                        <button
                            onClick={() => setActiveTab('todo')}
                            style={{
                                padding: '12px 16px',
                                fontSize: '1rem',
                                fontWeight: 700,
                                border: 'none',
                                background: 'transparent',
                                borderBottom: activeTab === 'todo' ? '3px solid var(--color-primary)' : '3px solid transparent',
                                color: activeTab === 'todo' ? 'var(--color-primary)' : 'var(--color-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            ⚡ À traiter
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: activeTab === 'todo' ? 'var(--color-primary)' : 'var(--color-surface-variant)', color: activeTab === 'todo' ? 'white' : 'var(--color-text)', fontWeight: 800 }}>
                                {counts.todo}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            style={{
                                padding: '12px 16px',
                                fontSize: '1rem',
                                fontWeight: 700,
                                border: 'none',
                                background: 'transparent',
                                borderBottom: activeTab === 'history' ? '3px solid var(--color-secondary)' : '3px solid transparent',
                                color: activeTab === 'history' ? 'var(--color-secondary)' : 'var(--color-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            📜 Historique
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: activeTab === 'history' ? 'var(--color-secondary)' : 'var(--color-surface-variant)', color: activeTab === 'history' ? 'white' : 'var(--color-text)', fontWeight: 800 }}>
                                {counts.history}
                            </span>
                        </button>
                    </div>

                    {/* --- CONTENU DE L'ONGLET SÉLECTIONNÉ --- */}
                    {activeTab === 'todo' ? (
                        /* --- VUE À TRAITER (GRILLE D'ACTION) --- */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Filtres rapides à traiter */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {[
                                    { id: 'all', label: 'Tous paiements' },
                                    { id: 'solde', label: '✓ Soldé' },
                                    { id: 'acompte', label: '💳 Acompte restant' },
                                    { id: 'crm', label: '🎯 Clients CRM' },
                                ].map(f => (
                                    <button key={f.id}
                                        onClick={() => setPaymentFilter(f.id)}
                                        style={{
                                            padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '99px',
                                            border: paymentFilter === f.id ? 'none' : '1.5px solid var(--color-border)',
                                            background: paymentFilter === f.id ? 'var(--color-primary)' : 'transparent',
                                            color: paymentFilter === f.id ? 'white' : 'var(--color-muted)',
                                            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                ))}

                                <div style={{ width: '1.5px', height: '16px', background: 'var(--color-border)', margin: '0 4px' }} />

                                <button
                                    onClick={() => setPickupToday(!pickupToday)}
                                    style={{
                                        padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '99px',
                                        border: pickupToday ? 'none' : '1.5px solid var(--color-border)',
                                        background: pickupToday ? 'var(--color-secondary)' : 'transparent',
                                        color: pickupToday ? 'white' : 'var(--color-muted)',
                                        cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
                                    }}
                                >
                                    📅 Retraits du Jour
                                </button>
                                <button
                                    onClick={() => setCreatedToday(!createdToday)}
                                    style={{
                                        padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '99px',
                                        border: createdToday ? 'none' : '1.5px solid var(--color-border)',
                                        background: createdToday ? 'var(--color-secondary)' : 'transparent',
                                        color: createdToday ? 'white' : 'var(--color-muted)',
                                        cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
                                    }}
                                >
                                    📝 Créées ce Jour
                                </button>
                            </div>

                            {/* Grille de commandes à traiter */}
                            {filteredTodo.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                                    <ShoppingBag size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucune commande à traiter</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                    {filteredTodo.map(order => renderActiveCard(order))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* --- VUE HISTORIQUE --- */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            
                            {/* Barre de filtres rapides d'Historique + Bouton d'ouverture du Drawer Tactile */}
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-well)', padding: '12px 16px', borderRadius: '16px', border: '1.5px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {/* Raccourcis de période rapides */}
                                    <div style={{ display: 'flex', gap: '4px', background: 'white', padding: '4px', borderRadius: '99px', border: '1.5px solid var(--color-border)' }}>
                                        {[
                                            { id: 'today', label: 'Aujourd\'hui' },
                                            { id: 'week', label: 'Semaine' },
                                            { id: 'month', label: 'Mois' },
                                            { id: 'all', label: 'Tout' }
                                        ].map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => setHistPeriod(p.id as 'today' | 'week' | 'month' | 'all')}
                                                style={{
                                                    padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '99px',
                                                    border: 'none', background: histPeriod === p.id ? 'var(--color-secondary)' : 'transparent',
                                                    color: histPeriod === p.id ? 'white' : 'var(--color-muted)', cursor: 'pointer', transition: 'all 0.15s'
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => {
                                                setHistPeriod('custom')
                                                setShowFiltersDrawer(true)
                                            }}
                                            style={{
                                                padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '99px',
                                                border: 'none', background: histPeriod === 'custom' ? 'var(--color-secondary)' : 'transparent',
                                                color: histPeriod === 'custom' ? 'white' : 'var(--color-muted)', cursor: 'pointer', transition: 'all 0.15s'
                                            }}
                                        >
                                            Période... {histStartDate && `(${histStartDate})`}
                                        </button>
                                    </div>

                                    {/* Statut rapide */}
                                    <div style={{ display: 'flex', gap: '4px', background: 'white', padding: '4px', borderRadius: '99px', border: '1.5px solid var(--color-border)' }}>
                                        {[
                                            { id: 'all', label: 'Tous statuts' },
                                            { id: 'completed', label: 'Livré / Retiré' },
                                            { id: 'cancelled', label: 'Annulée' }
                                        ].map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => setHistStatus(s.id)}
                                                style={{
                                                    padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '99px',
                                                    border: 'none', background: histStatus === s.id ? 'var(--color-secondary)' : 'transparent',
                                                    color: histStatus === s.id ? 'white' : 'var(--color-muted)', cursor: 'pointer', transition: 'all 0.15s'
                                                }}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Bouton tactile Filtres Avancés */}
                                <button
                                    onClick={() => setShowFiltersDrawer(true)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '99px',
                                        border: '1.5px solid var(--color-border)', background: 'white',
                                        color: 'var(--color-text)',
                                        fontSize: '0.85rem', fontWeight: 750, cursor: 'pointer', transition: 'all 0.15s',
                                        boxShadow: 'var(--shadow-sm)', height: '40px'
                                    }}
                                >
                                    <SlidersHorizontal size={15} color="var(--color-secondary)" />
                                    Filtres avancés
                                    {(histPaymentStatus !== 'all' || histPaymentMethod !== '' || histAmount !== '' || histPeriod === 'custom') && (
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)' }} />
                                    )}
                                </button>
                            </div>

                            {/* Liste de l'Historique */}
                            {historyLoading && historyOrders.length === 0 ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                                    <Loader2 size={40} className="animate-spin" color="var(--color-secondary)" />
                                </div>
                            ) : historyOrders.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                                    <ShoppingBag size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucune commande dans l&apos;historique</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {renderHistoryHeader()}
                                    {historyOrders.map(order => renderHistoryRow(order))}

                                    {/* Charger Plus */}
                                    {historyHasMore && (
                                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                                            <button
                                                onClick={() => loadHistory(historyPage + 1)}
                                                disabled={historyLoading}
                                                className="btn-secondary"
                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 32px' }}
                                            >
                                                {historyLoading ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        Chargement...
                                                    </>
                                                ) : (
                                                    'Charger plus de commandes'
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* --- DRAWER TACTILE DE FILTRES AVANCÉS --- */}
            {showFiltersDrawer && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', justifyContent: 'flex-end' }}>
                    {/* Fond sombre translucide */}
                    <div 
                        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(45,27,14,0.5)', backdropFilter: 'blur(4px)', transition: 'opacity 0.2s' }} 
                        onClick={() => setShowFiltersDrawer(false)}
                    />
                    
                    {/* Conteneur Drawer coulissant */}
                    <div className="animate-slide-in-right" style={{
                        position: 'relative', width: '100%', maxWidth: '460px', height: '100%', background: 'white',
                        boxShadow: '-10px 0 30px rgba(45,27,14,0.15)', display: 'flex', flexDirection: 'column',
                        justifyContent: 'space-between', padding: '24px 20px', zIndex: 120
                    }}>
                        {/* En-tête du Drawer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <SlidersHorizontal size={20} color="var(--color-primary)" />
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>Filtres de recherche</h3>
                            </div>
                            <button
                                onClick={() => setShowFiltersDrawer(false)}
                                style={{
                                    width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'var(--color-well)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                }}
                            >
                                <X size={20} color="var(--color-muted)" />
                            </button>
                        </div>

                        {/* Corps du Drawer avec défilement */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            
                            {/* Période (Chips tactiles) */}
                            <div>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Période</h4>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'today', label: 'Aujourd\'hui' },
                                        { id: 'week', label: 'Cette semaine' },
                                        { id: 'month', label: 'Ce mois' },
                                        { id: 'custom', label: 'Date personnalisée' },
                                        { id: 'all', label: 'Tout' }
                                    ].map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setHistPeriod(p.id as 'today' | 'week' | 'month' | 'custom' | 'all')}
                                            style={{
                                                padding: '10px 18px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 700,
                                                cursor: 'pointer', border: histPeriod === p.id ? '2px solid var(--color-secondary)' : '1.5px solid var(--color-border)',
                                                background: histPeriod === p.id ? 'var(--color-secondary-container)' : 'white',
                                                color: histPeriod === p.id ? 'var(--color-secondary)' : 'var(--color-text)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Calendrier tactile (DatePicker) si Période personnalisée sélectionnée */}
                            {histPeriod === 'custom' && (
                                <div style={{ background: 'var(--color-well)', padding: '16px', borderRadius: '16px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: 'var(--color-muted)', marginBottom: '4px' }}>Date de début</label>
                                            <DatePicker
                                                value={histStartDate ? new Date(histStartDate) : null}
                                                onChange={(d) => setHistStartDate(d.toISOString().split('T')[0])}
                                                placeholder="Début..."
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 800, color: 'var(--color-muted)', marginBottom: '4px' }}>Date de fin</label>
                                            <DatePicker
                                                value={histEndDate ? new Date(histEndDate) : null}
                                                onChange={(d) => setHistEndDate(d.toISOString().split('T')[0])}
                                                placeholder="Fin..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Statut de commande (Chips tactiles) */}
                            <div>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Statut de commande</h4>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'all', label: 'Tous les statuts' },
                                        { id: 'completed', label: 'Livré / Retiré' },
                                        { id: 'cancelled', label: 'Annulée' }
                                    ].map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setHistStatus(s.id)}
                                            style={{
                                                padding: '10px 18px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 700,
                                                cursor: 'pointer', border: histStatus === s.id ? '2px solid var(--color-secondary)' : '1.5px solid var(--color-border)',
                                                background: histStatus === s.id ? 'var(--color-secondary-container)' : 'white',
                                                color: histStatus === s.id ? 'var(--color-secondary)' : 'var(--color-text)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* État du Paiement (Chips tactiles) */}
                            <div>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>État du Paiement</h4>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'all', label: 'Tous états' },
                                        { id: 'solded', label: 'Soldé' },
                                        { id: 'deposit', label: 'Acompte' },
                                        { id: 'unpaid', label: 'Impayé' }
                                    ].map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => setHistPaymentStatus(p.id as 'all' | 'solded' | 'deposit' | 'unpaid')}
                                            style={{
                                                padding: '10px 18px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 700,
                                                cursor: 'pointer', border: histPaymentStatus === p.id ? '2px solid var(--color-secondary)' : '1.5px solid var(--color-border)',
                                                background: histPaymentStatus === p.id ? 'var(--color-secondary-container)' : 'white',
                                                color: histPaymentStatus === p.id ? 'var(--color-secondary)' : 'var(--color-text)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Mode de Paiement (Chips tactiles) */}
                            <div>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mode de Paiement</h4>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: '', label: 'Tous les modes' },
                                        { id: 'Espèces', label: 'Espèces' },
                                        { id: 'Carte', label: 'Carte' },
                                        { id: 'Chèque', label: 'Chèque' },
                                        { id: 'Virement', label: 'Virement' }
                                    ].map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => setHistPaymentMethod(m.id)}
                                            style={{
                                                padding: '10px 18px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 700,
                                                cursor: 'pointer', border: histPaymentMethod === m.id ? '2px solid var(--color-secondary)' : '1.5px solid var(--color-border)',
                                                background: histPaymentMethod === m.id ? 'var(--color-secondary-container)' : 'white',
                                                color: histPaymentMethod === m.id ? 'var(--color-secondary)' : 'var(--color-text)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Montant exact (Input Tactile avec Pavé Numérique dédié) */}
                            <div>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Montant exact</h4>
                                
                                <button
                                    onClick={() => setShowNumpad(!showNumpad)}
                                    style={{
                                        width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1.5px solid var(--color-border)',
                                        background: showNumpad ? 'white' : 'var(--color-well)', color: 'var(--color-text)',
                                        textAlign: 'left', cursor: 'pointer', outline: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}
                                >
                                    <span style={{ fontWeight: 750, fontSize: '0.95rem' }}>
                                        {histAmount ? `${Number(histAmount).toLocaleString('fr-FR')} ${currency}` : 'Tous montants'}
                                    </span>
                                    {histAmount && (
                                        <span onClick={(e) => { e.stopPropagation(); setHistAmount('') }} style={{ padding: '4px', borderRadius: '50%', background: 'var(--color-surface-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <X size={14} color="var(--color-muted)" />
                                        </span>
                                    )}
                                </button>

                                {/* Pavé Numérique (Digit Pad / Numpad) Tactile Intégré */}
                                {showNumpad && (
                                    <div className="animate-scale-in" style={{
                                        marginTop: '12px', background: 'var(--color-well)', borderRadius: '16px', padding: '16px',
                                        display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-border)', maxWidth: '320px', margin: '12px auto 0'
                                    }}>
                                        {/* Grille de touches tactiles */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                                                <button
                                                    key={num}
                                                    onClick={() => handleNumpadPress(num)}
                                                    style={{
                                                        height: '48px', borderRadius: '12px', border: 'none', background: 'white',
                                                        fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)', cursor: 'pointer',
                                                        boxShadow: 'var(--shadow-sm)', transition: 'all 0.1s'
                                                    }}
                                                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                                                    onMouseUp={e => e.currentTarget.style.transform = 'none'}
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => handleNumpadPress('C')}
                                                style={{
                                                    height: '48px', borderRadius: '12px', border: 'none', background: '#FEE2E2',
                                                    fontSize: '0.95rem', fontWeight: 800, color: '#DC2626', cursor: 'pointer',
                                                    boxShadow: 'var(--shadow-sm)'
                                                }}
                                            >
                                                C
                                            </button>
                                            <button
                                                onClick={() => handleNumpadPress('0')}
                                                style={{
                                                    height: '48px', borderRadius: '12px', border: 'none', background: 'white',
                                                    fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)', cursor: 'pointer',
                                                    boxShadow: 'var(--shadow-sm)'
                                                }}
                                            >
                                                0
                                            </button>
                                            <button
                                                onClick={() => handleNumpadPress('⌫')}
                                                style={{
                                                    height: '48px', borderRadius: '12px', border: 'none', background: '#E0D8CE',
                                                    fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', cursor: 'pointer',
                                                    boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                            >
                                                ⌫
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => setShowNumpad(false)}
                                            className="btn-primary"
                                            style={{ minHeight: '40px', height: '40px', width: '100%', fontSize: '0.85rem', background: 'var(--color-secondary)' }}
                                        >
                                            Valider
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* Pied du Drawer */}
                        <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                            <button
                                onClick={() => {
                                    setHistPeriod('month')
                                    setHistStartDate('')
                                    setHistEndDate('')
                                    setHistStatus('all')
                                    setHistPaymentStatus('all')
                                    setHistPaymentMethod('')
                                    setHistAmount('')
                                    setShowFiltersDrawer(false)
                                }}
                                style={{
                                    flex: 1, padding: '14px', borderRadius: '999px', border: '1.5px solid var(--color-border)',
                                    background: 'white', color: 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem'
                                }}
                            >
                                Réinitialiser tout
                            </button>
                            <button
                                onClick={() => setShowFiltersDrawer(false)}
                                className="btn-primary"
                                style={{ flex: 1, fontSize: '0.9rem', minHeight: '48px' }}
                            >
                                Appliquer les filtres
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL CONFIRMATION DE SUPPRESSION --- */}
            {orderToDelete && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div 
                        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(45,27,14,0.6)', backdropFilter: 'blur(4px)' }} 
                        onClick={() => setOrderToDelete(null)}
                    />
                    <div className="animate-scale-in" style={{
                        position: 'relative', width: '100%', maxWidth: '400px', background: 'white', 
                        borderRadius: '24px', padding: '32px', textAlign: 'center',
                        boxShadow: 'var(--shadow-lg)'
                    }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: 'var(--color-error-container, #FEE2E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--color-error)' }}>
                            <Trash2 size={32} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '12px' }}>Supprimer la commande ?</h3>
                        <p style={{ color: 'var(--color-muted)', marginBottom: '32px', lineHeight: 1.5 }}>
                            Êtes-vous sûr de vouloir supprimer la commande de <strong>{orderToDelete.name}</strong> ? Cette action supprimera également les articles associés.
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => setOrderToDelete(null)}
                                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1.5px solid var(--color-border)', background: 'white', color: 'var(--color-muted)', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleDelete}
                                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--color-error)', color: 'white', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL CRÉATION COMMANDE --- */}
            <NewOrderModal
                open={showModal}
                onClose={() => setShowModal(false)}
                products={products}
                currency={currency}
                organizationId={organizationId}
            />

            {/* --- DRAWER DÉTAIL COMMANDE --- */}
            <OrderDrawer 
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onStatusChange={handleStatusChange}
                isPending={isPending}
                roleSlug={roleSlug}
                onOrderUpdate={handleOrderUpdate}
            />

            {/* --- MODAL IMPORT HISTORIQUE --- */}
            {showImportModal && (
                <HistoricalImportModal
                    open={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    products={products}
                    currency={currency}
                    onSuccess={() => {
                        toast.success("Données historiques importées avec succès !")
                        router.refresh()
                        if (activeTab === 'history') loadHistory(1, true)
                    }}
                />
            )}
        </div>
    )

    // --- RENDUS AUXILIAIRES ---

    // 1. Rendu d'une carte de commande active ("À traiter")
    function renderActiveCard(order: OrderWithItems) {
        const s = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending
        const pickupDate = new Date(order.pickup_date)
        const isToday = pickupDate.toDateString() === new Date().toDateString()
        const isDeleting = deletingId === order.id

        return (
            <div key={order.id} className="card" 
                onClick={() => setSelectedOrder(order)}
                style={{ 
                    border: `1.5px solid ${order.status === 'ready' ? 'var(--color-success)' : 'var(--color-border)'}`,
                    opacity: isDeleting ? 0.5 : 1,
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: 'var(--shadow-sm)',
                    position: 'relative'
                }}>
                <div>
                    {/* Badge de priorité / tag client */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)' }}>{order.customer_name}</span>
                        <span style={{ background: s.bg, color: s.text, fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px' }}>
                            {s.label}
                        </span>
                        
                        {order.payment_status === 'SOLDEE' && order.deposit_amount > 0
                            ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46', display: 'inline-flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={11} /> Soldé</span>
                            : order.payment_status === 'PARTIEL'
                                ? <span className="badge" style={{ background: 'var(--color-well)', color: '#D97757', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Wallet size={11} />Acompte : {Number(order.deposit_amount).toLocaleString('fr-FR')} {currency}</span>
                                : <span className="badge" style={{ background: '#FEE2E2', color: '#B91C1C', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Wallet size={11} /> Impayé</span>
                        }
                        
                        {order.customer_id && <span className="badge" style={{ background: '#EFF6FF', color: '#3B82F6', display: 'inline-flex', alignItems: 'center', gap: 3 }}><BadgeCheck size={11} /> CRM</span>}
                        {isToday && <span className="badge" style={{ background: 'var(--color-secondary-container)', color: 'var(--color-secondary)' }}>📅 Aujourd&apos;hui</span>}
                    </div>

                    {/* Contact et heure de retrait */}
                    <div style={{ display: 'flex', gap: '16px', color: 'var(--color-muted)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {order.customer_contact && <span>📞 {order.customer_contact}</span>}
                        <span style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            color: (pickupDate && !isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? 'var(--color-error)' : 'inherit', 
                            fontWeight: (pickupDate && !isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? 700 : 400 
                        }}>
                            🕐 Retrait : {pickupDate ? formatPickupDate(pickupDate) : 'Non définie'}
                            {(!isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) && <AlertTriangle size={14} />}
                        </span>
                    </div>

                    {/* Liste des produits de la commande */}
                    {order.order_items.length > 0 && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {order.order_items.map((item: OrderItem) => (
                                <span key={item.id} style={{ background: 'var(--color-well)', borderRadius: '99px', padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                    {item.quantity}× {item.products?.name ?? 'Produit'}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Montant et Actions principales */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '12px', marginTop: '4px' }}>
                    <div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)' }}>
                            {Number(order.total_amount).toLocaleString('fr-FR')} {currency}
                        </div>
                        {order.deposit_amount > 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                Reste : {Number(order.total_amount - order.deposit_amount).toLocaleString('fr-FR')} {currency}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {order.status === 'ready' ? (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation()
                                    router.push(`/caisse?order=${order.id}`)
                                }}
                                className="btn-primary" disabled={isPending || isDeleting}
                                style={{ fontSize: '0.8rem', padding: '0 16px', minHeight: '36px', background: 'var(--color-secondary)' }}>
                                Encaisser
                            </button>
                        ) : (
                            order.status !== 'completed' && order.status !== 'cancelled' && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        const next = STATUS_LABELS[order.status]?.next
                                        if (next) handleStatusChange(order.id, next)
                                    }}
                                    className="btn-primary" disabled={isPending || isDeleting}
                                    style={{ fontSize: '0.75rem', padding: '0 12px', minHeight: '36px' }}>
                                    → {STATUS_LABELS[STATUS_LABELS[order.status]?.next]?.label.split(' ').slice(1).join(' ') ?? 'Avancer'}
                                </button>
                            )
                        )}
                        <button 
                            onClick={(e) => {
                                e.stopPropagation()
                                setOrderToDelete({ id: order.id, name: order.customer_name })
                            }} 
                            className="btn-secondary" disabled={isPending || isDeleting}
                            style={{ color: 'var(--color-error)', minHeight: '36px', padding: '0 10px', background: 'transparent', border: 'none' }}>
                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // 2. Rendu de l'en-tête de tableau pour l'historique
    function renderHistoryHeader() {
        return (
            <div className="hidden md:flex" style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '12px 20px',
                background: 'var(--color-well)', borderRadius: '12px', border: '1.5px solid var(--color-border)',
                fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px'
            }}>
                <div style={{ flex: 2 }}>Client</div>
                <div style={{ flex: 1.5 }}>Téléphone</div>
                <div style={{ flex: 1 }}>Montant</div>
                <div style={{ flex: 1.2 }}>Statut</div>
                <div style={{ flex: 1.5 }}>Date retrait</div>
                <div style={{ flex: 1.5 }}>Paiement</div>
                <div style={{ width: '100px', textAlign: 'center' }}>Détails</div>
            </div>
        )
    }

    // 3. Rendu d'une ligne d'historique (Responsive flex-row sur desktop, card sur mobile)
    function renderHistoryRow(order: OrderWithItems) {
        const s = STATUS_LABELS[order.status] ?? STATUS_LABELS.completed
        const pickupDate = new Date(order.pickup_date)

        // Rendu Mobile
        const mobileView = (
            <div className="block md:hidden">
                <div className="card"
                    onClick={() => setSelectedOrder(order)}
                    style={{
                        padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                        border: '1.5px solid var(--color-border)', borderRadius: '16px', cursor: 'pointer',
                        boxShadow: 'var(--shadow-sm)', background: 'white', marginBottom: '8px'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text)' }}>{order.customer_name}</span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)' }}>
                            {Number(order.total_amount).toLocaleString('fr-FR')} {currency}
                        </span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ background: s.bg, color: s.text, fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: '99px' }}>
                            {s.label}
                        </span>
                        {order.payment_status === 'SOLDEE'
                            ? <span className="badge" style={{ background: '#D1FAE5', color: '#065F46', display: 'inline-flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={11} /> Soldé</span>
                            : order.payment_status === 'PARTIEL'
                                ? <span className="badge" style={{ background: 'var(--color-well)', color: '#D97757', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Wallet size={11} /> Acompte</span>
                                : <span className="badge" style={{ background: '#FEE2E2', color: '#B91C1C', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Wallet size={11} /> Impayé</span>
                        }
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-muted)', fontSize: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '10px', marginTop: '2px' }}>
                        <div>
                            {order.customer_contact && <div style={{ marginBottom: '2px' }}>📞 {order.customer_contact}</div>}
                            <div>📅 {formatPickupDate(pickupDate)}</div>
                        </div>
                        <button className="btn-secondary" style={{ minHeight: '32px', height: '32px', padding: '0 12px', fontSize: '0.75rem' }}>
                            Voir détail
                        </button>
                    </div>
                </div>
            </div>
        )

        // Rendu Desktop
        const desktopView = (
            <div className="hidden md:block">
                <div
                    onClick={() => setSelectedOrder(order)}
                    style={{
                        display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '14px 20px',
                        background: 'white', borderRadius: '12px', border: '1.5px solid var(--color-border)',
                        cursor: 'pointer', transition: 'all 0.15s', marginBottom: '4px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                >
                    {/* Client */}
                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{order.customer_name}</span>
                        {order.customer_id && <span style={{ fontSize: '0.65rem', color: '#3B82F6', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}><BadgeCheck size={10} /> Client CRM</span>}
                    </div>

                    {/* Téléphone */}
                    <div style={{ flex: 1.5, color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                        {order.customer_contact || '—'}
                    </div>

                    {/* Montant */}
                    <div style={{ flex: 1, fontWeight: 800, color: 'var(--color-text)' }}>
                        {Number(order.total_amount).toLocaleString('fr-FR')} {currency}
                    </div>

                    {/* Statut */}
                    <div style={{ flex: 1.2 }}>
                        <span style={{ background: s.bg, color: s.text, fontSize: '0.7rem', fontWeight: 850, padding: '4px 10px', borderRadius: '99px', display: 'inline-block' }}>
                            {s.label}
                        </span>
                    </div>

                    {/* Date de retrait */}
                    <div style={{ flex: 1.5, fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                        {formatPickupDate(pickupDate)}
                    </div>

                    {/* État Paiement */}
                    <div style={{ flex: 1.5 }}>
                        {order.payment_status === 'SOLDEE' ? (
                            <span className="badge" style={{ background: '#D1FAE5', color: '#065F46', fontWeight: 700 }}><CheckCircle2 size={11} style={{ marginRight: '4px' }} /> Soldé</span>
                        ) : order.payment_status === 'PARTIEL' ? (
                            <span className="badge" style={{ background: 'var(--color-well)', color: '#D97757', fontWeight: 700 }}><Wallet size={11} style={{ marginRight: '4px' }} /> Acompte</span>
                        ) : (
                            <span className="badge" style={{ background: '#FEE2E2', color: '#B91C1C', fontWeight: 700 }}><Wallet size={11} style={{ marginRight: '4px' }} /> Impayé</span>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={{ width: '100px', display: 'flex', justifyContent: 'center' }}>
                        <button className="btn-secondary" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '36px', height: '36px', borderRadius: '99px', minWidth: '36px', minHeight: '36px',
                            padding: 0, background: 'var(--color-well)', color: 'var(--color-muted)', border: 'none'
                        }}>
                            <Eye size={16} />
                        </button>
                    </div>
                </div>
            </div>
        )

        return (
            <div key={order.id}>
                {mobileView}
                {desktopView}
            </div>
        )
    }
}
