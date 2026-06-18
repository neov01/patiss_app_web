'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { ArrowUpDown, X, Loader2, Minus, Plus } from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import { createInventoryLog } from '@/lib/actions/inventory'

interface Props {
    ingredientId: string
    ingredientName: string
    currentStock?: number
    unit?: string
}

const REASONS = [
    { value: 'purchase', label: '🛒 Achat', positive: true },
    { value: 'waste', label: '🗑 Perte', positive: false },
    { value: 'production', label: '👨‍🍳 Production', positive: false },
    { value: 'adjustment', label: '⚖ Ajustement', positive: true },
] as const

const NOTE_PLACEHOLDERS: Record<string, string> = {
    purchase: 'Ex: livraison fournisseur Moulin Belle Côte',
    waste: 'Ex: gâteau tombé, produit périmé…',
    production: 'Ex: production croissants du matin',
    adjustment: 'Ex: correction inventaire mensuel',
}

export default function StockMovementModal({ ingredientId, ingredientName, currentStock, unit }: Props) {
    const [open, setOpen] = useState(false)
    const [isPending, start] = useTransition()
    const [reason, setReason] = useState<'purchase' | 'waste' | 'production' | 'adjustment'>('purchase')
    const [quantity, setQuantity] = useState(0)
    const [note, setNote] = useState('')

    const reasonInfo = REASONS.find(r => r.value === reason)!
    const finalQty = reasonInfo.positive ? Math.abs(quantity) : -Math.abs(quantity)
    const newStock = currentStock !== undefined ? currentStock + finalQty : undefined

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        start(async () => {
            const result = await createInventoryLog({
                ingredient_id: ingredientId,
                quantity_change: finalQty,
                reason,
                note: note.trim() || undefined,
            })
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success('Mouvement de stock enregistré !')
                setOpen(false)
                setQuantity(0)
                setNote('')
            }
        })
    }

    function handleClose() {
        setOpen(false)
        setQuantity(0)
        setNote('')
        setReason('purchase')
    }

    return (
        <>
            <button onClick={() => setOpen(true)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 8px', color: 'var(--color-rose-dark)' }}>
                <ArrowUpDown size={16} />
            </button>
            {open && createPortal(
                <div className="modal-overlay" onClick={handleClose}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mouvement de stock</h2>
                            <button onClick={handleClose} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}><X size={18} /></button>
                        </div>

                        {/* Nom + stock actuel */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
                            <p style={{ color: 'var(--color-muted)', fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>
                                📦 {ingredientName}
                            </p>
                            {currentStock !== undefined && (
                                <span style={{
                                    background: '#FDF8F3', border: '1.5px solid #E8C9B0',
                                    borderRadius: '99px', padding: '4px 12px',
                                    fontSize: '0.8rem', fontWeight: 700, color: '#8A5C3A',
                                }}>
                                    Stock actuel : {currentStock} {unit ?? ''}
                                </span>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label className="label">Type de mouvement</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {REASONS.map(r => (
                                        <button key={r.value} type="button"
                                            onClick={() => setReason(r.value)}
                                            style={{
                                                padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '2px solid',
                                                borderColor: reason === r.value ? 'var(--color-rose-dark)' : 'var(--color-border)',
                                                background: reason === r.value ? '#FDE8E0' : 'white',
                                                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
                                                color: reason === r.value ? 'var(--color-rose-dark)' : 'var(--color-muted)',
                                                transition: 'all 0.15s', minHeight: '44px',
                                            }}>
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="label">Quantité ({reasonInfo.positive ? '+' : '-'})</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FDF8F3', borderRadius: '12px', border: '1.5px solid var(--color-border)', overflow: 'hidden' }}>
                                    <button type="button" onClick={() => setQuantity(Math.max(0, quantity - 1))}
                                        style={{ width: '44px', height: '44px', border: 'none', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-rose-dark)', borderRight: '1.5px solid var(--color-border)' }}>
                                        <Minus size={20} />
                                    </button>
                                    <TouchInput
                                        value={quantity.toString()}
                                        onChange={val => setQuantity(parseFloat(val) || 0)}
                                        allowDecimal={true}
                                        placeholder="0.0"
                                        title="Quantité"
                                        hideIcon={true}
                                        style={{ border: 'none', background: 'transparent', textAlign: 'center', fontSize: '1.2rem', fontWeight: 700, flex: 1, minHeight: '44px', borderRadius: 0 }}
                                    />
                                    <button type="button" onClick={() => setQuantity(quantity + 1)}
                                        style={{ width: '44px', height: '44px', border: 'none', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-rose-dark)', borderLeft: '1.5px solid var(--color-border)' }}>
                                        <Plus size={20} />
                                    </button>
                                </div>

                                {/* Aperçu nouveau stock */}
                                {newStock !== undefined && quantity > 0 && (
                                    <p style={{
                                        margin: '8px 0 0', fontSize: '0.82rem', fontWeight: 700,
                                        color: newStock >= 0 ? '#4C9E6A' : '#D94F38',
                                    }}>
                                        → Nouveau stock : {newStock.toFixed(newStock % 1 === 0 ? 0 : 1)} {unit ?? ''}
                                        {newStock < 0 && ' ⚠️ stock négatif'}
                                    </p>
                                )}
                            </div>

                            {/* Note optionnelle */}
                            <div>
                                <label className="label">Note <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: '0.8rem' }}>(optionnel)</span></label>
                                <textarea
                                    className="input"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder={NOTE_PLACEHOLDERS[reason]}
                                    rows={2}
                                    style={{ resize: 'none', fontSize: '0.875rem', lineHeight: 1.5 }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" onClick={handleClose} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
                                <button type="submit" className="btn-primary" disabled={isPending || quantity === 0} style={{ flex: 1 }}>
                                    {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {isPending ? 'Enregistrement…' : 'Valider'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            , document.body)}
        </>
    )
}
