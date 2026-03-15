'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowUpDown, X, Loader2, Minus, Plus } from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import { createInventoryLog } from '@/lib/actions/inventory'

interface Props {
    ingredientId: string
    ingredientName: string
}

const REASONS = [
    { value: 'purchase', label: '🛒 Achat', positive: true },
    { value: 'waste', label: '🗑 Perte', positive: false },
    { value: 'production', label: '👨‍🍳 Production', positive: false },
    { value: 'adjustment', label: '⚖ Ajustement', positive: true },
] as const

export default function StockMovementModal({ ingredientId, ingredientName }: Props) {
    const [open, setOpen] = useState(false)
    const [isPending, start] = useTransition()
    const [reason, setReason] = useState<'purchase' | 'waste' | 'production' | 'adjustment'>('purchase')
    const [quantity, setQuantity] = useState(0)

    const reasonInfo = REASONS.find(r => r.value === reason)!

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        start(async () => {
            const finalQty = reasonInfo.positive ? Math.abs(quantity) : -Math.abs(quantity)
            const result = await createInventoryLog({
                ingredient_id: ingredientId,
                quantity_change: finalQty,
                reason,
            })
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success('Mouvement de stock enregistré !')
                setOpen(false)
                setQuantity(0)
            }
        })
    }

    return (
        <>
            <button onClick={() => setOpen(true)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 8px', color: '#C4836A' }}>
                <ArrowUpDown size={16} />
            </button>
            {open && (
                <div className="modal-overlay" onClick={() => setOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mouvement de stock</h2>
                            <button onClick={() => setOpen(false)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}><X size={18} /></button>
                        </div>
                        <p style={{ color: 'var(--color-muted)', fontWeight: 600, marginBottom: '20px', fontSize: '0.9rem' }}>
                            📦 {ingredientName}
                        </p>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label className="label">Type de mouvement</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    {REASONS.map(r => (
                                        <button key={r.value} type="button"
                                            onClick={() => setReason(r.value)}
                                            style={{
                                                padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '2px solid',
                                                borderColor: reason === r.value ? '#C4836A' : 'var(--color-border)',
                                                background: reason === r.value ? '#FDE8E0' : 'white',
                                                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
                                                color: reason === r.value ? '#C4836A' : 'var(--color-muted)',
                                                transition: 'all 0.15s', minHeight: '44px',
                                            }}>
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="label">Quantité ({reasonInfo.positive ? '+' : '-'})</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button type="button" onClick={() => setQuantity(Math.max(0, quantity - 1))} className="btn-secondary" style={{ width: '44px', padding: 0 }}><Minus size={16} /></button>
                                    <TouchInput
                                        value={quantity.toString()}
                                        onChange={val => setQuantity(parseFloat(val) || 0)}
                                        allowDecimal={true}
                                        placeholder="0.0"
                                        title="Quantité"
                                        style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: 700, flex: 1 }}
                                    />
                                    <button type="button" onClick={() => setQuantity(quantity + 1)} className="btn-secondary" style={{ width: '44px', padding: 0 }}><Plus size={16} /></button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" onClick={() => setOpen(false)} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
                                <button type="submit" className="btn-primary" disabled={isPending || quantity === 0} style={{ flex: 1 }}>
                                    {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {isPending ? 'Enregistrement…' : 'Valider'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
