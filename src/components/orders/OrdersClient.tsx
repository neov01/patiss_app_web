'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useActionFeedback } from '@/hooks/useActionFeedback'
import { ShoppingBag, Plus, Trash2, AlertTriangle, Wallet, Loader2, BadgeCheck, CheckCircle2, Search, SlidersHorizontal, X, Eye, Phone, Clock, CalendarDays, Star, Siren, ListTodo, History, Zap, ArchiveRestore, Upload, CreditCard, User } from 'lucide-react'
import { updateOrderStatus, softDeleteOrder, getHistoricalOrders, getVitrineSales, deleteVitrineSale } from '@/lib/actions/orders'
import NewOrderModal from './NewOrderModal'
import OrderDrawer, { type OrderPayment } from './OrderDrawer'
import HistoricalImportModal from './HistoricalImportModal'
import DatePicker from '@/components/ui/DatePicker'
import ConfirmModalWithReason from '@/components/ui/ConfirmModalWithReason'
import SessionPill from '@/components/layout/SessionPill'
import { useSession } from '@/components/layout/SessionMaster'

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
    payment_status: string
    total_amount: number
    deposit_amount: number
    custom_image_url: string | null
    customization_notes: string | null
    created_by: string | null
    created_at: string | null
    inserted_at: string | null
    is_historical?: boolean | null
    order_items: OrderItem[]
    paid_amount: number
    balance: number
    order_payments?: OrderPayment[]
    creator_profile?: {
        full_name: string
        role_slug: string
    } | null
}

export interface TransactionItem {
    id: string
    transaction_id: string | null
    product_id: string | null
    name: string | null
    quantity: number | null
    unit_price: number | null
    subtotal: number | null
}

export interface VitrineSaleTransaction {
    id: string
    organization_id: string
    order_id: string | null
    customer_id: string | null
    amount: number | null
    created_at: string | null
    created_by: string | null
    payment_method: string | null
    payment_details: unknown
    client_name: string | null
    label_type: string | null
    transaction_items?: TransactionItem[]
    creator_profile?: {
        full_name: string
        role_slug: string
    } | null
}

const STATUS_LABELS: Record<string, { label: string; next: string; color: string; bg: string; text: string }> = {
    confirmed: { label: '⏳ Confirmée', next: 'in_preparation', color: 'var(--color-badge-warning-bg)', bg: 'var(--color-badge-warning-bg)', text: 'var(--color-badge-warning-text)' },
    in_preparation: { label: '👨‍🍳 En préparation', next: 'ready', color: 'var(--color-badge-production-bg)', bg: 'var(--color-badge-production-bg)', text: 'var(--color-badge-production-text)' },
    ready: { label: '✅ Prête', next: 'delivered', color: 'var(--color-badge-success-bg)', bg: 'var(--color-badge-success-bg)', text: 'var(--color-badge-success-text)' },
    awaiting_pickup: { label: '📦 Attente retrait', next: 'delivered', color: 'var(--color-badge-success-bg)', bg: 'var(--color-badge-success-bg)', text: 'var(--color-badge-success-text)' },
    delivered: { label: '✔ Livrée / Retirée', next: '', color: 'var(--color-well)', bg: 'var(--color-well)', text: 'var(--color-text)' },
    cancelled: { label: '✖ Annulée', next: '', color: 'var(--color-badge-danger-bg)', bg: 'var(--color-badge-danger-bg)', text: 'var(--color-badge-danger-text)' },
    // Rétrocompatibilité
    pending: { label: '⏳ Confirmée', next: 'in_preparation', color: 'var(--color-badge-warning-bg)', bg: 'var(--color-badge-warning-bg)', text: 'var(--color-badge-warning-text)' },
    production: { label: '👨‍🍳 En préparation', next: 'ready', color: 'var(--color-badge-production-bg)', bg: 'var(--color-badge-production-bg)', text: 'var(--color-badge-production-text)' },
    completed: { label: '✔ Livrée / Retirée', next: '', color: 'var(--color-well)', bg: 'var(--color-well)', text: 'var(--color-text)' },
}

// Libellé de statut sans l'emoji de tête (les emojis restent dans STATUS_LABELS
// car d'autres écrans s'en servent ; l'interface affiche une pastille textuelle).
function statusText(label: string) {
    const [first, ...rest] = label.split(' ')
    return /\p{L}/u.test(first) ? label : rest.join(' ')
}

const ACTIVE_STATUSES = ['confirmed', 'in_preparation', 'ready', 'awaiting_pickup', 'pending', 'production']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PAYMENT_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
    unpaid: { label: 'Impayé', bg: 'var(--color-badge-danger-bg)', text: 'var(--color-error)', icon: Wallet },
    deposit_paid: { label: 'Acompte versé', bg: 'rgba(129, 84, 49, 0.08)', text: 'var(--color-primary)', icon: Wallet },
    partial: { label: 'Partiel', bg: 'rgba(217, 119, 6, 0.08)', text: 'var(--color-badge-warning-accent)', icon: Wallet },
    paid: { label: 'Soldé', bg: 'var(--color-badge-success-bg)', text: 'var(--color-badge-success-text)', icon: CheckCircle2 },
    overpaid: { label: 'Trop-perçu', bg: 'var(--color-badge-warning-bg)', text: 'var(--color-badge-warning-text)', icon: AlertTriangle },
    // Rétrocompatibilité
    EN_ATTENTE: { label: 'Impayé', bg: 'var(--color-badge-danger-bg)', text: 'var(--color-error)', icon: Wallet },
    PARTIEL: { label: 'Acompte', bg: 'rgba(129, 84, 49, 0.08)', text: 'var(--color-primary)', icon: Wallet },
    SOLDEE: { label: 'Soldé', bg: 'var(--color-badge-success-bg)', text: 'var(--color-badge-success-text)', icon: CheckCircle2 },
}

