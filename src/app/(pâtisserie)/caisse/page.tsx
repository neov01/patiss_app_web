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

    // 1. Session journalière (sales_sessions)
    const { data: activeSession } = await supabase
        .from('sales_sessions')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .single()

    // 2. Commandes du jour (Pipeline + Prêtes)
    const { data: pipelineOrders } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_contact, pickup_date, deposit_amount, balance, priority, status, order_items(*, products(name))')
        .eq('organization_id', orgId)
        .in('status', ['pending', 'production', 'ready'])
        .gte('pickup_date', todayStart) // Optimisation : uniquement les commandes d'aujourd'hui et futures
        .order('pickup_date', { ascending: true })

    // 3. Métriques du jour (Ventes & Recettes)
    const { data: todayTransactions } = await supabase
        .from('transactions')
        .select('id, client_name, amount, payment_method, order_id, created_at, transaction_items(quantity)')
        .eq('organization_id', orgId)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: false })

    // CA du jour
    const caDuJour = (todayTransactions || []).reduce((acc, t) => acc + Number(t.amount), 0)
    const commandesEncaissees = (todayTransactions || []).filter(t => t.order_id !== null).length
    const ventesVitrine = (todayTransactions || []).filter(t => t.order_id === null).length
    
    // Historique (les 10 dernières)
    const recentHistory = (todayTransactions || []).slice(0, 10).map(t => ({
        id: t.id,
        client_name: t.client_name,
        amount: t.amount,
        payment_method: t.payment_method,
        created_at: t.created_at,
        is_order: t.order_id !== null,
        nb_items: t.transaction_items.reduce((s: number, i: any) => s + i.quantity, 0)
    }))

    // 4. Best-sellers (sur 30 jours, via RPC haute performance)
    const { data: rpcBestSellers } = await (supabase.rpc as any)('get_best_sellers_v2', {
        p_org_id: orgId,
        p_days_limit: 30,
        p_top_n: 8
    })

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
        />
    )
}
