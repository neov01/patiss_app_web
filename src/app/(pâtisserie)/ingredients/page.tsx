import { createClient } from '@/lib/supabase/server'
import IngredientsClient from '@/components/inventory/IngredientsClient'

const PAGE_SIZE = 20

export default async function IngredientsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const { page: pageParam } = await searchParams
    const currentPage = Number(pageParam) || 1
    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, organizations(currency_symbol)')
        .eq('id', user.id)
        .single()
    
    const orgId = profile?.organization_id!

    // On récupère tout (actifs et inactifs) pour que le client puisse filtrer
    const [ingredientsRes] = await Promise.all([
        supabase.from('ingredients')
            .select('*', { count: 'exact' })
            .eq('organization_id', orgId)
            .order('name')
            .range(from, to)
    ])

    // On récupère le nombre d'alertes uniquement sur les actifs
    const { data: allAlerts } = await supabase
        .from('ingredients')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .filter('current_stock', 'lt', 'alert_threshold' as any)

    const ingredients = ingredientsRes.data || []
    const totalCount = ingredientsRes.count || 0
    const alertCount = allAlerts?.length || 0
    const currency = (profile?.organizations as any)?.currency_symbol || ''

    return (
        <IngredientsClient 
            initialIngredients={ingredients}
            totalCount={totalCount}
            alertCount={alertCount}
            currency={currency}
            currentPage={currentPage}
        />
    )
}
