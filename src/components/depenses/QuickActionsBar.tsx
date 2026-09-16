'use client'

import { Plus, Zap, CheckSquare, History, SlidersHorizontal } from 'lucide-react'

interface Props {
  onOpenNewExpense: () => void
  onOpenTopUp: () => void
  onOpenClosing: () => void
  onOpenArchives: () => void
  onOpenBudgetSettings?: () => void
  canClose: boolean
  canManageBudget?: boolean
  isSundayOrMonday: boolean
}

export default function QuickActionsBar({
  onOpenNewExpense,
  onOpenTopUp,
  onOpenClosing,
  onOpenArchives,
  onOpenBudgetSettings,
  canClose,
  canManageBudget,
  isSundayOrMonday,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      {/* Boutons d'action métier fréquents (Tactile 48px) */}
      <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
        {/* 1. Saisie Dépense (Primary Action) */}
        <button
          onClick={onOpenNewExpense}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-6 font-bold text-sm tracking-wide transition-all active:scale-[0.98] shadow-sm hover:shadow"
          style={{
            height: '48px',
            backgroundColor: '#815431',
            color: '#FFFFFF',
            borderRadius: '9999px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus className="w-5 h-5" />
          <span>Nouvelle dépense</span>
        </button>

        {/* 2. Rallonge depuis la caisse du jour */}
        <button
          onClick={onOpenTopUp}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 font-bold text-sm tracking-wide transition-all active:scale-[0.98]"
          style={{
            height: '48px',
            backgroundColor: '#CDEAD0',
            color: '#4B6450',
            borderRadius: '9999px',
            border: '1px solid rgba(75, 100, 80, 0.25)',
            cursor: 'pointer',
          }}
        >
          <Zap className="w-4 h-4 text-[#4B6450]" />
          <span>Rallonge caisse du jour</span>
        </button>
      </div>

      {/* Boutons de gestion et archives */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        {/* 3. Clôture Hebdomadaire (Gérant/Admin) */}
        {canClose && (
          <button
            onClick={onOpenClosing}
            className={`flex items-center justify-center gap-2 px-4 text-xs font-bold transition-all active:scale-[0.98] ${
              isSundayOrMonday
                ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] animate-pulse'
                : 'bg-[#F5EEE4] text-[#815431] border border-[rgba(131,116,107,0.2)]'
            }`}
            style={{
              height: '44px',
              borderRadius: '9999px',
              cursor: 'pointer',
            }}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Clôture hebdomadaire</span>
          </button>
        )}

        {/* 4. Archives des semaines passées */}
        <button
          onClick={onOpenArchives}
          className="flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-[#51443C] bg-[#FFFFFF] border border-[rgba(131,116,107,0.2)] hover:bg-[#F5EEE4] transition-all"
          style={{
            height: '44px',
            borderRadius: '9999px',
            cursor: 'pointer',
          }}
          title="Historique des cycles précédents"
        >
          <History className="w-4 h-4" />
          <span className="hidden md:inline">Archives</span>
        </button>

        {/* 5. Paramétrage Budget (Gérant/Admin) */}
        {canManageBudget && onOpenBudgetSettings && (
          <button
            onClick={onOpenBudgetSettings}
            className="flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold text-[#51443C] bg-[#FFFFFF] border border-[rgba(131,116,107,0.2)] hover:bg-[#F5EEE4] transition-all"
            style={{
              height: '44px',
              borderRadius: '9999px',
              cursor: 'pointer',
            }}
            title="Modifier le budget de régie hebdomadaire"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#815431]" />
            <span className="hidden sm:inline">Budget régie</span>
          </button>
        )}
      </div>
    </div>
  )
}
