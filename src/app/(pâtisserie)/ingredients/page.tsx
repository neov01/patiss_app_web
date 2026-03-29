import { createClient } from '@/lib/supabase/server'
import { AlertTriangle, Package, Plus } from 'lucide-react'
import IngredientModal from '@/components/inventory/IngredientModal'
import StockMovementModal from '@/components/inventory/StockMovementModal'

export default async function IngredientsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('organization_id, organizations(currency_symbol)').eq('id', user.id).single()
    const { data: ingredients } = await supabase
        .from('ingredients')
        .select('*')
        .eq('organization_id', profile?.organization_id!)
        .order('name')

    const currency = (profile?.organizations as any)?.currency_symbol || 'FCFA'

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Ingrédients</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {ingredients?.length ?? 0} matières premières
                    </p>
                </div>
                <IngredientModal mode="create" />
            </div>

            {/* Alertes */}
            {ingredients && ingredients.filter(i => i.current_stock < i.alert_threshold).length > 0 && (
                <div style={{
                    background: '#FEF2F2', border: '1.5px solid #FECACA',
                    borderRadius: 'var(--radius-md)', padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px',
                }}>
                    <AlertTriangle size={18} color="#D94F38" />
                    <span style={{ fontSize: '0.875rem', color: '#991B1B', fontWeight: 500 }}>
                        {ingredients.filter(i => i.current_stock < i.alert_threshold).length} ingrédient(s) sous le seuil d&apos;alerte
                    </span>
                </div>
            )}

            {/* Tableau */}
            {!ingredients || ingredients.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <Package size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucun ingrédient</p>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>Ajoutez vos matières premières pour calculer le food-cost.</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-cream)', borderBottom: '1.5px solid var(--color-border)' }}>
                                    {['Ingrédient', 'Unité', 'Coût/unité', 'Stock actuel', 'Seuil alerte', 'Statut', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {ingredients.map((ing, i) => {
                                    const alert = ing.current_stock < ing.alert_threshold
                                    return (
                                        <tr key={ing.id} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'white' : 'var(--color-cream)' }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.9rem' }}>{ing.name}</td>
                                            <td style={{ padding: '12px 16px', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{ing.unit}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{ing.cost_per_unit.toLocaleString('fr-FR')} {currency}</td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.9rem', color: alert ? '#D94F38' : 'var(--color-text)' }}>
                                                {ing.current_stock} {ing.unit}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--color-muted)' }}>{ing.alert_threshold} {ing.unit}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span className={`badge ${alert ? 'badge-alert' : 'badge-ok'}`}>
                                                    {alert ? '⚠ Alerte' : '✓ OK'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <StockMovementModal ingredientId={ing.id} ingredientName={ing.name} />
                                                    <IngredientModal mode="edit" ingredient={ing} />
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
