import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CaisseClient from '@/components/caisse/CaisseClient'
import { startOfDay } from 'date-fns'
import type { Json } from '@/types/supabase'
import type { Session } from '@/components/caisse/SessionsHistoryClient'

type ProfileWithOrganization = {
    organization_id: string | null
    role_slug: string | null
    full_name: string | null
    organizations: { currency_symbol: string | null } | { currency_symbol: string | null }[] | null
}

type TodayTransaction = {
    id: string
    client_name: string | null
    amount: number
    payment_method: string | null
    order_id: string | null
    order_payment_id?: string | null
    customer_id: string | null
    created_at: string | null
    label_type: string | null
    orders: {
        order_number: string | null
        customer_id: string | null
        order_items?: Array<{ name: string; quantity: number }>
    } | {
        order_number: string | null
        customer_id: string | null
        order_items?: Array<{ name: string; quantity: number }>
    }[] | null
    transaction_items: Array<{ name: string; quantity: number }>
}

type HistoryPayment = {
    id: string
    order_payment_id?: string | null
    amount: number
    payment_method: string | null
    created_at: string | null
    label_type: string | null
}

type GroupedTransaction = {
    id: string
    client_name: string | null
    is_order: boolean
    order_number: string | null
    has_crm: boolean
    nb_items: number
    items_summary: string
    created_at: string | null
    payments: HistoryPayment[]
}

type BestSeller = {
    id: string
    name: string
    selling_price: number
    stock_qty: number
    total_sold: number
}

function getCurrencySymbol(profile: ProfileWithOrganization): string {
    const org = Array.isArray(profile.organizations) ? profile.organizations[0] : profile.organizations
    return org?.currency_symbol || ''
}

function getOrderNumber(orders: TodayTransaction['orders']): string | null {
    const order = Array.isArray(orders) ? orders[0] : orders
    return order?.order_number || null
}

function getOrderCustomerId(orders: TodayTransaction['orders']): string | null {
    const order = Array.isArray(orders) ? orders[0] : orders
    return order?.customer_id || null
}

function getOrderItemCount(transaction: TodayTransaction): number {
    const order = Array.isArray(transaction.orders) ? transaction.orders[0] : transaction.orders
    const orderItems = order?.order_items || []
    if (orderItems.length > 0) return orderItems.reduce((sum, item) => sum + item.quantity, 0)
    return transaction.transaction_items.reduce((sum, item) => sum + item.quantity, 0)
}

function getItemsSummary(transaction: TodayTransaction): string {
    const order = Array.isArray(transaction.orders) ? transaction.orders[0] : transaction.orders
    const orderItems = order?.order_items || []
    if (orderItems.length > 0) {
        return orderItems.map(item => `${item.quantity} ${item.name || 'Article'}`).join(', ')
    }
    const txItems = transaction.transaction_items || []
    if (txItems.length > 0) {
        return txItems.map(item => `${item.quantity} ${item.name || 'Article'}`).join(', ')
    }
    return '0 article'
}

function getPaymentIdentity(payment: HistoryPayment): string {
    if (payment.order_payment_id) return `order-payment:${payment.order_payment_id}`
    return [
        payment.amount,
        payment.payment_method || '',
        payment.label_type || '',
        payment.created_at || '',
    ].join('|')
}

function addPaymentOnce(group: GroupedTransaction, payment: HistoryPayment) {
    const identity = getPaymentIdentity(payment)
    if (group.payments.some(existing => getPaymentIdentity(existing) === identity)) return
    group.payments.push(payment)
}

function parseBestSellers(value: Json): BestSeller[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((item): BestSeller[] => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const record = item as Record<string, Json>
        if (typeof record.id !== 'string' || typeof record.name !== 'string') return []
        return [{
            id: record.id,
            name: record.name,
            selling_price: Number(record.selling_price ?? 0),
            stock_qty: Number(record.stock_qty ?? 0),
            total_sold: Number(record.total_sold ?? 0),
        }]
    })
}

