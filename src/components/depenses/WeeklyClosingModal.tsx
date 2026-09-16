'use client'

import { useState, useMemo } from 'react'
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  PieChart,
  Loader2,
} from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import {
  CATEGORY_CONFIG,
  type Expense,
  type ExpenseCycle,
  type BudgetTopUp,
  type ExpenseCategoryKey,
} from '@/lib/schemas/expenses'
import { closeWeeklyCycleAction } from '@/lib/actions/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  cycle: ExpenseCycle
  expenses: Expense[]
  topUps: BudgetTopUp[]
  totalWeekCashSales: number
  orgWeeklyBudget?: number
  onCycleClosed: () => void
}

export default function WeeklyClosingModal({
  isOpen,
  onClose,
  cycle,
  expenses,
  topUps,
  totalWeekCashSales,
  orgWeeklyBudget,
  onCycleClosed,
}: Props) {
  const { currency } = useCurrency()
  const targetDefault = orgWeeklyBudget || Number(cycle.initial_budget) || 150000
  const [newBudgetStr, setNewBudgetStr] = useState(String(targetDefault))
  const [rechargeSource, setRechargeSource] = useState<'ventes_hebdo' | 'apport_externe' | 'mixte'>('ventes_hebdo')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const newBudgetTarget = parseFloat(newBudgetStr) || targetDefault
  const currentBalance = Number(cycle.current_balance) || 0
  const totalSpent = Number(cycle.total_spent) || 0
  const totalAllocated = Number(cycle.total_allocated) || targetDefault

  // Calcul exact de la recharge nécessaire
  // Si currentBalance < 0, GREATEST(0, newBudgetTarget - (-X)) = newBudgetTarget + X
  const requiredRecharge = Math.max(0, newBudgetTarget - currentBalance)

  // Ventes espèces suffisantes ?
  const isWeekSalesSufficient = totalWeekCashSales >= requiredRecharge

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

  const handleConfirmClose = async () => {
    setIsSubmitting(true)
    const toastId = toast.loading('Clôture du cycle hebdomadaire en cours...')

    try {
      const res = await closeWeeklyCycleAction({
        cycle_id: cycle.id,
        recharge_source: rechargeSource,
        new_budget: newBudgetTarget,
      })

      if (!res.success) {
        toast.error(res.error || 'Erreur lors de la clôture', { id: toastId })
        return
      }

      toast.success(
        `Semaine clôturée avec succès ! Nouveau cycle initialisé à ${formatMoney(newBudgetTarget)} ${currency}.`,
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
                Clôture Hebdomadaire de la Régie
              </h3>
              <p className="text-xs text-[#51443C]">
                Bilan de la semaine écoulée & réapprovisionnement à {formatMoney(newBudgetTarget)} {currency}
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

          {/* 3. Encadré de Calcul de la Recharge */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '18px',
              border: '2px solid #815431',
              boxShadow: '0 4px 12px rgba(129, 84, 49, 0.08)',
            }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#815431]">
                Recharge Automatique Calculée
              </span>
              <span className="text-[11px] font-semibold text-[#51443C] bg-[#F5EEE4] px-2.5 py-0.5 rounded-full">
                Formule : Budget cible - Solde restant
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-2xl font-black text-[#1A1C1A] font-display">
                  {formatMoney(requiredRecharge)}
                </span>
                <span className="text-sm font-bold text-[#815431] ml-1">{currency}</span>
              </div>
              <div className="text-xs text-right text-[#51443C]">
                pour porter l'enveloppe à <strong>{formatMoney(newBudgetTarget)} {currency}</strong>
              </div>
            </div>

            {/* Comparaison avec les ventes espèces */}
            <div className="pt-2 border-t border-[rgba(131,116,107,0.15)] flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
              <span className="text-[#51443C]">
                Cumul des ventes espèces de la semaine : <strong>{formatMoney(totalWeekCashSales)} {currency}</strong>
              </span>
              {isWeekSalesSufficient ? (
                <span className="text-[#4B6450] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Les ventes couvrent la recharge
                </span>
              ) : (
                <span className="text-[#BA1A1A] font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Déficit ventes espèces ({formatMoney(requiredRecharge - totalWeekCashSales)} {currency})
                </span>
              )}
            </div>
          </div>

          {/* 4. Choix de la Source de Recharge */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-2">
              Comment prélever cette recharge de {formatMoney(requiredRecharge)} {currency} ? *
            </label>
            <div className="space-y-2 text-xs">
              <label
                style={{
                  backgroundColor: rechargeSource === 'ventes_hebdo' ? '#F4F9F5' : '#FFFFFF',
                  borderColor: rechargeSource === 'ventes_hebdo' ? '#4B6450' : 'rgba(131, 116, 107, 0.2)',
                }}
                className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
              >
                <input
                  type="radio"
                  name="rechargeSource"
                  value="ventes_hebdo"
                  checked={rechargeSource === 'ventes_hebdo'}
                  onChange={() => setRechargeSource('ventes_hebdo')}
                  className="mt-0.5 text-[#4B6450] focus:ring-[#4B6450]"
                />
                <div>
                  <span className="font-bold text-[#1A1C1A] block">
                    Prélèvement sur le cumul des ventes de la semaine écoulée
                  </span>
                  <span className="text-[11px] text-[#51443C]">
                    Méthode standard : les ventes accumulées renflouent l'enveloppe de la petite caisse.
                  </span>
                </div>
              </label>

              <label
                style={{
                  backgroundColor: rechargeSource === 'apport_externe' ? '#FDF8F3' : '#FFFFFF',
                  borderColor: rechargeSource === 'apport_externe' ? '#815431' : 'rgba(131, 116, 107, 0.2)',
                }}
                className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all"
              >
                <input
                  type="radio"
                  name="rechargeSource"
                  value="apport_externe"
                  checked={rechargeSource === 'apport_externe'}
                  onChange={() => setRechargeSource('apport_externe')}
                  className="mt-0.5 text-[#815431] focus:ring-[#815431]"
                />
                <div>
                  <span className="font-bold text-[#1A1C1A] block">
                    Apport de trésorerie externe (Gérant / Patron)
                  </span>
                  <span className="text-[11px] text-[#51443C]">
                    Recommandé si les ventes de la semaine sont insuffisantes ou déjà versées en banque.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 5. Paramètre du Budget Cible de la Semaine Suivante */}
          <div className="pt-2 border-t border-[rgba(131,116,107,0.12)]">
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1">
              Budget cible pour la semaine suivante ({currency})
            </label>
            <TouchInput
              value={newBudgetStr}
              onChange={setNewBudgetStr}
              placeholder={String(targetDefault)}
              title="Budget cible de la nouvelle semaine"
              style={{
                height: '46px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: '#F5EEE4',
                borderRadius: '10px',
                color: '#1A1C1A',
              }}
            />
          </div>
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
            disabled={isSubmitting}
            style={{
              height: '48px',
              borderRadius: '9999px',
              backgroundColor: isSubmitting ? '#83746B' : '#815431',
              color: '#FFFFFF',
              border: 'none',
            }}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-bold shadow-sm transition-all active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Clôture en cours...</span>
              </>
            ) : (
              <>
                <span>Valider la clôture & Ouvrir le nouveau cycle</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
