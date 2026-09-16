'use client'

import { useState } from 'react'
import { X, AlertCircle, Loader2 } from 'lucide-react'
import type { Expense } from '@/lib/schemas/expenses'
import { cancelExpenseAction } from '@/lib/actions/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  expense: Expense | null
  onExpenseCancelled: () => void
}

export default function CancelExpenseModal({
  isOpen,
  onClose,
  expense,
  onExpenseCancelled,
}: Props) {
  const { currency } = useCurrency()
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen || !expense) return null

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      toast.error('Veuillez spécifier le motif d’annulation')
      return
    }

    setIsSubmitting(true)
    const toastId = toast.loading('Annulation de la dépense...')

    try {
      const res = await cancelExpenseAction({
        expense_id: expense.id,
        reason: reason.trim(),
      })

      if (!res.success) {
        toast.error(res.error || "Erreur lors de l'annulation", { id: toastId })
        return
      }

      toast.success(
        `Dépense annulée. ${formatMoney(Number(expense.amount))} ${currency} recrédités sur le solde.`,
        { id: toastId }
      )
      onExpenseCancelled()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inattendue'
      toast.error(msg, { id: toastId })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 16px 48px rgba(45,27,14,0.2)',
          border: '1px solid rgba(131, 116, 107, 0.2)',
        }}
        className="overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(131,116,107,0.15)] bg-[#FDFBF7]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[#BA1A1A]" />
            <h3 className="text-base font-bold text-[#1A1C1A] font-display">
              Annuler une dépense
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#83746B] hover:text-[#1A1C1A] rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-5 space-y-4">
          <div className="p-3 bg-[#F5EEE4] rounded-xl text-xs space-y-1">
            <div className="flex justify-between font-bold text-[#1A1C1A]">
              <span>{expense.description}</span>
              <span className="text-[#BA1A1A]">
                -{formatMoney(Number(expense.amount))} {currency}
              </span>
            </div>
            <p className="text-[11px] text-[#51443C]">
              L'annulation recréditera automatiquement {formatMoney(Number(expense.amount))} {currency} dans l'enveloppe de la semaine.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Motif de l'annulation (obligatoire) *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Ex: Erreur de saisie de montant, ticket en double, achat non effectué..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                backgroundColor: '#F5EEE4',
                borderRadius: '12px',
                border: '1px solid rgba(131, 116, 107, 0.2)',
                padding: '10px 14px',
                fontSize: '13px',
                color: '#1A1C1A',
                width: '100%',
              }}
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                height: '46px',
                borderRadius: '9999px',
                backgroundColor: '#F5EEE4',
                color: '#51443C',
                border: 'none',
                padding: '0 20px',
              }}
              className="text-xs font-bold hover:bg-[#E0D8CE]"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              style={{
                height: '46px',
                borderRadius: '9999px',
                backgroundColor: isSubmitting || !reason.trim() ? '#83746B' : '#BA1A1A',
                color: '#FFFFFF',
                border: 'none',
              }}
              className="flex-1 flex items-center justify-center gap-2 text-xs font-bold shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Annulation en cours...</span>
                </>
              ) : (
                <span>Confirmer l'annulation</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
