import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, Package } from 'lucide-react'

export default async function ProductionPlan({
    organizationId,
    startDate
}: {
    organizationId: string
    startDate: string
}) {
    const supabase = await createClient()

    // Date de fin (demain minuit) pour inclure toutes les commandes d'aujourd'hui
    const endDateObj = new Date(startDate)
    endDateObj.setDate(endDateObj.getDate() + 1)
    const endDate = endDateObj.toISOString()

    // Récupération des commandes en attente ou en production avec leurs recettes et ingrédients
    const { data: orders } = await supabase
        .from('orders')
        .select(`
            id,
            status,
            pickup_date,
            order_items (
                quantity,
                products (
                    id,
                    name,
                    product_ingredients (
                        quantity_required,
                        ingredients (
                            id,
                            name,
                            unit,
                            current_stock
                        )
                    )
                )
            )
        `)
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'production'])
        .gte('pickup_date', startDate)
        .lt('pickup_date', endDate)

    if (!orders || orders.length === 0) {
        return (
            <div style={{ marginTop: '24px', padding: '24px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
                <CheckCircle2 color="#10b981" size={48} style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.2rem', color: '#374151' }}>Aucune production urgente</h3>
                <p style={{ color: '#6b7280' }}>Il n'y a pas de commandes en attente pour cette période.</p>
            </div>
        )
    }

    // Agréger les recettes à préparer
    const productsToMake: Record<string, { name: string, quantity: number }> = {}
    
    // Agréger les ingrédients nécessaires
    const aggregatedIngredients: Record<string, { 
        name: string, 
        unit: string, 
        totalRequired: number, 
        currentStock: number 
    }> = {}

    orders.forEach(order => {
        order.order_items.forEach((item: any) => {
            const product = item.products
            if (!product) return

            // Agréger la recette
            if (!productsToMake[product.id]) {
                productsToMake[product.id] = { name: product.name, quantity: 0 }
            }
            productsToMake[product.id].quantity += item.quantity

            // Agréger les ingrédients
            product.product_ingredients.forEach((ri: any) => {
                const ingredient = ri.ingredients
                if (!ingredient) return

                const totalNeededForThisItem = ri.quantity_required * item.quantity

                if (!aggregatedIngredients[ingredient.id]) {
                    aggregatedIngredients[ingredient.id] = {
                        name: ingredient.name,
                        unit: ingredient.unit,
                        totalRequired: 0,
                        currentStock: ingredient.current_stock
                    }
                }
                aggregatedIngredients[ingredient.id].totalRequired += totalNeededForThisItem
            })
        })
    })

    const productList = Object.values(productsToMake).sort((a, b) => b.quantity - a.quantity)
    const ingredientList = Object.values(aggregatedIngredients).sort((a, b) => b.totalRequired - a.totalRequired)

    return (
        <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={20} color="#C4836A" />
                Plan de Production ({new Date(startDate).toLocaleDateString('fr-FR')})
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                {/* Résumé des Gâteaux à produire */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '16px' }}>
                        Recettes à préparer
                    </h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {productList.map((r, idx) => (
                            <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: idx < productList.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                                <span style={{ fontWeight: 500 }}>{r.name}</span>
                                <span style={{ background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: '20px', fontSize: '0.875rem', fontWeight: 700 }}>
                                    x {r.quantity}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Synthèse des ingrédients requis */}
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '16px' }}>
                        Ingrédients totaux nécessaires
                    </h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {ingredientList.map((ing, idx) => {
                            const isShortage = ing.totalRequired > ing.currentStock
                            return (
                                <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: idx < ingredientList.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 500, color: isShortage ? '#DC2626' : 'inherit' }}>{ing.name}</span>
                                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                            Stock actuel : {ing.currentStock} {ing.unit}
                                        </span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontWeight: 700, fontSize: '1.1rem', color: isShortage ? '#DC2626' : '#2563EB' }}>
                                            {ing.totalRequired.toFixed(2)}
                                        </span>
                                        <span style={{ fontSize: '0.875rem', color: '#6b7280', marginLeft: '4px' }}>{ing.unit}</span>
                                        {isShortage && <div style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>Rupture !</div>}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </div>
        </div>
    )
}
