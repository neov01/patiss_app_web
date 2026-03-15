import { createClient } from '@/lib/supabase/server'
import RecipesClient from '@/components/recipes/RecipesClient'

export default async function RecettesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    const orgId = profile?.organization_id!

    const [recipesRes, ingredientsRes] = await Promise.all([
        supabase.from('recipes').select('*, recipe_ingredients(*, ingredients(name, unit, cost_per_unit))').eq('organization_id', orgId).order('name'),
        supabase.from('ingredients').select('id, name, unit, cost_per_unit').eq('organization_id', orgId).order('name'),
    ])

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Recettes</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {recipesRes.data?.length ?? 0} recettes · Calcul automatique du Food-Cost
                    </p>
                </div>
            </div>
            <RecipesClient recipes={recipesRes.data ?? []} ingredients={ingredientsRes.data ?? []} />
        </div>
    )
}