export default async function CaissePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('*, organizations(currency_symbol)')
        .eq('id', user.id)
        .single<ProfileWithOrganization>()

    if (!profile) redirect('/login')

    // Restreindre l'accès
    if (profile.role_slug !== 'vendeur' && profile.role_slug !== 'gerant' && profile.role_slug !== 'super_admin') {
         redirect('/dashboard')
    }

    const orgId = profile.organization_id!
    const currency = getCurrencySymbol(profile)
    const todayStart = startOfDay(new Date()).toISOString()

    // Parallelize data fetching
    const [
        { data: activeSession },
        { data: pipelineOrders },
        { data: todayTransactions },
        { data: rpcBestSellers },
        sessionsResult,
        { data: dbProducts }
    ] = await Promise.all([
        // 1. Session journalière (sales_sessions)
        supabase
            .from('sales_sessions')
            .select('*')
            .eq('organization_id', orgId)
            .eq('status', 'open')
            .single(),

        // 2. Commandes actives (Pipeline + Prêtes), y compris celles avec date de retrait passée
        supabase
            .from('orders')
            .select('id, order_number, customer_id, customer_name, customer_contact, pickup_date, deposit_amount, paid_amount, total_amount, balance, priority, status, order_items(*, products(name))')
            .eq('organization_id', orgId)
            .in('status', ['pending', 'production', 'ready', 'confirmed', 'in_preparation', 'awaiting_pickup'])
            .order('pickup_date', { ascending: true }),

        // 3. Métriques du jour (Ventes & Recettes)
        supabase
            .from('transactions')
            .select('id, client_name, amount, payment_method, order_id, order_payment_id, customer_id, created_at, label_type, orders(order_number, customer_id, order_items(name, quantity)), transaction_items(name, quantity)')
            .eq('organization_id', orgId)
            .gte('created_at', todayStart)
            .order('created_at', { ascending: false }),

        // 4. Best-sellers (sur 30 jours, via RPC haute performance)
        supabase.rpc('get_best_sellers_v2', {
            p_org_id: orgId,
            p_days_limit: 30,
            p_top_n: 8
        }),

        // 5. Historique des sessions (uniquement pour gérant/admin)
        (profile.role_slug === 'gerant' || profile.role_slug === 'super_admin')
            ? supabase
                .from('sales_sessions')
                .select(`
                    *,
                    opened_by_profile:profiles!sales_sessions_opened_by_fkey(full_name, role_slug),
                    closed_by_profile:profiles!sales_sessions_closed_by_fkey(full_name, role_slug)
                `)
                .eq('organization_id', orgId)
                .order('opened_at', { ascending: false })
            : Promise.resolve({ data: null, error: null }),

        // 6. Tous les produits actifs de l'organisation
        supabase
            .from('products')
            .select('id, name, selling_price, current_stock, category')
            .eq('organization_id', orgId)
            .eq('is_active', true)
            .order('name')
    ]);

    const sessions = (sessionsResult?.data || []) as Session[]
    const transactions = (todayTransactions || []) as TodayTransaction[]

    // CA du jour (inclut acomptes + soldes = argent réellement reçu)
    const caDuJour = transactions.reduce((acc, t) => acc + Number(t.amount), 0)
    // Compter uniquement les SOLDE (pas les ACOMPTE) pour éviter de compter 2x la même commande
    const commandesEncaissees = transactions.filter(t => t.order_id !== null && t.label_type === 'SOLDE').length
    const ventesVitrine = transactions.filter(t => t.order_id === null).length

    // Regroupement des transactions du jour par commande
    const groupedTransactions: GroupedTransaction[] = []
    const orderGroups = new Map<string, GroupedTransaction>()

    for (const t of transactions) {
        if (t.order_id) {
            if (!orderGroups.has(t.order_id)) {
                // C'est le mouvement le plus récent pour cette commande aujourd'hui
                const group = {
                    id: t.id,
                    client_name: t.client_name,
                    is_order: true,
                    order_number: getOrderNumber(t.orders),
                    has_crm: !!(t.customer_id || getOrderCustomerId(t.orders)),
                    nb_items: getOrderItemCount(t),
                    items_summary: getItemsSummary(t),
                    created_at: t.created_at,
                    payments: [
                        {
                            id: t.id,
                            order_payment_id: t.order_payment_id,
                            amount: Number(t.amount),
                            payment_method: t.payment_method,
                            created_at: t.created_at,
                            label_type: t.label_type
                        }
                    ]
                }
                orderGroups.set(t.order_id, group)
                groupedTransactions.push(group)
            } else {
                // Il y a déjà un groupe pour cette commande, on ajoute ce paiement plus ancien
                const group = orderGroups.get(t.order_id)
                if (!group) continue
                addPaymentOnce(group, {
                    id: t.id,
                    order_payment_id: t.order_payment_id,
                    amount: Number(t.amount),
                    payment_method: t.payment_method,
                    created_at: t.created_at,
                    label_type: t.label_type
                })
            }
        } else {
            // Vente directe sans commande
            groupedTransactions.push({
                id: t.id,
                client_name: t.client_name,
                is_order: false,
                order_number: null,
                has_crm: !!t.customer_id,
                nb_items: t.transaction_items.reduce((s, i) => s + i.quantity, 0),
                items_summary: getItemsSummary(t),
                created_at: t.created_at,
                payments: [
                    {
                        id: t.id,
                        order_payment_id: t.order_payment_id,
                        amount: Number(t.amount),
                        payment_method: t.payment_method,
                        created_at: t.created_at,
                        label_type: t.label_type
                    }
                ]
            })
        }
    }

    const recentHistory = groupedTransactions.slice(0, 10)

    // Best-sellers fetched in parallel above

    const bestSellers = parseBestSellers(rpcBestSellers).map((b) => ({
        id: b.id,
        name: b.name,
        selling_price: Number(b.selling_price),
        stock_qty: b.stock_qty,
        quantity: Number(b.total_sold)
    }))

    const initialProducts = (dbProducts || []).map(p => ({
        id: p.id,
        name: p.name,
        selling_price: Number(p.selling_price),
        current_stock: p.current_stock,
        category: p.category || '',
    }))

    return (
        <CaisseClient 
            organizationId={orgId}
            currency={currency}
            profileName={profile.full_name || ''}
            activeSession={activeSession}
            readyOrders={pipelineOrders || []}
            caDuJour={caDuJour}
            commandesEncaissees={commandesEncaissees}
            ventesVitrine={ventesVitrine}
            recentHistory={recentHistory}
            bestSellers={bestSellers}
            sessions={sessions}
            roleSlug={profile.role_slug}
            initialProducts={initialProducts}
        />
    )
}
