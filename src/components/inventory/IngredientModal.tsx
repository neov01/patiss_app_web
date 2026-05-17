'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Plus, Edit2, X, Loader2, Info } from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import { createIngredient, updateIngredient } from '@/lib/actions/inventory'
import type { Ingredient } from '@/types/supabase'

interface Props {
    mode: 'create' | 'edit'
    ingredient?: Ingredient
    existingNames?: string[]
}

export default function IngredientModal({ mode, ingredient, existingNames = [] }: Props) {
    const [open, setOpen] = useState(false)
    const [isPending, start] = useTransition()
    const [showThresholdTooltip, setShowThresholdTooltip] = useState(false)
    const [form, setForm] = useState({
        name: ingredient?.name ?? '',
        unit: ingredient?.unit ?? 'kg',
        cost_per_unit: ingredient?.cost_per_unit ?? 0,
        alert_threshold: ingredient?.alert_threshold ?? 5,
        current_stock: ingredient?.current_stock ?? 0,
        supplier_name: ingredient?.supplier_name ?? '',
        supplier_phone: ingredient?.supplier_phone ?? '',
    })

    // Validation nom unique (uniquement en mode création, ou si le nom a changé en édition)
    const nameLower = form.name.trim().toLowerCase()
    const isDuplicateName = nameLower.length > 0 && existingNames.some(n => {
        const existing = n.toLowerCase()
        if (mode === 'edit' && ingredient?.name.toLowerCase() === existing) return false
        return existing === nameLower
    })

    // Valeur du stock initial
    const stockValue = form.current_stock * form.cost_per_unit

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (isDuplicateName) return
        start(async () => {
            const result = mode === 'create'
                ? await createIngredient(form)
                : await updateIngredient(ingredient!.id, form)

            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success(mode === 'create' ? 'Ingrédient créé !' : 'Ingrédient mis à jour !')
                setOpen(false)
                if (mode === 'create') {
                    setForm({ name: '', unit: 'kg', cost_per_unit: 0, alert_threshold: 5, current_stock: 0, supplier_name: '', supplier_phone: '' })
                }
            }
        })
    }

    return (
        <>
            <button onClick={() => setOpen(true)}
                className={mode === 'create' ? 'btn-primary' : 'btn-ghost'}
                style={{ padding: mode === 'create' ? undefined : '0 8px', minHeight: '36px' }}>
                {mode === 'create' ? <><Plus size={16} /> Ajouter</> : <Edit2 size={16} />}
            </button>

            {open && createPortal(
                <div className="modal-overlay" onClick={() => setOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                                {mode === 'create' ? 'Nouvel ingrédient' : 'Modifier ingrédient'}
                            </h2>
                            <button onClick={() => setOpen(false)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Nom + validation doublon */}
                            <div>
                                <label className="label">Nom</label>
                                <input
                                    className="input"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="ex: Farine T55"
                                    required
                                    style={{ borderColor: isDuplicateName ? '#D94F38' : undefined }}
                                />
                                {isDuplicateName && (
                                    <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#D94F38', fontWeight: 600 }}>
                                        Un ingrédient &quot;{form.name.trim()}&quot; existe déjà.
                                    </p>
                                )}
                            </div>

                            {/* Stock initial (création seulement) */}
                            {mode === 'create' && (
                                <div>
                                    <label className="label">Quantité en stock initiale</label>
                                    <TouchInput
                                        value={form.current_stock.toString()}
                                        onChange={val => setForm(f => ({ ...f, current_stock: parseFloat(val) || 0 }))}
                                        allowDecimal={true}
                                        placeholder="0.0"
                                        title="Stock initial"
                                    />
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="label">Unité</label>
                                    <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                                        {['kg', 'g', 'l', 'cl', 'ml', 'piece', 'sachet'].map(u => <option key={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Coût / unité</label>
                                    <TouchInput
                                        value={form.cost_per_unit.toString()}
                                        onChange={val => setForm(f => ({ ...f, cost_per_unit: parseFloat(val) || 0 }))}
                                        allowDecimal={true}
                                        placeholder="0.00"
                                        title="Coût par unité"
                                    />
                                </div>
                            </div>

                            {/* Valeur du stock initial (création seulement) */}
                            {mode === 'create' && (form.current_stock > 0 || form.cost_per_unit > 0) && (
                                <div style={{
                                    background: '#F0FAF4', border: '1.5px solid #A8DFC0',
                                    borderRadius: '10px', padding: '10px 14px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                }}>
                                    <span style={{ fontSize: '0.82rem', color: '#3A7D57', fontWeight: 600 }}>Valeur initiale du stock</span>
                                    <span style={{ fontSize: '0.95rem', color: '#1E5C3C', fontWeight: 800 }}>
                                        {stockValue.toLocaleString('fr-FR')} FCFA
                                    </span>
                                </div>
                            )}

                            {/* Seuil d'alerte avec tooltip */}
                            <div>
                                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    Seuil d&apos;alerte (stock minimum)
                                    <span
                                        style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer', color: 'var(--color-muted)' }}
                                        onMouseEnter={() => setShowThresholdTooltip(true)}
                                        onMouseLeave={() => setShowThresholdTooltip(false)}
                                        onTouchStart={() => setShowThresholdTooltip(v => !v)}
                                    >
                                        <Info size={14} />
                                        {showThresholdTooltip && (
                                            <span style={{
                                                position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
                                                background: '#1a1a2e', color: 'white', borderRadius: '8px',
                                                padding: '8px 12px', fontSize: '0.75rem', fontWeight: 500,
                                                whiteSpace: 'nowrap', zIndex: 100, lineHeight: 1.4,
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                            }}>
                                                Vous serez alerté quand le stock<br />descend en dessous de ce seuil
                                            </span>
                                        )}
                                    </span>
                                </label>
                                <TouchInput
                                    value={form.alert_threshold.toString()}
                                    onChange={val => setForm(f => ({ ...f, alert_threshold: parseFloat(val) || 0 }))}
                                    allowDecimal={true}
                                    placeholder="0.0"
                                    title="Seuil d'alerte"
                                />
                            </div>

                            <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '12px', marginTop: '4px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                                    Fournisseur (optionnel)
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label className="label">Nom</label>
                                        <input
                                            className="input"
                                            value={form.supplier_name}
                                            onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                                            placeholder="ex: Moulin Belle Côte"
                                        />
                                    </div>
                                    <div>
                                        <label className="label">WhatsApp</label>
                                        <input
                                            className="input"
                                            type="tel"
                                            value={form.supplier_phone}
                                            onChange={e => setForm(f => ({ ...f, supplier_phone: e.target.value }))}
                                            placeholder="+225 07 XX XX XX XX"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                <button type="button" onClick={() => setOpen(false)} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
                                <button type="submit" className="btn-primary" disabled={isPending || isDuplicateName} style={{ flex: 1 }}>
                                    {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {isPending ? 'Enregistrement…' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            , document.body)}
        </>
    )
}
