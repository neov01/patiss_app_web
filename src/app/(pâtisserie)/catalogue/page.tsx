import { createClient } from '@/lib/supabase/server'
import CatalogueClient from '@/components/catalogue/CatalogueClient'
import CatalogueHeader from '@/components/catalogue/CatalogueHeader'
import type { CatalogueProduct } from '@/components/catalogue/CatalogueClient'

type ProductIngredientRow = {
    ingredient_id: string
    quantity: number
}

export default async function CataloguePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('organization_id, organizations(currency_symbol)').eq('id', user.id).single()
    const orgId = profile?.organization_id
    if (!orgId) return null
    const currency = (Array.isArray(profile?.organizations) ? profile?.organizations[0]?.currency_symbol : profile?.organizations?.currency_symbol) || ''

    const [productsRes, ingredientsRes] = await Promise.all([
        supabase.from('products').select('*, product_ingredients(*, ingredients(name, unit, cost_per_unit))').eq('organization_id', orgId).order('name'),
        supabase.from('ingredients').select('id, name, unit, cost_per_unit').eq('organization_id', orgId).order('name')
    ])

    const formattedProducts = productsRes.data?.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        type: p.type,
        selling_price: p.selling_price,
        purchase_cost: p.purchase_cost,
        track_stock: p.track_stock,
        current_stock: p.current_stock,
        image_url: p.image_url,
        is_active: p.is_active
    })) ?? []

    const fullProducts: CatalogueProduct[] = productsRes.data?.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category || 'Viennoiseries',
        type: p.type || 'maison',
        sellingPrice: p.selling_price,
        purchaseCost: p.purchase_cost ?? undefined,
        trackStock: p.track_stock ?? false,
        currentStock: p.current_stock ?? undefined,
        current_stock: p.current_stock,
        image_url: p.image_url,
        is_active: p.is_active ?? true,
            composition: (p.product_ingredients as ProductIngredientRow[] | null)?.map(pi => ({
                ingredientId: pi.ingredient_id,
                quantity: pi.quantity
            }))
    })) ?? []

    return (
        <div className="animate-fade-in p-6 max-w-7xl mx-auto">
            {/* Header avec Bouton + Modal */}
            <CatalogueHeader 
                products={formattedProducts}
                availableIngredients={ingredientsRes.data ?? []} 
            />

            {/* Nouveau layout Grille/Chips */}
            <CatalogueClient 
                products={fullProducts}
                currency={currency} 
                availableIngredients={ingredientsRes.data ?? []}
            />
        </div>
    )
}
