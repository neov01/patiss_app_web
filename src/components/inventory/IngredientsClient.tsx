'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Package, RefreshCw, EyeOff, Eye, Trash2 } from 'lucide-react'
import IngredientModal from '@/components/inventory/IngredientModal'
import StockMovementModal from '@/components/inventory/StockMovementModal'
import Pagination from '@/components/ui/Pagination'
import { toggleIngredientStatus } from '@/lib/actions/inventory'
import { toast } from 'sonner'

const PAGE_SIZE = 20

interface Props {
    initialIngredients: any[]
    totalCount: number
    alertCount: number
    currency: string
    currentPage: number
}

export default function IngredientsClient({ 
    initialIngredients, 
    totalCount: initialTotalCount, 
    alertCount: initialAlertCount, 
    currency,
    currentPage
}: Props) {
    const [view, setView] = useState<'active' | 'inactive'>('active')
    const [isPending, startTransition] = useTransition()

    const ingredients = initialIngredients.filter(ing => 
        view === 'active' ? ing.is_active !== false : ing.is_active === false
    )

    const handleToggleStatus = async (id: string, currentStatus: boolean) => {
        const newStatus = !currentStatus
        if (!confirm(`Voulez-vous ${newStatus ? 'réactiver' : 'désactiver'} cet ingrédient ?`)) return

        startTransition(async () => {
            const result = await toggleIngredientStatus(id, newStatus)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(`Ingrédient ${newStatus ? 'réactivé' : 'désactivé'} !`)
            }
        })
    }

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Ingrédients</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {initialTotalCount} matières premières au total
                    </p>
                </div>
                <IngredientModal mode="create" />
            </div>

            {/* Onglets Actifs / Archivés */}
            <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '20px',
                background: 'var(--color-cream)',
                padding: '4px',
                borderRadius: 'var(--radius-md)',
                width: 'fit-content'
            }}>
                <button 
                    onClick={() => setView('active')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: view === 'active' ? 'white' : 'transparent',
                        color: view === 'active' ? 'var(--color-text)' : 'var(--color-muted)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        boxShadow: view === 'active' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <Eye size={14} />
                    Actifs
                </button>
                <button 
                    onClick={() => setView('inactive')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: view === 'inactive' ? 'white' : 'transparent',
                        color: view === 'inactive' ? 'var(--color-text)' : 'var(--color-muted)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        boxShadow: view === 'inactive' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <EyeOff size={14} />
                    Désactivés
                </button>
            </div>

            {/* Alertes Globales (seulement pour les actifs) */}
            {view === 'active' && initialAlertCount > 0 && (
                <div style={{
                    background: '#FEF2F2', border: '1.5px solid #FECACA',
                    borderRadius: 'var(--radius-md)', padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px',
                }}>
                    <AlertTriangle size={18} color="#D94F38" />
                    <span style={{ fontSize: '0.875rem', color: '#991B1B', fontWeight: 500 }}>
                        {initialAlertCount} ingrédient(s) sous le seuil d&apos;alerte (Totalité du catalogue)
                    </span>
                </div>
            )}

            {/* Tableau */}
            {ingredients.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <Package size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>
                        {view === 'active' ? 'Aucun ingrédient actif' : 'Aucun ingrédient désactivé'}
                    </p>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>
                        {view === 'active' 
                            ? 'Ajoutez vos matières premières pour calculer le food-cost.' 
                            : 'Les ingrédients désactivés apparaîtront ici.'}
                    </p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-cream)', borderBottom: '1.5px solid var(--color-border)' }}>
                                    {[
                                        'Ingrédient', 
                                        'Unité', 
                                        'Coût/unité', 
                                        'Stock actuel', 
                                        'Seuil alerte', 
                                        'Statut', 
                                        'Actions'
                                    ].map(h => (
                                         <th key={h} style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                             {h}
                                         </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {ingredients.map((ing, i) => {
                                    const alert = ing.current_stock < ing.alert_threshold
                                    const isActive = ing.is_active !== false
                                    return (
                                        <tr key={ing.id} style={{ 
                                            borderBottom: '1px solid var(--color-border)', 
                                            background: i % 2 === 0 ? 'white' : 'var(--color-cream)',
                                            opacity: isActive ? 1 : 0.7
                                        }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.9rem' }}>
                                                {ing.name}
                                                {!isActive && <span style={{ marginLeft: '8px', fontSize: '0.65rem', color: 'var(--color-muted)', textTransform: 'uppercase' }}>(Désactivé)</span>}
                                            </td>
                                            <td style={{ padding: '12px 16px', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{ing.unit}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{Number(ing.cost_per_unit || 0).toLocaleString('fr-FR')} {currency}</td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.9rem', color: (alert && isActive) ? '#D94F38' : 'var(--color-text)' }}>
                                                {ing.current_stock} {ing.unit}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--color-muted)' }}>{ing.alert_threshold} {ing.unit}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span className={`badge ${isActive ? (alert ? 'badge-alert' : 'badge-ok') : 'badge-muted'}`}>
                                                    {!isActive ? 'Archivé' : (alert ? '⚠ Alerte' : '✓ OK')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    {isActive ? (
                                                        <>
                                                            <StockMovementModal ingredientId={ing.id} ingredientName={ing.name} />
                                                            <IngredientModal mode="edit" ingredient={ing} />
                                                            <button 
                                                                onClick={() => handleToggleStatus(ing.id, true)} 
                                                                className="btn-ghost" 
                                                                title="Désactiver"
                                                                style={{ color: '#D94F38', minHeight: '36px', padding: '0 8px' }}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handleToggleStatus(ing.id, false)} 
                                                            className="btn-ghost" 
                                                            title="Réactiver"
                                                            style={{ color: '#C4836A', minHeight: '36px', padding: '0 8px', gap: '6px' }}
                                                        >
                                                            <RefreshCw size={16} className={isPending ? 'animate-spin' : ''} />
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Réactiver</span>
                                                        </button>
                                                    )}
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
            <Pagination totalCount={initialTotalCount} pageSize={PAGE_SIZE} />
        </div>
    )
}
