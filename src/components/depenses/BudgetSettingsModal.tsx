'use client'

import { useState, useEffect } from 'react'
import {
  X,
  SlidersHorizontal,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Info,
  Loader2,
  Check,
} from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import { updateOrganizationWeeklyBudgetAction } from '@/lib/actions/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentOrgBudget: number
  activeCycleBudget: number
  activeCycleBalance: number
  onBudgetUpdated: () => void
}

export default function BudgetSettingsModal({
  isOpen,
  onClose,
  currentOrgBudget,
  activeCycleBudget,
  activeCycleBalance,
  onBudgetUpdated,
}: Props) {
  const { currency } = useCurrency()
  const [budgetStr, setBudgetStr] = useState(String(currentOrgBudget || 150000))
  const [adjustActiveCycle, setAdjustActiveCycle] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setBudgetStr(String(currentOrgBudget || 150000))
      setAdjustActiveCycle(false)
    }
  }, [isOpen, currentOrgBudget])

  if (!isOpen) return null

  const newBudget = parseFloat(budgetStr) || 0
  const diff = newBudget - activeCycleBudget
  const projectedBalance = activeCycleBalance + diff

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newBudget <= 0) {
      toast.error('Veuillez saisir un montant supérieur à 0')
      return
    }

    try {
      setIsSubmitting(true)
      const res = await updateOrganizationWeeklyBudgetAction({
        new_budget: newBudget,
        adjust_active_cycle: adjustActiveCycle,
      })

      if (!res.success) {
        toast.error(res.error || 'Erreur lors de la mise à jour du budget')
        return
      }

      toast.success('Budget hebdomadaire mis à jour avec succès')
      onBudgetUpdated()
      onClose()
    } catch (err) {
      toast.error('Une erreur inattendue est survenue')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-[#FFFDF8] rounded-3xl border border-[rgba(131,116,107,0.15)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(131,116,107,0.1)] bg-[#FAF5EB]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EADDD7] flex items-center justify-center text-[#815431]">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2C2420]">
                Budget de régie hebdomadaire
              </h2>
              <p className="text-xs text-[#83746B]">
                Enveloppe par défaut pour les dépenses quotidiennes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#83746B] hover:bg-[#EADDD7] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {/* Montant Cible */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#51443C]">
              Montant de l'enveloppe ({currency})
            </label>
            <TouchInput
              value={budgetStr}
              onChange={setBudgetStr}
              placeholder="150000"
              className="w-full text-2xl font-black text-[#2C2420] tracking-tight bg-white border-2 border-[rgba(131,116,107,0.2)] focus:border-[#815431] rounded-2xl h-14 px-4 shadow-inner"
            />
            <p className="text-xs text-[#83746B] flex items-center gap-1.5 pt-0.5">
              <Info className="w-3.5 h-3.5 shrink-0 text-[#815431]" />
              Sera la valeur de référence pour chaque nouvelle semaine.
            </p>
          </div>

          {/* Option d'ajustement du cycle en cours */}
          <div
            onClick={() => setAdjustActiveCycle(!adjustActiveCycle)}
            className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3.5 ${
              adjustActiveCycle
                ? 'bg-[#F5EEE4] border-[#815431] shadow-xs'
                : 'bg-white border-[rgba(131,116,107,0.15)] hover:border-[rgba(131,116,107,0.3)]'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                adjustActiveCycle
                  ? 'bg-[#815431] text-white'
                  : 'border-2 border-[rgba(131,116,107,0.3)] bg-white'
              }`}
            >
              {adjustActiveCycle && <Check className="w-4 h-4 stroke-[3]" />}
            </div>
            <div className="space-y-1">
              <span className="text-sm font-bold text-[#2C2420] block">
                Répercuter la différence immédiatement sur la semaine en cours
              </span>
              <p className="text-xs text-[#83746B] leading-relaxed">
                {diff !== 0 ? (
                  <>
                    Modifie le solde restant de la semaine actuelle de{' '}
                    <strong className={diff > 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}>
                      {diff > 0 ? '+' : ''}{formatMoney(diff)} {currency}
                    </strong>
                    .
                  </>
                ) : (
                  'Aucun écart par rapport au budget initial de la semaine.'
                )}
              </p>
            </div>
          </div>

          {/* Simulation d'impact visuelle */}
          <div className="bg-[#FAF5EB] rounded-2xl p-4 border border-[rgba(131,116,107,0.12)] space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#83746B]">
              Aperçu de l'impact
            </h4>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-white p-3 rounded-xl border border-[rgba(131,116,107,0.1)]">
                <span className="text-[11px] font-semibold text-[#83746B] block">
                  Budget de référence
                </span>
                <span className="text-base font-extrabold text-[#2C2420] block pt-0.5">
                  {formatMoney(newBudget)} {currency}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-[rgba(131,116,107,0.1)]">
                <span className="text-[11px] font-semibold text-[#83746B] block">
                  Solde semaine {adjustActiveCycle ? 'ajusté' : 'inchangé'}
                </span>
                <span
                  className={`text-base font-extrabold block pt-0.5 ${
                    adjustActiveCycle
                      ? projectedBalance >= 0
                        ? 'text-[#2E7D32]'
                        : 'text-[#C62828]'
                      : activeCycleBalance >= 0
                      ? 'text-[#2C2420]'
                      : 'text-[#C62828]'
                  }`}
                >
                  {formatMoney(adjustActiveCycle ? projectedBalance : activeCycleBalance)}{' '}
                  {currency}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 font-bold text-sm text-[#51443C] bg-[#EADDD7]/60 hover:bg-[#EADDD7] active:scale-[0.98] transition-all"
              style={{
                height: '48px',
                borderRadius: '9999px',
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting || newBudget <= 0}
              className="flex-1 font-bold text-sm text-white bg-[#815431] hover:bg-[#6e4627] active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                height: '48px',
                borderRadius: '9999px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <span>Valider le budget</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
