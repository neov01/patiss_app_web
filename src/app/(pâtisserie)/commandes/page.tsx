import { createClient } from '@/lib/supabase/server'
import OrdersClient from '@/components/orders/OrdersClient'
import type { OrderWithItems } from '@/components/orders/OrdersClient'
import { getOpenSession } from '@/lib/actions/sessions'

export default async function CommandesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role_slug, can_import_history, organizations(currency_symbol)')
        .eq('id', user.id)
        .single()

    const currency = (Array.isArray(profile?.organizations) ? profile?.organizations[0]?.currency_symbol : profile?.organizations?.currency_symbol) || ''
    const orgId = profile?.organization_id
    if (!orgId) return null

    const openSession = await getOpenSession()
    const isSessionOpen = !!openSession
    const todayStr = new Date().toISOString().split('T')[0]

    // Ne charger que les commandes de la vue "À traiter"
    let activeFilter = 'status.in.(pending,production,ready),and(status.eq.completed,payment_status.neq.SOLDEE)'
    if (isSessionOpen) {
        activeFilter += `,and(status.eq.completed,pickup_date.gte.${todayStr}T00:00:00)`
    }

    const [{ data: orders }, { data: products }] = await Promise.all([
        supabase
            .from('orders')
            .select('*, order_items(*, products(name)), creator_profile:profiles!orders_created_by_fkey(full_name, role_slug)')
            .eq('organization_id', orgId)
            .or(activeFilter)
            .order('pickup_date', { ascending: true }),
        supabase
            .from('products')
            .select('id, name, selling_price, current_stock')
            .eq('organization_id', orgId)
            .eq('is_active', true)
            .order('name')
    ]);

    return (
        <OrdersClient
            orders={(orders as OrderWithItems[] | null) ?? []}
            products={products ?? []}
            currency={currency}
            organizationId={orgId}
            roleSlug={profile?.role_slug || 'vendeur'}
            canImportHistory={profile?.can_import_history || false}
            isSessionOpen={isSessionOpen}
        />
    )
}
