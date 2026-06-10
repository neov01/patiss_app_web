import { createClient } from '@/lib/supabase/server'
import VitrineSalesClient from './VitrineSalesClient'

export default async function VitrineSales({
    organizationId,
    currency
}: {
    organizationId: string
    currency: string
}) {
    const supabase = await createClient()

    // On récupère toutes les recettes de l'organisation actives
    const { data: products } = await supabase.from('products')
        .select('id, name, selling_price')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true })

    return (
        <VitrineSalesClient products={products || []} currency={currency} />
    )
}