// --- Filtres "À traiter" ---
// Regroupe les nombreux libellés historiques de paiement en 3 familles simples.
type PaymentBucket = 'unpaid' | 'deposit' | 'paid'
type PaymentFilter = 'all' | PaymentBucket

const PAID_STATUSES = new Set(['paid', 'SOLDEE', 'overpaid'])
const DEPOSIT_STATUSES = new Set(['deposit_paid', 'partial', 'PARTIEL'])

// Même règle que les badges : tout ce qui n'est ni soldé ni acompte est affiché « Impayé ».
function getPaymentBucket(status: string | null | undefined): PaymentBucket {
    if (status && PAID_STATUSES.has(status)) return 'paid'
    if (status && DEPOSIT_STATUSES.has(status)) return 'deposit'
    return 'unpaid'
}

function isSameLocalDay(value: string | null | undefined, ref: Date): boolean {
    if (!value) return false
    const d = new Date(value)
    return !isNaN(d.getTime()) && d.toDateString() === ref.toDateString()
}

const PAYMENT_FILTERS: { id: PaymentFilter; label: string }[] = [
    { id: 'all', label: 'Tous' },
    { id: 'unpaid', label: 'Impayé' },
    { id: 'deposit', label: 'Acompte' },
    { id: 'paid', label: 'Soldé' },
]

type QuickFilters = { pickupToday: boolean; createdToday: boolean; notCollected: boolean; crm: boolean }
const NO_QUICK_FILTERS: QuickFilters = { pickupToday: false, createdToday: false, notCollected: false, crm: false }

