'use client'

import { useState } from 'react'
import { RotateCcw, X, AlertTriangle } from 'lucide-react'
import { rembourserTransaction } from '@/lib/actions/caisse'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  currency: string
  recentTransactions: Array<{
    id: string
    created_at: string
    client_name: string
    amount: number
    payment_method: string
  }>
}

const PAYMENT_METHODS = ['Espèces', 'Orange Money', 'Wave', 'MTN MOMO', 'Moov Money']

export default function RefundModal({ isOpen, onClose, onSuccess, currency, recentTransactions }: Props) {
  const [selectedTxId, setSelectedTxId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Espèces')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const selectedTx = recentTransactions.find(t => t.id === selectedTxId)
  const maxAmount = selectedTx?.amount ?? 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountNum = parseFloat(amount)
    if (!selectedTxId) { setError('Sélectionnez la transaction à rembourser'); return }
    if (isNaN(amountNum) || amountNum <= 0) { setError('Montant invalide'); return }
    if (amountNum > maxAmount) { setError(`Le remboursement ne peut pas dépasser ${maxAmount.toLocaleString('fr-FR')} ${currency}`); return }
    if (!reason.trim()) { setError('La raison du remboursement est obligatoire'); return }

    setLoading(true)
    const res = await rembourserTransaction({
      originalTransactionId: selectedTxId,
      amount: amountNum,
      reason: reason.trim(),
      paymentMethod,
    })
    setLoading(false)

    if (res.error) {
      setError(res.error)
    } else {
      onSuccess()
      onClose()
    }
  }

  function handleClose() {
    setSelectedTxId('')
    setAmount('')
    setReason('')
    setPaymentMethod('Espèces')
    setError(null)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '24px' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RotateCcw size={20} color="var(--color-error, #D94F38)" />
            <h3 id="refund-title" style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Remboursement</h3>
          </div>
          <button onClick={handleClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sélection de la transaction */}
          <div>
            <label htmlFor="refund-tx" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.875rem' }}>
              Transaction à rembourser
            </label>
            <select
              id="refund-tx"
              className="input"
              value={selectedTxId}
              onChange={e => {
                setSelectedTxId(e.target.value)
                const tx = recentTransactions.find(t => t.id === e.target.value)
                if (tx) setAmount(String(tx.amount))
              }}
              required
            >
              <option value="">— Sélectionner une transaction —</option>
              {recentTransactions.map(tx => (
                <option key={tx.id} value={tx.id}>
                  {new Date(tx.created_at).toLocaleDateString('fr-FR')} — {tx.client_name} — {tx.amount.toLocaleString('fr-FR')} {currency}
                </option>
              ))}
            </select>
          </div>

          {/* Montant */}
          <div>
            <label htmlFor="refund-amount" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.875rem' }}>
              Montant à rembourser {selectedTx && <span style={{ color: '#666', fontWeight: 400 }}>(max : {maxAmount.toLocaleString('fr-FR')} {currency})</span>}
            </label>
            <input
              id="refund-amount"
              type="number"
              min="1"
              max={maxAmount || undefined}
              step="1"
              className="input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
            />
          </div>

          {/* Méthode de restitution */}
          <div>
            <label htmlFor="refund-method" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.875rem' }}>
              Méthode de restitution
            </label>
            <select id="refund-method" className="input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>

          {/* Raison */}
          <div>
            <label htmlFor="refund-reason" style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.875rem' }}>
              Raison du remboursement <span style={{ color: '#D94F38' }}>*</span>
            </label>
            <textarea
              id="refund-reason"
              className="input"
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: Produit endommagé, erreur de commande…"
              required
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Erreur */}
          {error && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'rgba(217,79,56,0.08)', border: '1px solid rgba(217,79,56,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#D94F38', fontSize: '0.875rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button type="button" onClick={handleClose} className="btn" style={{ flex: 1, background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn"
              style={{ flex: 1, background: '#D94F38', color: 'white', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Traitement…' : 'Valider le remboursement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
