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

    // On récupère toutes les recettes de l'organisation
    const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name, sale_price')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })

    return (
        <VitrineSalesClient recipes={recipes || []} currency={currency} />
    )
}
