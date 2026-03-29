import { createClient } from '@/lib/supabase/server'
import { Clock, ShoppingBag, Plus } from 'lucide-react'
import OrdersClient from '@/components/orders/OrdersClient'

export default async function CommandesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('organization_id, organizations(currency_symbol)').eq('id', user.id).single()
    const currency = (profile?.organizations as any)?.currency_symbol || 'FCFA'

    const { data: orders } = await supabase
        .from('orders')
        .select('*, order_items(*, recipes(name))')
        .eq('organization_id', profile?.organization_id!)
        .order('pickup_date', { ascending: true })

    const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name, sale_price')
        .eq('organization_id', profile?.organization_id!)
        .order('name')

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Commandes</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {orders?.length ?? 0} commandes au total
                    </p>
                </div>
            </div>
            <OrdersClient orders={orders ?? []} recipes={recipes ?? []} currency={currency} />
        </div>
    )
}
