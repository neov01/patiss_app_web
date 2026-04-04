import { createClient } from '@/lib/supabase/server'
import CatalogueClient from '@/components/catalogue/CatalogueClient'
import CatalogueHeader from '@/components/catalogue/CatalogueHeader'

export default async function CataloguePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('organization_id, organizations(currency_symbol)').eq('id', user.id).single()
    const orgId = profile?.organization_id!
    const currency = (profile?.organizations as any)?.currency_symbol || 'FCFA'

    const [productsRes, ingredientsRes] = await Promise.all([
        (supabase.from as any)('products').select('*, product_ingredients(*, ingredients(name, unit, cost_per_unit))').eq('organization_id', orgId).order('name'),
        supabase.from('ingredients').select('id, name, unit, cost_per_unit').eq('organization_id', orgId).order('name')
    ])

    return (
        <div className="animate-fade-in p-6 max-w-7xl mx-auto">
            {/* Header avec Bouton + Modal */}
            <CatalogueHeader 
                products={productsRes.data?.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    type: p.type,
                    selling_price: p.selling_price,
                    purchase_cost: p.purchase_cost,
                    track_stock: p.track_stock,
                    current_stock: p.current_stock
                })) ?? []}
                availableIngredients={ingredientsRes.data ?? []} 
            />

            {/* Nouveau layout Grille/Chips */}
            <CatalogueClient 
                products={productsRes.data?.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    type: p.type,
                    sellingPrice: p.selling_price,
                    purchaseCost: p.purchase_cost,
                    trackStock: p.track_stock,
                    currentStock: p.current_stock,
                    current_stock: p.current_stock,
                    composition: p.product_ingredients?.map((pi: any) => ({
                        ingredientId: pi.ingredient_id,
                        quantity: pi.quantity
                    }))
                })) as any ?? []} 
                currency={currency} 
                availableIngredients={ingredientsRes.data ?? []}
            />
        </div>
    )
}
