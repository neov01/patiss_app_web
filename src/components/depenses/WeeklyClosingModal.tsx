'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  PieChart,
  Loader2,
} from 'lucide-react'
import {
  CATEGORY_CONFIG,
  type Expense,
  type ExpenseCycle,
  type BudgetTopUp,
  type ExpenseCategoryKey,
  type WeeklyBilanPreview,
} from '@/lib/schemas/expenses'
import { getWeeklyBilanPreviewAction, weeklyExpenseClosingAction } from '@/lib/actions/expenses'
import WeeklyBilanSummary from './WeeklyBilanSummary'
import { useCurrency } from '@/providers/CurrencyProvider'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  cycle: ExpenseCycle
  expenses: Expense[]
  topUps: BudgetTopUp[]
  onCycleClosed: () => void
}

export default function WeeklyClosingModal({
  isOpen,
  onClose,
  cycle,
  expenses,
  topUps,
  onCycleClosed,
}: Props) {
  const { currency } = useCurrency()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [preview, setPreview] = useState<WeeklyBilanPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  const currentBalance = Number(cycle.current_balance) || 0
  const totalSpent = Number(cycle.total_spent) || 0
  const totalAllocated = Number(cycle.total_allocated) || 0

  // Chiffres du bilan calculés côté serveur (budget, recharge, espèces de la semaine)
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setPreview(null)
    setPreviewError(null)
    setIsLoadingPreview(true)
    getWeeklyBilanPreviewAction()
      .then((res) => {
        if (cancelled) return
        if (res.success && res.preview) setPreview(res.preview)
        else setPreviewError(res.error || 'Impossible de préparer le bilan')
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPreview(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, cycle.id])

  // Ventilation par catégorie des dépenses actives
  const categoryBreakdown = useMemo(() => {
    const map: Partial<Record<ExpenseCategoryKey, number>> = {}
    expenses
      .filter((e) => !e.is_cancelled)
      .forEach((e) => {
        map[e.category] = (map[e.category] || 0) + Number(e.amount)
      })

    return Object.entries(map).map(([cat, total]) => ({
      key: cat as ExpenseCategoryKey,
      config: CATEGORY_CONFIG[cat as ExpenseCategoryKey] || CATEGORY_CONFIG.autre,
      total: total || 0,
      percentage: totalSpent > 0 ? ((total || 0) / totalSpent) * 100 : 0,
    }))
  }, [expenses, totalSpent])

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  if (!isOpen) return null

  const blockingReason = !preview
    ? null
    : !preview.isDue
      ? 'Le bilan de la semaine se fait le dimanche, à la clôture de caisse.'
      : !preview.hasOpenSalesSession
        ? 'Ouvrez la caisse pour faire le bilan : la recharge est prise dans le tiroir.'
        : null
  const canSubmit = !!preview && !blockingReason && !isSubmitting

  const handleConfirmClose = async () => {
    if (!preview) return
    setIsSubmitting(true)
    const toastId = toast.loading('Bilan de la semaine en cours...')

    try {
      const res = await weeklyExpenseClosingAction({ cycle_id: preview.cycleId })

      if (!res.success) {
        toast.error(res.error || 'Erreur lors du bilan', { id: toastId })
        return
      }

      toast.success(
        `Semaine clôturée : recharge de ${formatMoney(preview.recharge)} ${currency} enregistrée en sortie de caisse.`,
        { id: toastId }
      )
      onCycleClosed()
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
          maxWidth: '620px',
          width: '100%',
          maxHeight: '92vh',
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
                backgroundColor: '#F5EEE4',
                color: '#815431',
                borderRadius: '10px',
                padding: '8px',
              }}
            >
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1A1C1A] font-display">
                Bilan de la semaine
              </h3>
              <p className="text-xs text-[#51443C]">
                Recharge de l&apos;enveloppe prise dans le tiroir, puis ouverture de la semaine suivante
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

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. Résumé Chiffré de la Semaine */}
          <div
            style={{
              backgroundColor: '#F5EEE4',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(131, 116, 107, 0.15)',
            }}
            className="grid grid-cols-3 gap-3 text-center"
          >
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#51443C] block">
                Total Alloué
              </span>
              <span className="text-base font-black text-[#1A1C1A] font-display">
                {formatMoney(totalAllocated)} {currency}
              </span>
              {topUps.length > 0 && (
                <span className="text-[10px] text-[#4B6450] block mt-0.5 font-medium">
                  dont {topUps.length} rallonge{topUps.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="border-x border-[rgba(131,116,107,0.2)] px-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#51443C] block">
                Total Dépensé
              </span>
              <span className="text-base font-black text-[#991B1B] font-display">
                -{formatMoney(totalSpent)} {currency}
              </span>
              <span className="text-[10px] text-[#51443C] block mt-0.5 font-medium">
                {expenses.filter((e) => !e.is_cancelled).length} achats
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#51443C] block">
                Solde Restant
              </span>
              <span
                className={`text-base font-black font-display ${
                  currentBalance < 0 ? 'text-[#BA1A1A]' : 'text-[#4B6450]'
                }`}
              >
                {formatMoney(currentBalance)} {currency}
              </span>
              <span className="text-[10px] text-[#51443C] block mt-0.5 font-medium">
                au dimanche soir
              </span>
            </div>
          </div>

          {/* 2. Ventilation des dépenses par poste */}
          {categoryBreakdown.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#51443C]">
                <PieChart className="w-3.5 h-3.5 text-[#815431]" />
                <span>Répartition des dépenses de la semaine</span>
              </div>
              <div className="space-y-1.5 bg-[#FFFFFF] p-3 rounded-xl border border-[rgba(131,116,107,0.12)]">
                {categoryBreakdown.map((cat) => (
                  <div key={cat.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1A1C1A]">
                        {cat.config.shortLabel}
                      </span>
                      <span className="font-bold text-[#51443C]">
                        {formatMoney(cat.total)} {currency} ({cat.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#F5EEE4] rounded-full overflow-hidden">
                      <div
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.config.badgeText,
                        }}
                        className="h-full rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Bilan : recharge et espèces de la semaine */}
          {isLoadingPreview && (
            <div className="flex items-center gap-2 text-sm text-[#51443C]">
              <Loader2 className="w-4 h-4 animate-spin" /> Préparation du bilan…
            </div>
          )}
          {previewError && (
            <p className="flex items-start gap-1.5 text-sm font-semibold text-[#BA1A1A]">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {previewError}
            </p>
          )}
          {preview && <WeeklyBilanSummary preview={preview} currency={currency} />}
          {blockingReason && (
            <p className="flex items-start gap-1.5 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] p-3 text-sm font-semibold text-[#92400E]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {blockingReason}
            </p>
          )}
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-[rgba(131,116,107,0.15)] bg-[#FDFBF7] flex items-center gap-3">
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
            type="button"
            onClick={handleConfirmClose}
            disabled={!canSubmit}
            style={{
              height: '48px',
              borderRadius: '9999px',
              backgroundColor: canSubmit ? '#815431' : '#83746B',
              color: '#FFFFFF',
              border: 'none',
            }}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-bold shadow-sm transition-all active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Bilan en cours...</span>
              </>
            ) : (
              <>
                <span>Valider le bilan de la semaine</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
