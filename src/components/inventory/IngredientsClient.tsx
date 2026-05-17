'use client'

import { useMemo, useState, useTransition } from 'react'
import {
    AlertTriangle,
    Package,
    RefreshCw,
    EyeOff,
    Eye,
    Archive,
    Search,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
    Filter,
    MessageCircle,
    TrendingUp,
    Wallet,
} from 'lucide-react'
import IngredientModal from '@/components/inventory/IngredientModal'
import StockMovementModal from '@/components/inventory/StockMovementModal'
import { toggleIngredientStatus } from '@/lib/actions/inventory'
import { toast } from 'sonner'

interface Props {
    initialIngredients: any[]
    usageCounts: Record<string, number>
    currency: string
}

type SortKey = 'name' | 'unit' | 'cost_per_unit' | 'current_stock' | 'alert_threshold' | 'status'
type SortDir = 'asc' | 'desc'

function stockRatio(stock: number, threshold: number) {
    if (threshold <= 0) return stock > 0 ? 2 : 0
    return stock / (threshold * 2)
}

function stockColor(ratio: number) {
    if (ratio > 1) return '#16A34A'
    if (ratio > 0.5) return '#F59E0B'
    return '#D94F38'
}

function buildWhatsAppUrl(ing: any) {
    const suggestedQty = Math.max(ing.alert_threshold * 2 - ing.current_stock, ing.alert_threshold)
    const rounded = Math.round(suggestedQty * 10) / 10
    const phone = (ing.supplier_phone || '').replace(/[^0-9]/g, '')
    const text = encodeURIComponent(
        `Bonjour, je souhaite commander ${rounded} ${ing.unit} de ${ing.name}. Merci.`
    )
    return `https://wa.me/${phone}?text=${text}`
}

