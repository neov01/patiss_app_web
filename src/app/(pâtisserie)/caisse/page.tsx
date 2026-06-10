import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CaisseClient from '@/components/caisse/CaisseClient'
import { startOfDay, subDays } from 'date-fns'

export default async function CaissePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('*, organizations(currency_symbol)')
        .eq('id', user.id)
        .single()

    if (!profile) redirect('/login')

    // Restreindre l'accès
    if (profile.role_slug !== 'vendeur' && profile.role_slug !== 'gerant' && profile.role_slug !== 'super_admin') {
         redirect('/dashboard')
    }

    const orgId = profile.organization_id!
    const currency = (profile.organizations as any)?.currency_symbol || ''
    const todayStart = startOfDay(new Date()).toISOString()
    const thirtyDaysAgo = subDays(new Date(), 30).toISOString()

    // Parallelize data fetching
    const [
        { data: activeSession },
        { data: pipelineOrders },
        { data: todayTransactions },
        { data: rpcBestSellers },
        sessionsResult
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
            .select('id, order_number, customer_id, customer_name, customer_contact, pickup_date, deposit_amount, balance, priority, status, order_items(*, products(name))')
            .eq('organization_id', orgId)
            .in('status', ['pending', 'production', 'ready'])
            .order('pickup_date', { ascending: true }),

        // 3. Métriques du jour (Ventes & Recettes)
        supabase
            .from('transactions')
            .select('id, client_name, amount, payment_method, order_id, customer_id, created_at, label_type, orders(order_number), transaction_items(quantity)')
            .eq('organization_id', orgId)
            .gte('created_at', todayStart)
            .order('created_at', { ascending: false }),

        // 4. Best-sellers (sur 30 jours, via RPC haute performance)
        (supabase.rpc as any)('get_best_sellers_v2', {
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
            : Promise.resolve({ data: null, error: null })
    ]);

    const sessions = sessionsResult?.data || []

    // CA du jour (inclut acomptes + soldes = argent réellement reçu)
    const caDuJour = (todayTransactions || []).reduce((acc, t) => acc + Number(t.amount), 0)
    // Compter uniquement les SOLDE (pas les ACOMPTE) pour éviter de compter 2x la même commande
    const commandesEncaissees = (todayTransactions || []).filter(t => t.order_id !== null && (t as any).label_type === 'SOLDE').length
    const ventesVitrine = (todayTransactions || []).filter(t => t.order_id === null).length

    // Regroupement des transactions du jour par commande
    const groupedTransactions: any[] = []
    const orderGroups = new Map<string, any>()

    for (const t of todayTransactions || []) {
        if (t.order_id) {
            if (!orderGroups.has(t.order_id)) {
                // C'est le mouvement le plus récent pour cette commande aujourd'hui
                const group = {
                    id: t.id,
                    client_name: t.client_name,
                    is_order: true,
                    order_number: (t as any).orders?.order_number || null,
                    has_crm: !!(t as any).customer_id,
                    nb_items: t.transaction_items.reduce((s: number, i: any) => s + i.quantity, 0),
                    created_at: t.created_at,
                    payments: [
                        {
                            id: t.id,
                            amount: Number(t.amount),
                            payment_method: t.payment_method,
                            created_at: t.created_at,
                            label_type: (t as any).label_type
                        }
                    ]
                }
                orderGroups.set(t.order_id, group)
                groupedTransactions.push(group)
            } else {
                // Il y a déjà un groupe pour cette commande, on ajoute ce paiement plus ancien
                const group = orderGroups.get(t.order_id)
                group.payments.push({
                    id: t.id,
                    amount: Number(t.amount),
                    payment_method: t.payment_method,
                    created_at: t.created_at,
                    label_type: (t as any).label_type
                })
            }
        } else {
            // Vente directe sans commande
            groupedTransactions.push({
                id: t.id,
                client_name: t.client_name,
                is_order: false,
                order_number: null,
                has_crm: !!(t as any).customer_id,
                nb_items: t.transaction_items.reduce((s: number, i: any) => s + i.quantity, 0),
                created_at: t.created_at,
                payments: [
                    {
                        id: t.id,
                        amount: Number(t.amount),
                        payment_method: t.payment_method,
                        created_at: t.created_at,
                        label_type: (t as any).label_type
                    }
                ]
            })
        }
    }

    const recentHistory = groupedTransactions.slice(0, 10)

    // Best-sellers fetched in parallel above

    const bestSellers = (rpcBestSellers as any[] || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        selling_price: Number(b.selling_price),
        stock_qty: b.stock_qty,
        quantity: Number(b.total_sold)
    }))

    return (
        <CaisseClient 
            organizationId={orgId}
            currency={currency}
            profileName={profile.full_name}
            activeSession={activeSession}
            readyOrders={pipelineOrders || []}
            caDuJour={caDuJour}
            commandesEncaissees={commandesEncaissees}
            ventesVitrine={ventesVitrine}
            recentHistory={recentHistory}
            bestSellers={bestSellers}
            sessions={sessions}
            roleSlug={profile.role_slug}
        />
    )
}
