import { createClient } from '@/lib/supabase/server'
import IngredientsClient from '@/components/inventory/IngredientsClient'

export default async function IngredientsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, organizations(currency_symbol)')
        .eq('id', user.id)
        .single()

    const orgId = profile?.organization_id!

    const { data: ingredients } = await supabase
        .from('ingredients')
        .select('*')
        .eq('organization_id', orgId)
        .order('name')

    const ingredientIds = (ingredients || []).map(i => i.id)
    const usageMap: Record<string, number> = {}
    if (ingredientIds.length > 0) {
        const { data: usage } = await supabase
            .from('product_ingredients')
            .select('ingredient_id')
            .in('ingredient_id', ingredientIds)
        for (const row of usage || []) {
            usageMap[row.ingredient_id] = (usageMap[row.ingredient_id] || 0) + 1
        }
    }

    const currency = (profile?.organizations as any)?.currency_symbol || ''

    return (
        <IngredientsClient
            initialIngredients={ingredients || []}
            usageCounts={usageMap}
            currency={currency}
        />
    )
}
