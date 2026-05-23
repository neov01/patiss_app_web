'use client'

import { useState, useMemo } from 'react'
import { ClipboardList, AlertTriangle, Download } from 'lucide-react'

const REASON_LABELS: Record<string, string> = {
    production: '👨‍🍳 Production',
    waste: '🗑 Perte',
    purchase: '🛒 Achat',
    adjustment: '⚖ Ajustement',
}
const REASON_COLORS: Record<string, string> = {
    production: '#DBEAFE',
    waste: '#FEE2E2',
    purchase: '#D1FAE5',
    adjustment: '#FEF3C7',
}

interface Log {
    id: string
    log_date: string | null
    quantity_change: number
    reason: string
    note?: string | null
    ingredients: { name: string; unit: string } | null
    profiles: { full_name: string } | null
}

interface LowStockIngredient {
    name: string
    current_stock: number
    alert_threshold: number
    unit: string
}

interface Props {
    logs: Log[]
    lowStockIngredients: LowStockIngredient[]
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function isToday(d: string | null) {
    if (!d) return false
    const date = new Date(d)
    const now = new Date()
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

export default function InventaireClient({ logs, lowStockIngredients }: Props) {
    const [typeFilter, setTypeFilter] = useState('all')
    const [ingredientFilter, setIngredientFilter] = useState('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    // Ingrédients uniques pour le filtre
    const uniqueIngredients = useMemo(() => {
        const names = new Set<string>()
        logs.forEach(l => { if (l.ingredients?.name) names.add(l.ingredients.name) })
        return Array.from(names).sort()
    }, [logs])

    // Filtrage
    const filtered = useMemo(() => {
        return logs.filter(log => {
            if (typeFilter !== 'all' && log.reason !== typeFilter) return false
            if (ingredientFilter !== 'all' && log.ingredients?.name !== ingredientFilter) return false
            if (dateFrom) {
                const d = log.log_date ? new Date(log.log_date) : null
                if (!d || d < new Date(dateFrom)) return false
            }
            if (dateTo) {
                const d = log.log_date ? new Date(log.log_date) : null
                const end = new Date(dateTo)
                end.setHours(23, 59, 59)
                if (!d || d > end) return false
            }
            return true
        })
    }, [logs, typeFilter, ingredientFilter, dateFrom, dateTo])

    // KPIs (basés sur aujourd'hui, tous logs)
    const todayLogs = useMemo(() => logs.filter(l => isToday(l.log_date)), [logs])
    const todayEntries = todayLogs.filter(l => l.quantity_change > 0).reduce((s, l) => s + l.quantity_change, 0)
    const todayLosses = todayLogs.filter(l => l.quantity_change < 0 && l.reason === 'waste').reduce((s, l) => s + Math.abs(l.quantity_change), 0)
    const todayCount = todayLogs.length

    // Export CSV
    function exportCSV() {
        const header = ['Date', 'Ingrédient', 'Type', 'Quantité', 'Par', 'Note']
        const rows = filtered.map(l => [
            formatDate(l.log_date),
            l.ingredients?.name ?? '',
            REASON_LABELS[l.reason] ?? l.reason,
            `${l.quantity_change >= 0 ? '+' : ''}${l.quantity_change} ${l.ingredients?.unit ?? ''}`,
            l.profiles?.full_name ?? '',
            l.note ?? '',
        ])
        const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
        const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `inventaire_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const hasActiveFilters = typeFilter !== 'all' || ingredientFilter !== 'all' || dateFrom || dateTo

    return (
        <div className="animate-fade-in">
            {/* Alertes stock bas */}
            {lowStockIngredients.length > 0 && (
                <div style={{
                    background: '#FFF7ED', border: '1.5px solid #FBD38D',
                    borderRadius: '14px', padding: '12px 18px', marginBottom: '20px',
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                }}>
                    <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                        <p style={{ margin: 0, fontWeight: 700, color: '#92400E', fontSize: '0.875rem' }}>
                            {lowStockIngredients.length} ingrédient{lowStockIngredients.length > 1 ? 's' : ''} en rupture imminente
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#B45309' }}>
                            {lowStockIngredients.map(i => `${i.name} (${i.current_stock} ${i.unit})`).join(' · ')}
                        </p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Inventaire</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {filtered.length} mouvement{filtered.length > 1 ? 's' : ''}{hasActiveFilters ? ' (filtré)' : ' au total'}
                    </p>
                </div>
                <button onClick={exportCSV} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
                    <Download size={15} />
                    Exporter CSV
                </button>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: '#F0FAF4', border: '1.5px solid #A8DFC0', borderRadius: '14px', padding: '14px 18px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#3A7D57', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Entrées du jour</p>
                    <p style={{ margin: '6px 0 0', fontSize: '1.3rem', fontWeight: 800, color: '#1E5C3C' }}>+{todayEntries.toFixed(todayEntries % 1 === 0 ? 0 : 1)}</p>
                </div>
                <div style={{ background: '#FFF1F0', border: '1.5px solid #FFBCB5', borderRadius: '14px', padding: '14px 18px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#A0392B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pertes du jour</p>
                    <p style={{ margin: '6px 0 0', fontSize: '1.3rem', fontWeight: 800, color: '#7B1F1F' }}>-{todayLosses.toFixed(todayLosses % 1 === 0 ? 0 : 1)}</p>
                </div>
                <div style={{ background: '#F5F0FF', border: '1.5px solid #C9B8F5', borderRadius: '14px', padding: '14px 18px' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#5A3D99', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mouvements</p>
                    <p style={{ margin: '6px 0 0', fontSize: '1.3rem', fontWeight: 800, color: '#3D2673' }}>{todayCount}</p>
                </div>
            </div>

            {/* Filtres */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <select
                    className="input"
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{ minWidth: '150px', flex: '1' }}
                >
                    <option value="all">Tous les types</option>
                    <option value="purchase">🛒 Achat</option>
                    <option value="waste">🗑 Perte</option>
                    <option value="production">👨‍🍳 Production</option>
                    <option value="adjustment">⚖ Ajustement</option>
                </select>

                <select
                    className="input"
                    value={ingredientFilter}
                    onChange={e => setIngredientFilter(e.target.value)}
                    style={{ minWidth: '150px', flex: '1' }}
                >
                    <option value="all">Tous les ingrédients</option>
                    {uniqueIngredients.map(n => <option key={n} value={n}>{n}</option>)}
                </select>

                <input
                    className="input"
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    style={{ flex: '1', minWidth: '130px' }}
                    title="Du"
                />
                <input
                    className="input"
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    style={{ flex: '1', minWidth: '130px' }}
                    title="Au"
                />

                {hasActiveFilters && (
                    <button
                        className="btn-ghost"
                        onClick={() => { setTypeFilter('all'); setIngredientFilter('all'); setDateFrom(''); setDateTo('') }}
                        style={{ fontSize: '0.8rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}
                    >
                        Réinitialiser
                    </button>
                )}
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <ClipboardList size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucun mouvement trouvé</p>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>Modifiez les filtres ou déclarez un mouvement.</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-cream)', borderBottom: '1.5px solid var(--color-border)' }}>
                                    {['Date', 'Ingrédient', 'Type', 'Quantité', 'Par', 'Note'].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((log, i) => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'white' : 'var(--color-cream)' }}>
                                        <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                                            {formatDate(log.log_date)}
                                        </td>
                                        <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.875rem' }}>
                                            {log.ingredients?.name ?? '—'}
                                        </td>
                                        <td style={{ padding: '10px 16px' }}>
                                            <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600, background: REASON_COLORS[log.reason] ?? '#F3F4F6' }}>
                                                {REASON_LABELS[log.reason] ?? log.reason}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 16px', fontWeight: 700, color: log.quantity_change >= 0 ? '#4C9E6A' : '#D94F38', fontSize: '0.9rem' }}>
                                            {log.quantity_change >= 0 ? '+' : ''}{log.quantity_change} {log.ingredients?.unit ?? ''}
                                        </td>
                                        <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                                            {log.profiles?.full_name ?? '—'}
                                        </td>
                                        <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--color-muted)', maxWidth: '180px' }}>
                                            {log.note ? (
                                                <span style={{ fontStyle: 'italic' }}>{log.note}</span>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