export default function IngredientsClient({
    initialIngredients,
    usageCounts,
    currency,
}: Props) {
    const [view, setView] = useState<'active' | 'inactive'>('active')
    const [search, setSearch] = useState('')
    const [unitFilter, setUnitFilter] = useState<string>('all')
    const [lowStockOnly, setLowStockOnly] = useState(false)
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
    const [isPending, startTransition] = useTransition()
    const [pendingId, setPendingId] = useState<string | null>(null)

    const activeIngredients = useMemo(
        () => initialIngredients.filter(i => i.is_active !== false),
        [initialIngredients]
    )
    const alertCount = useMemo(
        () => activeIngredients.filter(i => i.current_stock < i.alert_threshold).length,
        [activeIngredients]
    )
    const totalStockValue = useMemo(
        () =>
            activeIngredients.reduce(
                (sum, i) => sum + (Number(i.current_stock) || 0) * (Number(i.cost_per_unit) || 0),
                0
            ),
        [activeIngredients]
    )

    const availableUnits = useMemo(() => {
        const set = new Set<string>()
        initialIngredients.forEach(i => set.add(i.unit))
        return Array.from(set).sort()
    }, [initialIngredients])

    const filteredAndSorted = useMemo(() => {
        const base = initialIngredients.filter(ing => {
            const matchesView = view === 'active' ? ing.is_active !== false : ing.is_active === false
            if (!matchesView) return false
            if (search.trim() && !ing.name.toLowerCase().includes(search.trim().toLowerCase())) return false
            if (unitFilter !== 'all' && ing.unit !== unitFilter) return false
            if (lowStockOnly && !(ing.current_stock < ing.alert_threshold)) return false
            return true
        })

        const dir = sort.dir === 'asc' ? 1 : -1
        base.sort((a, b) => {
            if (sort.key === 'status') {
                const aAlert = a.current_stock < a.alert_threshold ? 1 : 0
                const bAlert = b.current_stock < b.alert_threshold ? 1 : 0
                return (aAlert - bAlert) * dir
            }
            const av = a[sort.key]
            const bv = b[sort.key]
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
            return String(av ?? '').localeCompare(String(bv ?? ''), 'fr') * dir
        })
        return base
    }, [initialIngredients, view, search, unitFilter, lowStockOnly, sort])

    const handleToggleStatus = async (ing: any, currentStatus: boolean) => {
        const newStatus = !currentStatus
        let confirmMessage = `Voulez-vous ${newStatus ? 'réactiver' : 'archiver'} cet ingrédient ?`
        if (!newStatus) {
            const usage = usageCounts[ing.id] || 0
            if (usage > 0) {
                confirmMessage = `"${ing.name}" est utilisé dans ${usage} recette(s). L'archiver le retirera des produits actifs. Continuer ?`
            }
        }
        if (!confirm(confirmMessage)) return

        setPendingId(ing.id)
        startTransition(async () => {
            const result = await toggleIngredientStatus(ing.id, newStatus)
            setPendingId(null)
            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(`Ingrédient ${newStatus ? 'réactivé' : 'archivé'} !`)
            }
        })
    }

    const handleSort = (key: SortKey) => {
        setSort(prev =>
            prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
        )
    }

    const SortIcon = ({ k }: { k: SortKey }) => {
        if (sort.key !== k) return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
        return sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
    }

    const formatNumber = (n: number) => Number(n || 0).toLocaleString('fr-FR')

    return (
        <div className="animate-fade-in ingredients-page">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Ingrédients</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {initialIngredients.length} matières premières au total
                    </p>
                </div>
                <IngredientModal mode="create" existingNames={initialIngredients.map((i: any) => i.name)} />
            </div>

            {/* Cartes KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#F5EBE0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={20} color="#8B5E3C" />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actifs</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{activeIngredients.length}</div>
                    </div>
                </div>
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderColor: alertCount > 0 ? '#FECACA' : undefined }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: alertCount > 0 ? '#FEF2F2' : '#F5F5F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AlertTriangle size={20} color={alertCount > 0 ? '#D94F38' : '#9C8070'} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>En alerte</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: alertCount > 0 ? '#D94F38' : 'var(--color-text)' }}>{alertCount}</div>
                    </div>
                </div>
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Wallet size={20} color="#16A34A" />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valeur du stock</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatNumber(totalStockValue)} <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{currency}</span></div>
                    </div>
                </div>
            </div>

            {/* Onglets Actifs / Archivés */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '16px',
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
                    Archivés
                </button>
            </div>

            {/* Recherche + filtres */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: '14px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                        <Search size={16} color="#9C8070" />
                    </div>
                    <input
                        type="text"
                        placeholder="Rechercher un ingrédient (farine, beurre…)"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 14px 10px 40px',
                            borderRadius: '9999px',
                            border: '1.5px solid var(--color-border)',
                            background: 'white',
                            fontSize: '0.875rem',
                            outline: 'none',
                        }}
                    />
                </div>
                {availableUnits.length > 1 && (
                    <select
                        value={unitFilter}
                        onChange={e => setUnitFilter(e.target.value)}
                        style={{
                            padding: '10px 14px',
                            borderRadius: '9999px',
                            border: '1.5px solid var(--color-border)',
                            background: 'white',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                        }}
                    >
                        <option value="all">Toutes unités</option>
                        {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                )}
                {view === 'active' && (
                    <button
                        onClick={() => setLowStockOnly(v => !v)}
                        style={{
                            padding: '10px 14px',
                            borderRadius: '9999px',
                            border: '1.5px solid',
                            borderColor: lowStockOnly ? '#FECACA' : 'var(--color-border)',
                            background: lowStockOnly ? '#FEF2F2' : 'white',
                            color: lowStockOnly ? '#991B1B' : 'var(--color-text)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <Filter size={14} />
                        Stock faible uniquement
                    </button>
                )}
            </div>

            {/* Alerte globale */}
            {view === 'active' && alertCount > 0 && !lowStockOnly && (
                <div style={{
                    background: '#FEF2F2', border: '1.5px solid #FECACA',
                    borderRadius: 'var(--radius-md)', padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
                }}>
                    <AlertTriangle size={18} color="#D94F38" />
                    <span style={{ fontSize: '0.875rem', color: '#991B1B', fontWeight: 500, flex: 1 }}>
                        {alertCount} ingrédient(s) sous le seuil d&apos;alerte
                    </span>
                    <button
                        onClick={() => setLowStockOnly(true)}
                        style={{
                            background: 'transparent', border: 'none', color: '#991B1B',
                            fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline',
                        }}
                    >
                        Voir
                    </button>
                </div>
            )}

            {/* Tableau (desktop) / Cartes (mobile) */}
            {filteredAndSorted.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <Package size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>
                        {search || unitFilter !== 'all' || lowStockOnly
                            ? 'Aucun résultat'
                            : (view === 'active' ? 'Aucun ingrédient actif' : 'Aucun ingrédient archivé')}
                    </p>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>
                        {search || unitFilter !== 'all' || lowStockOnly
                            ? 'Essayez de modifier vos filtres.'
                            : (view === 'active'
                                ? 'Ajoutez vos matières premières pour calculer le food-cost.'
                                : 'Les ingrédients archivés apparaîtront ici.')}
                    </p>
                </div>
            ) : (
                <>
                    {/* Vue tableau (desktop) */}
                    <div className="ingredients-table card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-cream)', borderBottom: '1.5px solid var(--color-border)' }}>
                                        {([
                                            ['name', 'Ingrédient'],
                                            ['unit', 'Unité'],
                                            ['cost_per_unit', 'Coût/unité'],
                                            ['current_stock', 'Stock actuel'],
                                            ['alert_threshold', 'Seuil alerte'],
                                            ['status', 'Statut'],
                                        ] as [SortKey, string][]).map(([key, label]) => (
                                            <th
                                                key={key}
                                                onClick={() => handleSort(key)}
                                                style={{
                                                    padding: '12px 16px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    color: 'var(--color-muted)',
                                                    textAlign: 'left',
                                                    whiteSpace: 'nowrap',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                    {label}
                                                    <SortIcon k={key} />
                                                </span>
                                            </th>
                                        ))}
                                        <th style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSorted.map((ing, i) => {
                                        const alert = ing.current_stock < ing.alert_threshold
                                        const isActive = ing.is_active !== false
                                        const ratio = stockRatio(ing.current_stock, ing.alert_threshold)
                                        const barColor = stockColor(ratio)
                                        const barWidth = Math.min(100, Math.max(4, ratio * 50))
                                        const hasSupplierPhone = !!(ing.supplier_phone && ing.supplier_phone.replace(/[^0-9]/g, '').length >= 6)
                                        return (
                                            <tr key={ing.id} style={{
                                                borderBottom: '1px solid var(--color-border)',
                                                background: i % 2 === 0 ? 'white' : 'var(--color-cream)',
                                                opacity: isActive ? 1 : 0.7
                                            }}>
                                                <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: 600 }}>{ing.name}</span>
                                                        {isActive && alert && (
                                                            <span style={{ background: '#FEF2F2', color: '#991B1B', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                Stock faible
                                                            </span>
                                                        )}
                                                        {!isActive && <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', textTransform: 'uppercase' }}>(Archivé)</span>}
                                                    </div>
                                                    {ing.supplier_name && (
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                                                            Fournisseur : {ing.supplier_name}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{ing.unit}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{formatNumber(ing.cost_per_unit)} {currency}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '0.9rem', minWidth: '140px' }}>
                                                    <div style={{ fontWeight: 600, color: (alert && isActive) ? '#D94F38' : 'var(--color-text)' }}>
                                                        {formatNumber(ing.current_stock)} {ing.unit}
                                                    </div>
                                                    <div style={{ height: '4px', background: '#F1E9E0', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${barWidth}%`, height: '100%', background: barColor, borderRadius: '2px', transition: 'width 0.3s' }} />
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--color-muted)' }}>{formatNumber(ing.alert_threshold)} {ing.unit}</td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span className={`badge ${isActive ? (alert ? 'badge-alert' : 'badge-ok') : 'badge-muted'}`}>
                                                        {!isActive ? 'Archivé' : (alert ? '⚠ Alerte' : '✓ OK')}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        {isActive ? (
                                                            <>
                                                                {alert && hasSupplierPhone && (
                                                                    <a
                                                                        href={buildWhatsAppUrl(ing)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        title={`Commander via WhatsApp (${ing.supplier_name || 'fournisseur'})`}
                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: '#25D366', color: 'white', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', minHeight: '36px' }}
                                                                    >
                                                                        <MessageCircle size={14} />
                                                                        Commander
                                                                    </a>
                                                                )}
                                                                <StockMovementModal ingredientId={ing.id} ingredientName={ing.name} currentStock={ing.current_stock} unit={ing.unit} />
                                                                <IngredientModal mode="edit" ingredient={ing} />
                                                                <button
                                                                    onClick={() => handleToggleStatus(ing, true)}
                                                                    className="btn-ghost"
                                                                    title="Archiver"
                                                                    disabled={isPending && pendingId === ing.id}
                                                                    style={{ color: 'var(--color-muted)', minHeight: '36px', padding: '0 8px' }}
                                                                >
                                                                    <Archive size={16} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleToggleStatus(ing, false)}
                                                                className="btn-ghost"
                                                                title="Réactiver"
                                                                disabled={isPending && pendingId === ing.id}
                                                                style={{ color: '#C4836A', minHeight: '36px', padding: '0 8px', gap: '6px' }}
                                                            >
                                                                <RefreshCw size={16} className={isPending && pendingId === ing.id ? 'animate-spin' : ''} />
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

                    {/* Vue cartes (mobile) */}
                    <div className="ingredients-cards" style={{ display: 'none', flexDirection: 'column', gap: '12px' }}>
                        {filteredAndSorted.map(ing => {
                            const alert = ing.current_stock < ing.alert_threshold
                            const isActive = ing.is_active !== false
                            const ratio = stockRatio(ing.current_stock, ing.alert_threshold)
                            const barColor = stockColor(ratio)
                            const barWidth = Math.min(100, Math.max(4, ratio * 50))
                            const hasSupplierPhone = !!(ing.supplier_phone && ing.supplier_phone.replace(/[^0-9]/g, '').length >= 6)
                            return (
                                <div key={ing.id} className="card" style={{ padding: '14px 16px', opacity: isActive ? 1 : 0.7 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ing.name}</div>
                                            {ing.supplier_name && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                                                    Fournisseur : {ing.supplier_name}
                                                </div>
                                            )}
                                        </div>
                                        <span className={`badge ${isActive ? (alert ? 'badge-alert' : 'badge-ok') : 'badge-muted'}`}>
                                            {!isActive ? 'Archivé' : (alert ? '⚠ Alerte' : '✓ OK')}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                                        <span style={{ color: 'var(--color-muted)' }}>Stock</span>
                                        <span style={{ fontWeight: 700, color: (alert && isActive) ? '#D94F38' : 'var(--color-text)' }}>
                                            {formatNumber(ing.current_stock)} / seuil {formatNumber(ing.alert_threshold)} {ing.unit}
                                        </span>
                                    </div>
                                    <div style={{ height: '6px', background: '#F1E9E0', borderRadius: '3px', marginBottom: '10px', overflow: 'hidden' }}>
                                        <div style={{ width: `${barWidth}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '12px' }}>
                                        <span>Coût : <strong style={{ color: 'var(--color-text)' }}>{formatNumber(ing.cost_per_unit)} {currency}/{ing.unit}</strong></span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {isActive ? (
                                            <>
                                                {alert && hasSupplierPhone && (
                                                    <a
                                                        href={buildWhatsAppUrl(ing)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '8px 12px', background: '#25D366', color: 'white', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none' }}
                                                    >
                                                        <MessageCircle size={14} />
                                                        Commander
                                                    </a>
                                                )}
                                                <StockMovementModal ingredientId={ing.id} ingredientName={ing.name} currentStock={ing.current_stock} unit={ing.unit} />
                                                <IngredientModal mode="edit" ingredient={ing} />
                                                <button
                                                    onClick={() => handleToggleStatus(ing, true)}
                                                    className="btn-ghost"
                                                    title="Archiver"
                                                    disabled={isPending && pendingId === ing.id}
                                                    style={{ color: 'var(--color-muted)', minHeight: '36px', padding: '0 10px' }}
                                                >
                                                    <Archive size={16} />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleToggleStatus(ing, false)}
                                                className="btn-ghost"
                                                title="Réactiver"
                                                disabled={isPending && pendingId === ing.id}
                                                style={{ color: '#C4836A', minHeight: '36px', padding: '0 12px', gap: '6px' }}
                                            >
                                                <RefreshCw size={16} className={isPending && pendingId === ing.id ? 'animate-spin' : ''} />
                                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Réactiver</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            <style jsx>{`
                @media (max-width: 768px) {
                    .ingredients-page :global(.ingredients-table) {
                        display: none;
                    }
                    .ingredients-page :global(.ingredients-cards) {
                        display: flex !important;
                    }
                }
            `}</style>
        </div>
    )
}