const QUICK_FILTERS: { id: keyof QuickFilters; label: string }[] = [
    { id: 'pickupToday', label: 'Retrait aujourd\'hui' },
    { id: 'createdToday', label: 'Créées aujourd\'hui' },
    { id: 'notCollected', label: 'Non retirées' },
    { id: 'crm', label: 'Clients CRM' },
]

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
    isSessionOpen = false,
    initialVitrineSales = [],
    initialVitrineCount = 0,
    initialVitrineHasMore = false
}: {
    orders: OrderWithItems[];
    products: Product[];
    currency: string;
    organizationId: string;
    roleSlug: string;
    canImportHistory?: boolean;
    isSessionOpen?: boolean;
    initialVitrineSales?: VitrineSaleTransaction[];
    initialVitrineCount?: number;
    initialVitrineHasMore?: boolean;
}) {
    const router = useRouter()
    const { isConsultationMode } = useSession()

    // --- États Communs ---
    const [activeTab, setActiveTab] = useState<'todo' | 'history' | 'vitrine'>('todo')
    const [showModal, setShowModal] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const { isPending, renderFeedback } = useActionFeedback()
    const [orderToDelete, setOrderToDelete] = useState<{id: string, name: string} | null>(null)
    const [vitrineToDelete, setVitrineToDelete] = useState<{id: string, amount: number, clientName: string | null} | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    
    // --- États Ventes Rapides ---
    const [vitrineSales, setVitrineSales] = useState<VitrineSaleTransaction[]>(initialVitrineSales)
    const [vitrineCount, setVitrineCount] = useState(initialVitrineCount)
    const [vitrineLoading, setVitrineLoading] = useState(false)
    const [vitrineHasMore, setVitrineHasMore] = useState(initialVitrineHasMore)
    const [vitrinePage, setVitrinePage] = useState(1)

    useEffect(() => {
        setVitrineSales(initialVitrineSales)
        setVitrineCount(initialVitrineCount)
        setVitrineHasMore(initialVitrineHasMore)
        setVitrinePage(1)
    }, [initialVitrineSales, initialVitrineCount, initialVitrineHasMore])

    const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null)
    const [search, setSearch] = useState('')

    // --- États Commandes actives ("À traiter") ---
    const [localOrders, setLocalOrders] = useState(orders)
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
    const [quickFilters, setQuickFilters] = useState<QuickFilters>(NO_QUICK_FILTERS)
    const hasTodoFilters = paymentFilter !== 'all' || Object.values(quickFilters).some(Boolean)
    const resetTodoFilters = () => {
        setPaymentFilter('all')
        setQuickFilters(NO_QUICK_FILTERS)
    }

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

    // --- États Recherche Universelle Multi-Statuts ---
    const [searchServerOrders, setSearchServerOrders] = useState<OrderWithItems[]>([])
    const [searchServerLoading, setSearchServerLoading] = useState(false)

    const isSearching = search.trim().length >= 2

    // --- Logique de Recherche Universelle (Debounced) ---
    useEffect(() => {
        if (!isSearching) {
            setSearchServerOrders([])
            return
        }

        const timer = setTimeout(async () => {
            setSearchServerLoading(true)
            try {
                const result = await getHistoricalOrders({
                    page: 1,
                    pageSize: 50,
                    searchQuery: search
                })
                if ('orders' in result && result.orders) {
                    setSearchServerOrders(result.orders as unknown as OrderWithItems[])
                }
            } catch (err) {
                console.error("Erreur recherche universelle:", err)
            } finally {
                setSearchServerLoading(false)
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

    // --- Chargement des Ventes Vitrine ---
    const loadVitrineSales = async (page: number, replace = false) => {
        setVitrineLoading(true)
        try {
            const amountNum = histAmount.trim() !== '' ? Number(histAmount) : undefined
            const result = await getVitrineSales({
                page,
                pageSize: 20,
                period: histPeriod,
                startDate: histStartDate || undefined,
                endDate: histEndDate || undefined,
                amount: amountNum,
                paymentMethod: histPaymentMethod || undefined,
                searchQuery: search
            })

            if (result && 'error' in result && result.error) {
                toast.error(result.error)
                return
            }

            if (result && 'transactions' in result && result.transactions) {
                const fetchedTx = result.transactions
                if (replace) {
                    setVitrineSales(fetchedTx as VitrineSaleTransaction[])
                } else {
                    setVitrineSales(prev => {
                        const existingIds = new Set(prev.map(v => v.id))
                        const uniqueNew = (fetchedTx as VitrineSaleTransaction[]).filter(v => !existingIds.has(v.id))
                        return [...prev, ...uniqueNew]
                    })
                }
                setVitrineCount(result.count || 0)
                setVitrineHasMore(!!result.hasMore)
                setVitrinePage(page)
            }
        } catch (err) {
            toast.error("Impossible de charger les ventes vitrine")
            console.error(err)
        } finally {
            setVitrineLoading(false)
        }
    }

    // Déclencheur de rechargement des ventes vitrine quand les filtres changent
    useEffect(() => {
        if (activeTab === 'vitrine') {
            loadVitrineSales(1, true)
        }
    }, [activeTab, histPeriod, histStartDate, histEndDate, histPaymentMethod, histAmount, search])

    // --- Filtrage Local "À traiter" ---
    // 1) Raccourcis cumulables (ET) + recherche, 2) puis une seule famille de paiement.
    // Les compteurs du sélecteur de paiement reflètent l'étape 1.
    const todoBeforePayment = useMemo(() => {
        const now = new Date()
        const q = search.toLowerCase()
        return localOrders.filter(o => {
            if (quickFilters.pickupToday && !isSameLocalDay(o.pickup_date, now)) return false
            if (quickFilters.createdToday && !isSameLocalDay(o.created_at, now)) return false
            if (quickFilters.notCollected && (o.status === 'delivered' || o.status === 'completed')) return false
            if (quickFilters.crm && !o.customer_id) return false
            if (isSearching && !(
                o.customer_name.toLowerCase().includes(q) ||
                (o.customer_contact && o.customer_contact.toLowerCase().includes(q)) ||
                (o.order_number && o.order_number.toLowerCase().includes(q))
            )) return false
            return true
        })
    }, [localOrders, quickFilters, search, isSearching])

    const paymentCounts = useMemo(() => {
        const c: Record<PaymentFilter, number> = { all: todoBeforePayment.length, unpaid: 0, deposit: 0, paid: 0 }
        todoBeforePayment.forEach(o => { c[getPaymentBucket(o.payment_status)]++ })
        return c
    }, [todoBeforePayment])

    const filteredTodo = useMemo(() => (
        paymentFilter === 'all'
            ? todoBeforePayment
            : todoBeforePayment.filter(o => getPaymentBucket(o.payment_status) === paymentFilter)
    ), [todoBeforePayment, paymentFilter])

    // Compteurs pour les badges d'onglets
    const counts = useMemo(() => {
        return {
            todo: localOrders.length,
            history: historyCount,
            vitrine: vitrineCount
        }
    }, [localOrders, historyCount, vitrineCount])

    // Statuts considérés comme "Actifs" (À traiter)
    const ACTIVE_STATUS_SET = useMemo(() => new Set([
        'pending', 'production', 'ready', 'confirmed', 'in_preparation', 
        'awaiting_pickup', 'in_production', 'draft'
    ]), [])

    // Commandes actives trouvées (Locales + Serveur dédoublonnées)
    const searchActiveOrders = useMemo(() => {
        const map = new Map<string, OrderWithItems>()
        // 1. D'abord les commandes locales actives correspondantes
        filteredTodo.forEach(o => map.set(o.id, o))
        // 2. Ensuite les commandes actives renvoyées par le serveur
        searchServerOrders
            .filter(o => ACTIVE_STATUS_SET.has(o.status))
            .forEach(o => map.set(o.id, o))
        return Array.from(map.values())
    }, [filteredTodo, searchServerOrders, ACTIVE_STATUS_SET])

    // Commandes passées trouvées (Livrées, terminées ou annulées)
    const searchPastOrders = useMemo(() => {
        return searchServerOrders.filter(o => !ACTIVE_STATUS_SET.has(o.status))
    }, [searchServerOrders, ACTIVE_STATUS_SET])

    // Injection réactive instantanée d'une nouvelle commande (Zéro Latence)
    const handleOrderCreated = useCallback((newOrder: Record<string, unknown>) => {
        if (!newOrder || !newOrder.id) return
        const orderTyped = newOrder as unknown as OrderWithItems
        setLocalOrders(prev => {
            const exists = prev.some(o => o.id === orderTyped.id)
            if (exists) return prev.map(o => o.id === orderTyped.id ? orderTyped : o)
            return [orderTyped, ...prev]
        })
        setActiveTab('todo')
    }, [])

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
                if (nextStatus === 'delivered' || nextStatus === 'completed' || nextStatus === 'cancelled') {
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

    const handleDelete = async (reason: string) => {
        if (!orderToDelete) return

        const { id } = orderToDelete
        setDeletingId(id)
        setOrderToDelete(null)

        const deletePromise = async () => {
            const result = await softDeleteOrder(id, reason)
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
                return 'Commande supprimée. Restaurable pendant 30 jours depuis "Historique des suppressions".'
            },
            error: (err) => {
                setDeletingId(null)
                router.refresh()
                return err instanceof Error ? err.message : 'Une erreur est survenue.'
            }
        })
    }

    const handleDeleteVitrine = async () => {
        if (!vitrineToDelete) return
        
        const { id } = vitrineToDelete
        setDeletingId(id)
        setVitrineToDelete(null)
        
        const deletePromise = async () => {
            const result = await deleteVitrineSale(id)
            if (result && typeof result === 'object' && 'error' in result && result.error) {
                throw new Error(String(result.error))
            }
            return result
        }

        toast.promise(deletePromise(), {
            loading: 'Suppression de la vente...',
            success: () => {
                setVitrineSales(prev => prev.filter(v => v.id !== id))
                setVitrineCount(prev => Math.max(0, prev - 1))
                router.refresh()
                setDeletingId(null)
                return 'Vente vitrine supprimée et stocks restaurés !'
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
                            `Recherche universelle : ${searchActiveOrders.length} active${searchActiveOrders.length > 1 ? 's' : ''}, ${searchPastOrders.length} passée${searchPastOrders.length > 1 ? 's' : ''}`
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
                        <button 
                            onClick={() => {
                                if (isConsultationMode) {
                                    toast.error("Importation d'historique désactivée en mode consultation.")
                                    return
                                }
                                setShowImportModal(true)
                            }} 
                            className="btn-secondary" 
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '40px', fontSize: '0.85rem', padding: '0 16px' }}
                        >
                            <Upload size={16} aria-hidden="true" /> Saisie Historique
                        </button>
                    )}
                    <button 
                        onClick={() => {
                            if (isConsultationMode) {
                                toast.error("Création de commande désactivée en mode consultation.")
                                return
                            }
                            setShowModal(true)
                        }} 
                        className="btn-primary" 
                        style={{ minHeight: '40px', padding: '0 20px', fontSize: '0.85rem' }}
                    >
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
                            <ListTodo size={18} aria-hidden="true" /> Commandes actives ({searchActiveOrders.length})
                            {searchServerLoading && <Loader2 size={16} className="animate-spin" />}
                        </h2>
                        {searchActiveOrders.length === 0 ? (
                            <div className="card" style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--color-muted)' }}>
                                Aucun résultat actif pour &ldquo;{search}&rdquo;
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                {searchActiveOrders.map(order => renderActiveCard(order))}
                            </div>
                        )}
                    </div>

                    {/* Section Historique */}
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '12px', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <History size={18} aria-hidden="true" /> Historique des commandes ({searchPastOrders.length})
                            {searchServerLoading && <Loader2 size={16} className="animate-spin" />}
                        </h2>
                        {searchServerLoading && searchPastOrders.length === 0 ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                                <Loader2 size={32} className="animate-spin" color="var(--color-secondary)" />
                            </div>
                        ) : searchPastOrders.length === 0 ? (
                            <div className="card" style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--color-muted)' }}>
                                Aucun résultat dans l&apos;historique pour &ldquo;{search}&rdquo;
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {renderHistoryHeader()}
                                {searchPastOrders.map(order => renderHistoryRow(order))}
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
                            <ListTodo size={18} aria-hidden="true" /> À traiter
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
                            <History size={18} aria-hidden="true" /> Historique
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: activeTab === 'history' ? 'var(--color-secondary)' : 'var(--color-surface-variant)', color: activeTab === 'history' ? 'white' : 'var(--color-text)', fontWeight: 800 }}>
                                {counts.history}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('vitrine')}
                            style={{
                                padding: '12px 16px',
                                fontSize: '1rem',
                                fontWeight: 700,
                                border: 'none',
                                background: 'transparent',
                                borderBottom: activeTab === 'vitrine' ? '3px solid var(--color-primary)' : '3px solid transparent',
                                color: activeTab === 'vitrine' ? 'var(--color-primary)' : 'var(--color-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <Zap size={18} aria-hidden="true" /> Ventes Rapides
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '99px', background: activeTab === 'vitrine' ? 'var(--color-primary)' : 'var(--color-surface-variant)', color: activeTab === 'vitrine' ? 'white' : 'var(--color-text)', fontWeight: 800 }}>
                                {counts.vitrine}
                            </span>
                        </button>
                        {(roleSlug === 'vendeur' || roleSlug === 'gerant' || roleSlug === 'super_admin') && (
                            <button
                                onClick={() => router.push('/commandes/audit')}
                                style={{
                                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 14px', minHeight: '44px', borderRadius: '999px', border: '1.5px solid var(--color-border)',
                                    background: '#fff', color: 'var(--color-muted)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                                }}
                            >
                                <ArchiveRestore size={16} aria-hidden="true" /> Historique des suppressions
                            </button>
                        )}
                    </div>

                    {/* --- CONTENU DE L'ONGLET SÉLECTIONNÉ --- */}
                    {activeTab === 'todo' ? (
                        /* --- VUE À TRAITER (GRILLE D'ACTION) --- */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Filtres « À traiter » : paiement (choix unique) + raccourcis cumulables */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div role="radiogroup" aria-label="Filtrer par paiement" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '4px', borderRadius: '99px', background: 'var(--color-surface-variant)' }}>
                                    {PAYMENT_FILTERS.map(f => {
                                        const active = paymentFilter === f.id
                                        const danger = f.id === 'unpaid'
                                        return (
                                            <button key={f.id}
                                                role="radio"
                                                aria-checked={active}
                                                onClick={() => setPaymentFilter(f.id)}
                                                style={{
                                                    minHeight: '40px', padding: '0 16px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '99px', border: 'none',
                                                    background: active ? (danger ? 'var(--color-error)' : 'var(--color-primary)') : 'transparent',
                                                    color: active ? 'white' : (danger ? 'var(--color-error)' : 'var(--color-text)'),
                                                    cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
                                                }}
                                            >
                                                {f.label}
                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, opacity: active ? 0.9 : 0.6 }}>{paymentCounts[f.id]}</span>
                                            </button>
                                        )
                                    })}
                                </div>

                                {QUICK_FILTERS.map(f => {
                                    const active = quickFilters[f.id]
                                    return (
                                        <button key={f.id}
                                            aria-pressed={active}
                                            onClick={() => setQuickFilters(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                                            style={{
                                                minHeight: '40px', padding: '0 14px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '99px',
                                                border: active ? '1.5px solid var(--color-secondary)' : '1.5px solid var(--color-border)',
                                                background: active ? 'var(--color-secondary)' : 'transparent',
                                                color: active ? 'white' : 'var(--color-muted)',
                                                cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
                                            }}
                                        >
                                            {active && <CheckCircle2 size={14} />}
                                            {f.label}
                                        </button>
                                    )
                                })}

                                {hasTodoFilters && (
                                    <button
                                        onClick={resetTodoFilters}
                                        style={{ minHeight: '40px', padding: '0 10px', fontSize: '0.8rem', fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        Effacer les filtres
                                    </button>
                                )}
                            </div>

                            {/* Grille de commandes à traiter */}
                            {filteredTodo.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                                    <ShoppingBag size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>
                                        {hasTodoFilters ? 'Aucune commande ne correspond à ces filtres' : 'Aucune commande à traiter'}
                                    </p>
                                    {hasTodoFilters && (
                                        <button className="btn-secondary" onClick={resetTodoFilters} style={{ marginTop: '8px' }}>
                                            Effacer les filtres
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                                    {filteredTodo.map(order => renderActiveCard(order))}
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'history' ? (
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
                                            { id: 'delivered', label: 'Livré / Retiré' },
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
                    ) : (
                        /* --- VUE VENTRE RAPIDE --- */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            
                            {/* Barre de filtres rapides + Bouton d'ouverture du Drawer Tactile */}
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
                                    {(histPaymentMethod !== '' || histAmount !== '' || histPeriod === 'custom') && (
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)' }} />
                                    )}
                                </button>
                            </div>

                            {/* Liste des ventes vitrine */}
                            {vitrineLoading && vitrineSales.length === 0 ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                                    <Loader2 size={40} className="animate-spin" color="var(--color-secondary)" />
                                </div>
                            ) : vitrineSales.length === 0 ? (
                                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                                    <ShoppingBag size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucune vente vitrine trouvée</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {renderVitrineHeader()}
                                    {vitrineSales.map(tx => renderVitrineRow(tx))}

                                    {/* Charger Plus */}
                                    {vitrineHasMore && (
                                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                                            <button
                                                onClick={() => loadVitrineSales(vitrinePage + 1)}
                                                disabled={vitrineLoading}
                                                className="btn-secondary"
                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 32px' }}
                                            >
                                                {vitrineLoading ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        Chargement...
                                                    </>
                                                ) : (
                                                    'Charger plus de ventes'
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
                                        { id: 'delivered', label: 'Livré / Retiré' },
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
                                        { id: 'cash', label: 'Espèces' },
                                        { id: 'orange_money', label: 'Orange Money' },
                                        { id: 'wave', label: 'Wave' },
                                        { id: 'mobile_money', label: 'MTN MOMO' },
                                        { id: 'moov_money', label: 'Moov Money' }
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
                                                    height: '48px', borderRadius: '12px', border: 'none', background: 'var(--color-badge-danger-bg)',
                                                    fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-badge-danger-accent)', cursor: 'pointer',
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
                                                    height: '48px', borderRadius: '12px', border: 'none', background: 'var(--color-surface-variant)',
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
            <ConfirmModalWithReason
                isOpen={!!orderToDelete}
                onClose={() => setOrderToDelete(null)}
                onConfirm={handleDelete}
                title="Supprimer la commande ?"
                message={`Êtes-vous sûr de vouloir supprimer la commande de ${orderToDelete?.name ?? ''} ? Elle restera restaurable pendant 30 jours depuis la page d'audit.`}
                confirmText="Supprimer"
                reasonLabel="Raison de la suppression (obligatoire)"
            />

            {/* --- MODAL CONFIRMATION SUPPRESSION VENTE VITRINE --- */}
            {vitrineToDelete && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div 
                        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(45,27,14,0.6)', backdropFilter: 'blur(4px)' }} 
                        onClick={() => setVitrineToDelete(null)}
                    />
                    <div className="animate-scale-in" style={{
                        position: 'relative', width: '100%', maxWidth: '400px', background: 'white', 
                        borderRadius: '24px', padding: '32px', textAlign: 'center',
                        boxShadow: 'var(--shadow-lg)'
                    }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: 'var(--color-error-container, var(--color-badge-danger-bg))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--color-error)' }}>
                            <Trash2 size={32} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '12px' }}>Supprimer la vente rapide ?</h3>
                        <p style={{ color: 'var(--color-muted)', marginBottom: '32px', lineHeight: 1.5 }}>
                            Êtes-vous sûr de vouloir supprimer la vente rapide de <strong>{vitrineToDelete.clientName || 'Client Vitrine'}</strong> d&apos;un montant de <strong>{vitrineToDelete.amount.toLocaleString('fr-FR')} {currency}</strong> ? Cette action annulera le paiement et restaurera les stocks des produits associés.
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => setVitrineToDelete(null)}
                                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1.5px solid var(--color-border)', background: 'white', color: 'var(--color-muted)', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleDeleteVitrine}
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
                onOrderCreated={handleOrderCreated}
            />

            {/* --- DRAWER DÉTAIL COMMANDE --- */}
            <OrderDrawer 
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onStatusChange={handleStatusChange}
                isPending={isPending}
                roleSlug={roleSlug}
                onOrderUpdate={handleOrderUpdate}
                currency={currency}
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

        // Bordure fine : la priorité est portée par sa pastille (texte + icône), pas par l'épaisseur.
        let cardBorder = '1px solid var(--color-border)'
        if (order.priority === 'urgent') {
            cardBorder = '1.5px solid var(--color-error)'
        } else if (order.priority === 'vip') {
            cardBorder = '1.5px solid var(--color-gold)'
        } else if (order.status === 'ready') {
            cardBorder = '1.5px solid var(--color-success)'
        }

        // Commande remise au client mais pas soldée : un seul statut explicite.
        const pStatusRaw = order.payment_status || 'unpaid'
        const isHandedOver = order.status === 'delivered' || order.status === 'completed'
        const retiredUnpaid = isHandedOver && !PAID_STATUSES.has(pStatusRaw)

        return (
            <div key={order.id} className="card press" 
                onClick={() => setSelectedOrder(order)}
                style={{ 
                    border: cardBorder,
                    opacity: isDeleting ? 0.5 : 1,
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
                        {retiredUnpaid ? (
                            <span style={{ background: 'var(--color-badge-danger-bg)', color: 'var(--color-badge-danger-text)', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Wallet size={12} aria-hidden="true" /> Retirée · reste à payer
                            </span>
                        ) : (
                            <span style={{ background: s.bg, color: s.text, fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px' }}>
                                {statusText(s.label)}
                            </span>
                        )}
                        
                        {order.priority === 'urgent' && <span className="badge" style={{ background: 'var(--color-badge-danger-bg)', color: 'var(--color-badge-danger-text)', fontWeight: 800, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Siren size={11} aria-hidden="true" /> Urgent</span>}
                        {order.priority === 'vip' && <span className="badge" style={{ background: 'var(--color-badge-warning-bg)', color: 'var(--color-badge-warning-text)', fontWeight: 800, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={11} aria-hidden="true" /> VIP</span>}

                        {!retiredUnpaid && (() => {
                            const pStatus = pStatusRaw
                            const conf = PAYMENT_STATUS_CONFIG[pStatus] || PAYMENT_STATUS_CONFIG.unpaid
                            const Icon = conf.icon
                            let details = ''
                            if (pStatus === 'partial' || pStatus === 'deposit_paid' || pStatus === 'PARTIEL') {
                                details = ` : ${Number(order.deposit_amount || order.paid_amount || 0).toLocaleString('fr-FR')} ${currency}`
                            }
                            return (
                                <span className="badge" style={{ background: conf.bg, color: conf.text, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    <Icon size={11} />
                                    {conf.label}{details}
                                </span>
                            )
                        })()}
                        
                        {order.customer_id && <span className="badge" style={{ background: 'var(--color-badge-crm-bg)', color: 'var(--color-badge-crm-text)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><BadgeCheck size={11} /> CRM</span>}
                        {isToday && <span className="badge" style={{ background: 'var(--color-secondary-container)', color: 'var(--color-secondary)' }}><CalendarDays size={11} aria-hidden="true" style={{ marginRight: 3 }} />Aujourd&apos;hui</span>}
                    </div>

                    {/* Contact et heure de retrait */}
                    <div style={{ display: 'flex', gap: '16px', color: 'var(--color-muted)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {order.customer_contact && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={13} aria-hidden="true" /> {order.customer_contact}</span>}
                        <span style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            color: (pickupDate && !isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? 'var(--color-error)' : 'inherit', 
                            fontWeight: (pickupDate && !isNaN(pickupDate.getTime()) && order.status !== 'completed' && order.status !== 'cancelled' && pickupDate.getTime() - Date.now() < 2 * 60 * 60 * 1000 && pickupDate.getTime() > Date.now()) ? 700 : 400 
                        }}>
                            <Clock size={13} aria-hidden="true" /> Retrait : {pickupDate ? formatPickupDate(pickupDate) : 'Non définie'}
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
                        <div className="money" style={{ fontSize: '1.3rem' }}>
                            {Number(order.total_amount).toLocaleString('fr-FR')}<span className="money-cur">{currency}</span>
                        </div>
                        {Number(order.balance || 0) > 0 && (
                            <div style={{ fontSize: '0.75rem', fontWeight: retiredUnpaid ? 700 : 500, color: retiredUnpaid ? 'var(--color-badge-danger-text)' : 'var(--color-muted)' }}>
                                Reste : {Number(order.balance).toLocaleString('fr-FR')} {currency}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {['ready', 'awaiting_pickup'].includes(order.status) ? (
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
                            order.status !== 'delivered' && order.status !== 'completed' && order.status !== 'cancelled' && (
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
                            aria-label={`Supprimer la commande de ${order.customer_name}`}
                            title="Supprimer (confirmation demandée)"
                            style={{ color: 'var(--color-badge-danger-text)', minHeight: '44px', minWidth: '44px', padding: '0 10px', background: 'transparent', border: 'none' }}>
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

        let rowBorder = '1.5px solid var(--color-border)'
        let hoverBorderColor = 'var(--color-secondary)'
        if (order.priority === 'urgent') {
            rowBorder = '4px solid var(--color-error)'
            hoverBorderColor = 'var(--color-error)'
        } else if (order.priority === 'vip') {
            rowBorder = '4px solid var(--color-gold)'
            hoverBorderColor = 'var(--color-gold)'
        }

        // Rendu Mobile
        const mobileView = (
            <div className="block md:hidden">
                <div className="card"
                    onClick={() => setSelectedOrder(order)}
                    style={{
                        padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                        border: rowBorder, borderRadius: '16px', cursor: 'pointer',
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
                            {statusText(s.label)}
                        </span>
                        {order.priority === 'urgent' && <span className="badge" style={{ background: 'var(--color-badge-danger-bg)', color: 'var(--color-badge-danger-text)', fontWeight: 800, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Siren size={11} aria-hidden="true" /> Urgent</span>}
                        {order.priority === 'vip' && <span className="badge" style={{ background: 'var(--color-badge-warning-bg)', color: 'var(--color-badge-warning-text)', fontWeight: 800, fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={11} aria-hidden="true" /> VIP</span>}
                        {(() => {
                            const pStatus = order.payment_status || 'unpaid'
                            const conf = PAYMENT_STATUS_CONFIG[pStatus] || PAYMENT_STATUS_CONFIG.unpaid
                            const Icon = conf.icon
                            return (
                                <span className="badge" style={{ background: conf.bg, color: conf.text, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    <Icon size={11} />
                                    {conf.label}
                                </span>
                            )
                        })()}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-muted)', fontSize: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '10px', marginTop: '2px' }}>
                        <div>
                            {order.customer_contact && <div style={{ marginBottom: '2px', display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} aria-hidden="true" /> {order.customer_contact}</div>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarDays size={12} aria-hidden="true" /> {formatPickupDate(pickupDate)}</div>
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
                        background: 'white', borderRadius: '12px', border: rowBorder,
                        cursor: 'pointer', transition: 'all 0.15s', marginBottom: '4px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = hoverBorderColor}
                    onMouseLeave={e => e.currentTarget.style.borderColor = order.priority === 'urgent' ? 'var(--color-error)' : order.priority === 'vip' ? 'var(--color-gold)' : 'var(--color-border)'}
                >
                    {/* Client */}
                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{order.customer_name}</span>
                        {order.customer_id && <span style={{ fontSize: '0.65rem', color: 'var(--color-badge-crm-text)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}><BadgeCheck size={10} /> Client CRM</span>}
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
                        {(() => {
                            const pStatus = order.payment_status || 'unpaid'
                            const conf = PAYMENT_STATUS_CONFIG[pStatus] || PAYMENT_STATUS_CONFIG.unpaid
                            const Icon = conf.icon
                            return (
                                <span className="badge" style={{ background: conf.bg, color: conf.text, fontWeight: 700 }}>
                                    <Icon size={11} style={{ marginRight: '4px' }} />
                                    {conf.label}
                                </span>
                            )
                        })()}
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

    // 4. Rendu de l'en-tête de tableau pour les ventes vitrine
    function renderVitrineHeader() {
        return (
            <div className="hidden md:flex" style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '12px 20px',
                background: 'var(--color-well)', borderRadius: '12px', border: '1.5px solid var(--color-border)',
                fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '4px'
            }}>
                <div style={{ flex: 1.5 }}>Réf / ID</div>
                <div style={{ flex: 2 }}>Client</div>
                <div style={{ flex: 1.5 }}>Montant</div>
                <div style={{ flex: 1.5 }}>Mode Paiement</div>
                <div style={{ flex: 2 }}>Date / Heure</div>
                <div style={{ flex: 2 }}>Articles</div>
                <div style={{ flex: 1.5 }}>Enregistré par</div>
                <div style={{ width: '60px', textAlign: 'center' }}>Action</div>
            </div>
        )
    }

    // 5. Rendu d'une ligne de vente vitrine (Responsive card/table row)
    function renderVitrineRow(tx: VitrineSaleTransaction) {
        const formattedDate = tx.created_at ? new Date(tx.created_at).toLocaleString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }) : '—'
        const shortId = tx.id.substring(0, 8).toUpperCase()
        const isDeleting = deletingId === tx.id

        // Rendu Mobile
        const mobileView = (
            <div className="block md:hidden">
                <div className="card"
                    style={{
                        padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                        border: '1.5px solid var(--color-border)', borderRadius: '16px',
                        boxShadow: 'var(--shadow-sm)', background: 'white', marginBottom: '8px',
                        opacity: isDeleting ? 0.5 : 1
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text)' }}>
                            {tx.client_name || 'Client Vitrine'}
                        </span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                            {Number(tx.amount).toLocaleString('fr-FR')} {currency}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ background: 'var(--color-secondary-container)', color: 'var(--color-secondary)', fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: '99px' }}>
                            Ref: {shortId}
                        </span>
                        <span className="badge" style={{ background: 'var(--color-well)', color: 'var(--color-text)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <CreditCard size={11} aria-hidden="true" /> {tx.payment_method?.toUpperCase()}
                        </span>
                    </div>

                    {tx.transaction_items && tx.transaction_items.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {tx.transaction_items.map((item: TransactionItem) => (
                                <span key={item.id} style={{ background: 'var(--color-well)', borderRadius: '99px', padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                    {item.quantity}× {item.name}
                                </span>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-muted)', fontSize: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '10px', marginTop: '2px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarDays size={12} aria-hidden="true" /> {formattedDate}</div>
                            {tx.creator_profile && <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: 4 }}><User size={12} aria-hidden="true" /> {tx.creator_profile.full_name} ({tx.creator_profile.role_slug})</div>}
                        </div>
                        {(roleSlug === 'gerant' || roleSlug === 'super_admin') && (
                            <button 
                                onClick={() => setVitrineToDelete({ id: tx.id, amount: Number(tx.amount), clientName: tx.client_name })}
                                className="btn-secondary" 
                                disabled={isDeleting}
                                style={{ color: 'var(--color-error)', minHeight: '32px', height: '32px', padding: '0 12px', fontSize: '0.75rem', border: '1px solid var(--color-badge-danger-bg)', background: 'var(--color-badge-danger-bg)' }}
                            >
                                Supprimer
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )

        // Rendu Desktop
        const desktopView = (
            <div className="hidden md:block">
                <div
                    style={{
                        display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '14px 20px',
                        background: 'white', borderRadius: '12px', border: '1.5px solid var(--color-border)',
                        transition: 'all 0.15s', marginBottom: '4px', opacity: isDeleting ? 0.5 : 1
                    }}
                >
                    {/* Réf */}
                    <div style={{ flex: 1.5, fontWeight: 700, color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                        {shortId}
                    </div>

                    {/* Client */}
                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{tx.client_name || 'Client Vitrine'}</span>
                    </div>

                    {/* Montant */}
                    <div style={{ flex: 1.5, fontWeight: 800, color: 'var(--color-primary)' }}>
                        {Number(tx.amount).toLocaleString('fr-FR')} {currency}
                    </div>

                    {/* Mode Paiement */}
                    <div style={{ flex: 1.5 }}>
                        <span className="badge" style={{ background: 'var(--color-well)', color: 'var(--color-text)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <CreditCard size={11} aria-hidden="true" /> {tx.payment_method?.toUpperCase()}
                        </span>
                    </div>

                    {/* Date / Heure */}
                    <div style={{ flex: 2, fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                        {formattedDate}
                    </div>

                    {/* Articles */}
                    <div style={{ flex: 2, display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {tx.transaction_items?.map((item: TransactionItem) => (
                            <span key={item.id} style={{ background: 'var(--color-well)', borderRadius: '99px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                {item.quantity}× {item.name}
                            </span>
                        ))}
                    </div>

                    {/* Vendeur */}
                    <div style={{ flex: 1.5, fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                        {tx.creator_profile?.full_name || '—'}
                    </div>

                    {/* Actions */}
                    <div style={{ width: '60px', display: 'flex', justifyContent: 'center' }}>
                        {(roleSlug === 'gerant' || roleSlug === 'super_admin') ? (
                            <button 
                                onClick={() => setVitrineToDelete({ id: tx.id, amount: Number(tx.amount), clientName: tx.client_name })}
                                className="btn-secondary" 
                                disabled={isDeleting}
                                style={{ color: 'var(--color-error)', minHeight: '36px', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-badge-danger-bg)', border: 'none', padding: 0 }}
                            >
                                <Trash2 size={16} />
                            </button>
                        ) : (
                            <span style={{ color: 'var(--color-muted)' }}>—</span>
                        )}
                    </div>
                </div>
            </div>
        )

        return (
            <div key={tx.id}>
                {mobileView}
                {desktopView}
            </div>
        )
    }
}
