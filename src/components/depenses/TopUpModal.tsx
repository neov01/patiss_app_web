'use client'

import { useState } from 'react'
import {
  X,
  Zap,
  AlertTriangle,
  Store,
  UserCheck,
  Loader2,
  HelpCircle,
} from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import { createTopUpAction } from '@/lib/actions/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  cycleId: string
  hasOpenSalesSession: boolean
  availableCashInDrawer: number
  onTopUpCreated: () => void
}

export default function TopUpModal({
  isOpen,
  onClose,
  cycleId,
  hasOpenSalesSession,
  availableCashInDrawer,
  onTopUpCreated,
}: Props) {
  const { currency } = useCurrency()
  const [amountStr, setAmountStr] = useState('')
  const [reason, setReason] = useState('')
  const [source, setSource] = useState<'caisse_du_jour' | 'apport_externe_gerant'>('caisse_du_jour')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const amount = parseFloat(amountStr) || 0
  const isCaisseSource = source === 'caisse_du_jour'
  const isExceedingCashInDrawer = isCaisseSource && amount > availableCashInDrawer

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (amount <= 0) {
      toast.error('Veuillez saisir un montant valide')
      return
    }

    if (!reason.trim()) {
      toast.error('Veuillez spécifier le motif de la rallonge')
      return
    }

    if (isCaisseSource) {
      if (!hasOpenSalesSession) {
        toast.error('Aucune session de vente n’est actuellement ouverte pour prélever des espèces.')
        return
      }
      if (isExceedingCashInDrawer) {
        toast.error(
          `Fonds insuffisants en caisse. Le tiroir ne contient que ${formatMoney(availableCashInDrawer)} ${currency} d'espèces.`
        )
        return
      }
    }

    setIsSubmitting(true)
    const toastId = toast.loading('Enregistrement du transfert de trésorerie...')

    try {
      const res = await createTopUpAction({
        cycle_id: cycleId,
        amount,
        reason: reason.trim(),
        source,
      })

      if (!res.success) {
        toast.error(res.error || 'Erreur lors de la rallonge', { id: toastId })
        return
      }

      toast.success('Rallonge créditée avec succès sur le budget dépenses', { id: toastId })
      onTopUpCreated()
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
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 16px 48px rgba(45,27,14,0.2)',
          border: '1px solid rgba(131, 116, 107, 0.2)',
        }}
        className="flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(131,116,107,0.15)] bg-[#FDFBF7]">
          <div className="flex items-center gap-2.5">
            <div
              style={{
                backgroundColor: '#CDEAD0',
                color: '#4B6450',
                borderRadius: '10px',
                padding: '8px',
              }}
            >
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1A1C1A] font-display">
                Rallonge Exceptionnelle
              </h3>
              <p className="text-xs text-[#51443C]">
                Injection de liquidités pour le budget de la semaine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#83746B] hover:text-[#1A1C1A] hover:bg-[#F5EEE4] rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* 1. Choix de la Source */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-2">
              Source de la rallonge *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSource('caisse_du_jour')}
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  backgroundColor: isCaisseSource ? '#4B6450' : '#F5EEE4',
                  color: isCaisseSource ? '#FFFFFF' : '#1A1C1A',
                  border: isCaisseSource ? '2px solid #4B6450' : '1px solid rgba(131, 116, 107, 0.15)',
                }}
                className="flex flex-col items-start gap-1 text-left transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Store className="w-4 h-4" />
                  <span>Caisse du jour</span>
                </div>
                <span className={`text-[11px] ${isCaisseSource ? 'text-white/80' : 'text-[#51443C]'}`}>
                  Espèces disponibles : <strong>{formatMoney(availableCashInDrawer)} {currency}</strong>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSource('apport_externe_gerant')}
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  backgroundColor: !isCaisseSource ? '#815431' : '#F5EEE4',
                  color: !isCaisseSource ? '#FFFFFF' : '#1A1C1A',
                  border: !isCaisseSource ? '2px solid #815431' : '1px solid rgba(131, 116, 107, 0.15)',
                }}
                className="flex flex-col items-start gap-1 text-left transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <UserCheck className="w-4 h-4" />
                  <span>Apport externe</span>
                </div>
                <span className={`text-[11px] ${!isCaisseSource ? 'text-white/80' : 'text-[#51443C]'}`}>
                  Fonds propres / Gérant (hors tiroir-caisse)
                </span>
              </button>
            </div>
          </div>

          {/* Statut caisse du jour */}
          {isCaisseSource && !hasOpenSalesSession && (
            <div className="p-3 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Attention : Aucune session de caisse n'est ouverte aujourd'hui. Vous devez d'abord ouvrir la caisse dans le module Caisse ou opter pour un « Apport externe ».
              </span>
            </div>
          )}

          {/* 2. Saisie du Montant */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Montant de la rallonge ({currency}) *
            </label>
            <TouchInput
              value={amountStr}
              onChange={setAmountStr}
              placeholder="0"
              title="Montant de la rallonge"
              style={{
                height: '50px',
                fontSize: '20px',
                fontWeight: 'bold',
                backgroundColor: '#F5EEE4',
                borderRadius: '12px',
                color: '#1A1C1A',
                textAlign: 'left',
              }}
            />

            {isExceedingCashInDrawer && (
              <div className="mt-2 p-2.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Le montant demandé ({formatMoney(amount)} {currency}) dépasse les espèces physiques actuellement en caisse ({formatMoney(availableCashInDrawer)} {currency}).
                </span>
              </div>
            )}
          </div>

          {/* 3. Motif obligatoire */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Motif de la rallonge *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Achat imprévu gros volume fraises chez le grossiste"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                height: '48px',
                backgroundColor: '#F5EEE4',
                borderRadius: '12px',
                border: '1px solid rgba(131, 116, 107, 0.2)',
                padding: '0 16px',
                fontSize: '14px',
                color: '#1A1C1A',
                width: '100%',
              }}
            />
          </div>

          {/* Explication comptable & traçabilité */}
          <div className="p-3 rounded-xl bg-[#F5EEE4] border border-[rgba(131,116,107,0.15)] text-[11px] text-[#51443C] flex items-start gap-2">
            <HelpCircle className="w-4 h-4 shrink-0 text-[#815431] mt-0.5" />
            <span>
              {isCaisseSource
                ? 'Une sortie de caisse officielle ("SORTIE_CAISSE") sera débitée du tiroir des ventes du jour pour que le comptage physique du soir soit exact au centime près.'
                : 'Cet apport de trésorerie augmentera le budget alloué à la petite caisse sans impacter le tiroir-caisse des ventes.'}
            </span>
          </div>

          {/* Boutons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                height: '48px',
                borderRadius: '9999px',
                backgroundColor: '#F5EEE4',
                color: '#51443C',
                border: 'none',
                padding: '0 20px',
              }}
              className="text-sm font-bold hover:bg-[#E0D8CE] transition-all"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={isSubmitting || amount <= 0 || (isCaisseSource && (!hasOpenSalesSession || isExceedingCashInDrawer))}
              style={{
                height: '48px',
                borderRadius: '9999px',
                backgroundColor: isSubmitting || amount <= 0 || (isCaisseSource && isExceedingCashInDrawer) ? '#83746B' : '#4B6450',
                color: '#FFFFFF',
                border: 'none',
              }}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-bold shadow-sm transition-all active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transfert en cours...</span>
                </>
              ) : (
                <span>Confirmer le transfert (+{formatMoney(amount)} {currency})</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
