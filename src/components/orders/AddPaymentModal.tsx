'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Wallet, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { addOrderPayment } from '@/lib/actions/orders'
import TouchInput from '@/components/ui/TouchInput'
import DatePicker from '@/components/ui/DatePicker'

interface Props {
    open: boolean
    onClose: () => void
    orderId: string
    totalAmount: number
    paidAmount: number
    balance: number
    currency: string
    onSuccess?: () => void
}

const PAYMENT_METHODS = [
    { value: 'cash', label: '💵 Espèces' },
    { value: 'orange_money', label: '🟠 Orange Money' },
    { value: 'wave', label: '🌊 Wave' },
    { value: 'mobile_money', label: '🍌 MTN MOMO' },
    { value: 'moov_money', label: '🔵 Moov Money' },
    { value: 'bank_transfer', label: '🏦 Virement' },
    { value: 'other', label: '📝 Autre' }
]

export default function AddPaymentModal({
    open,
    onClose,
    orderId,
    totalAmount,
    paidAmount,
    balance,
    currency,
    onSuccess
}: Props) {
    const [amountStr, setAmountStr] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('cash')
    const [paymentDate, setPaymentDate] = useState<Date>(new Date())
    const [note, setNote] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [showErrors, setShowErrors] = useState(false)

    useEffect(() => {
        if (open) {
            // Pré-remplir le montant avec le reste à payer s'il est supérieur à 0
            setAmountStr(balance > 0 ? balance.toString() : '')
            setPaymentMethod('cash')
            setPaymentDate(new Date())
            setNote('')
            setShowErrors(false)
        }
    }, [open, balance])

    if (!open) return null

    const amount = parseFloat(amountStr) || 0
    const isOverpaid = amount > balance

    const handleSave = async () => {
        if (!amount || amount <= 0) {
            setShowErrors(true)
            toast.error("Le montant du paiement doit être supérieur à 0.")
            return
        }

        setIsSaving(true)
        try {
            const result = await addOrderPayment(orderId, {
                amount,
                payment_method: paymentMethod,
                payment_date: paymentDate.toISOString(),
                note: note.trim() || undefined
            })

            if (result && typeof result === 'object' && 'error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success("Paiement ajouté avec succès.")
                if (onSuccess) onSuccess()
                onClose()
            }
        } catch (err) {
            console.error(err)
            toast.error("Une erreur est survenue lors de l'enregistrement.")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999, padding: '16px'
        }}>
            <div style={{
                background: 'var(--color-bg)',
                width: '100%', maxWidth: '480px',
                borderRadius: '16px', border: '1.5px solid var(--color-border)',
                boxShadow: 'var(--shadow-lg)',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden', animation: 'scaleUp 0.15s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--color-well)'
                }}>
                    <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-text)' }}>
                        💳 Ajouter un paiement
                    </h3>
                    <button onClick={onClose} style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--color-muted)', borderRadius: '99px', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', maxHeight: '70vh' }}>
                    {/* Récapitulatif financier */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px',
                        background: 'var(--color-well)', padding: '12px', borderRadius: '12px',
                        border: '1px solid var(--color-border)', textAlign: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Total</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)' }}>{totalAmount.toLocaleString('fr-FR')} {currency}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Déjà payé</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#065F46' }}>{paidAmount.toLocaleString('fr-FR')} {currency}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Reste à payer</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: balance > 0 ? '#B91C1C' : '#065F46' }}>{balance.toLocaleString('fr-FR')} {currency}</div>
                        </div>
                    </div>

                    {/* Saisie Montant */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: showErrors && (!amount || amount <= 0) ? 'var(--color-error)' : 'var(--color-muted)' }}>
                            Montant du paiement * :
                        </span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <TouchInput 
                                    value={amountStr} 
                                    onChange={setAmountStr}
                                    placeholder="Ex: 5000"
                                    allowDecimal={true}
                                    hasError={showErrors && (!amount || amount <= 0)}
                                    style={{ textAlign: 'right', fontSize: '1.1rem', fontWeight: 'bold' }}
                                />
                            </div>
                            <span style={{ fontWeight: 800, color: 'var(--color-muted)' }}>{currency}</span>
                        </div>
                    </div>

                    {/* Alerte Trop-perçu */}
                    {isOverpaid && (
                        <div style={{
                            display: 'flex', gap: '10px', background: '#FEF3C7', border: '1px solid #F59E0B',
                            borderRadius: '10px', padding: '10px 12px', alignItems: 'center', color: '#92400E',
                            fontSize: '0.8rem', fontWeight: 600
                        }}>
                            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                            <span>Le montant saisi dépasse le reste à payer. Cette commande sera en trop-perçu de {(amount - balance).toLocaleString('fr-FR')} {currency}.</span>
                        </div>
                    )}

                    {/* Méthodes de paiement Chips */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-muted)' }}>Méthode de paiement :</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {PAYMENT_METHODS.map(m => (
                                <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                                    style={{
                                        padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700,
                                        borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                                        border: '1.5px solid', 
                                        borderColor: paymentMethod === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                                        background: paymentMethod === m.value ? 'rgba(129, 84, 49, 0.08)' : 'var(--color-well)',
                                        color: paymentMethod === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                                        minHeight: '40px', display: 'flex', alignItems: 'center'
                                    }}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date de paiement */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-muted)' }}>Date de réception :</span>
                        <DatePicker 
                            value={paymentDate} 
                            onChange={setPaymentDate} 
                        />
                    </div>

                    {/* Note optionnelle */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-muted)' }}>Note ou commentaire (optionnel) :</span>
                        <textarea 
                            value={note} 
                            onChange={e => setNote(e.target.value)} 
                            placeholder="Ex: Acompte intermédiaire reçu par carte..."
                            className="input"
                            style={{
                                width: '100%', minHeight: '60px', padding: '8px 12px',
                                fontSize: '0.8rem', borderRadius: '8px', border: '1.5px solid var(--color-border)',
                                background: 'var(--color-lift)', resize: 'vertical', fontFamily: 'inherit',
                                color: 'var(--color-text)'
                            }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 20px', borderTop: '1px solid var(--color-border)',
                    display: 'flex', justifyContent: 'flex-end', gap: '8px',
                    background: 'var(--color-well)'
                }}>
                    <button 
                        onClick={onClose} 
                        disabled={isSaving} 
                        className="btn-secondary" 
                        style={{ minHeight: '40px', padding: '0 16px', fontSize: '0.85rem' }}
                    >
                        Annuler
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving} 
                        className="btn-primary" 
                        style={{ minHeight: '40px', padding: '0 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Enregistrement...
                            </>
                        ) : (
                            <>
                                <Check size={16} />
                                Enregistrer le paiement
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
