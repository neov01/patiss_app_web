'use client'

import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, AlertCircle, Calendar, Sparkles } from 'lucide-react'
import type { ExpenseCycle } from '@/lib/schemas/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'

interface Props {
  cycle: ExpenseCycle
  isPastCycleUnclosed?: boolean
  onOpenClosingModal?: () => void
}

export default function BudgetHeroGauge({
  cycle,
  isPastCycleUnclosed = false,
  onOpenClosingModal,
}: Props) {
  const { currency } = useCurrency()

  // Calcul du pourcentage dépensé
  const totalAllocated = Number(cycle.total_allocated) || 100000
  const totalSpent = Number(cycle.total_spent) || 0
  const currentBalance = Number(cycle.current_balance) || 0

  const spentRatio = totalAllocated > 0 ? Math.min(100, Math.max(0, (totalSpent / totalAllocated) * 100)) : 0
  const isOverBudget = currentBalance < 0
  const isLowBudget = !isOverBudget && currentBalance < totalAllocated * 0.2

  // Calcul du temps restant dans le cycle (Lundi au Dimanche)
  const { daysRemaining, dayIndexInWeek, cycleDateRangeLabel } = useMemo(() => {
    const now = new Date()
    const end = new Date(cycle.end_date)
    const start = new Date(cycle.start_date)

    const diffMs = end.getTime() - now.getTime()
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

    // Jour de la semaine (1 = Lundi, 7 = Dimanche)
    const dow = now.getDay() === 0 ? 7 : now.getDay()

    const startStr = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const endStr = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

    return {
      daysRemaining: daysLeft,
      dayIndexInWeek: dow,
      cycleDateRangeLabel: `Semaine du ${startStr} au ${endStr}`,
    }
  }, [cycle.end_date, cycle.start_date])

  // Couleur d'état selon le niveau de consommation
  let statusColor = '#4B6450' // Sage (Sain)
  let statusBadgeBg = '#E6F4EA'
  let statusBadgeText = '#137333'
  let statusLabel = 'Budget sain'
  let StatusIcon = CheckCircle2

  if (isOverBudget) {
    statusColor = '#BA1A1A' // Danger
    statusBadgeBg = '#FCE8E6'
    statusBadgeText = '#B31412'
    statusLabel = 'Dépassement de budget'
    StatusIcon = AlertCircle
  } else if (isLowBudget) {
    statusColor = '#C08A63' // Terracotta warning
    statusBadgeBg = '#FEF3C7'
    statusBadgeText = '#92400E'
    statusLabel = 'Seuil d’alerte (< 20%)'
    StatusIcon = AlertTriangle
  }

  // Formatage des montants
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="space-y-3">
      {/* Alerte non bloquante si le cycle de la semaine passée n'a pas été clôturé */}
      {isPastCycleUnclosed && (
        <div
          style={{
            backgroundColor: '#FEF3C7',
            border: '1px solid #FDE68A',
            color: '#92400E',
            borderRadius: '16px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-[#D97706]" />
            <span className="text-sm font-semibold">
              Le cycle de la semaine passée n'est pas encore clôturé. Clôturez-le pour réinitialiser le budget à {formatMoney(cycle.initial_budget)} {currency}.
            </span>
          </div>
          {onOpenClosingModal && (
            <button
              onClick={onOpenClosingModal}
              style={{
                backgroundColor: '#815431',
                color: '#FFFFFF',
                borderRadius: '9999px',
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Clôturer maintenant
            </button>
          )}
        </div>
      )}

      {/* Carte principale Cockpit Budgétaire */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(45,27,14,0.08), 0 1px 3px rgba(45,27,14,0.06)',
          border: '1px solid rgba(131, 116, 107, 0.15)',
        }}
      >
        {/* Ligne haute : Période et Statut */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[rgba(131,116,107,0.12)]">
          <div className="flex items-center gap-2">
            <span
              style={{
                backgroundColor: '#F5EEE4',
                color: '#815431',
                borderRadius: '9999px',
                padding: '4px 12px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Calendar className="w-3.5 h-3.5" />
              {cycleDateRangeLabel}
            </span>
            <span
              style={{
                backgroundColor: '#E0D8CE',
                color: '#4A3C31',
                borderRadius: '9999px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Jour {dayIndexInWeek} / 7
            </span>
          </div>

          <div
            style={{
              backgroundColor: statusBadgeBg,
              color: statusBadgeText,
              borderRadius: '9999px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            {statusLabel}
          </div>
        </div>

        {/* Cœur visuel : Solde restant et Jauge */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Bloc Chiffre Clé */}
          <div className="md:col-span-5">
            <span className="text-xs uppercase tracking-wider text-[#51443C] font-bold block mb-1">
              Solde disponible dans l'enveloppe
            </span>
            <div className="flex items-baseline gap-2">
              <span
                style={{
                  fontFamily: 'Manrope, Inter, sans-serif',
                  fontSize: '38px',
                  fontWeight: 800,
                  lineHeight: '44px',
                  letterSpacing: '-0.02em',
                  color: isOverBudget ? '#BA1A1A' : '#1A1C1A',
                }}
              >
                {formatMoney(currentBalance)}
              </span>
              <span className="text-lg font-bold text-[#815431]">{currency}</span>
            </div>
            <p className="text-xs text-[#51443C] mt-1">
              sur une enveloppe allouée de <strong>{formatMoney(totalAllocated)} {currency}</strong>
            </p>
          </div>

          {/* Bloc Jauge & Progression */}
          <div className="md:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#51443C]">
              <span>Consommation de la semaine</span>
              <span>
                <strong>{formatMoney(totalSpent)} {currency}</strong> dépensés ({spentRatio.toFixed(0)}%)
              </span>
            </div>

            {/* Barre de jauge stylisée */}
            <div
              style={{
                height: '14px',
                backgroundColor: '#F5EEE4',
                borderRadius: '9999px',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid rgba(131, 116, 107, 0.18)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${spentRatio}%`,
                  backgroundColor: statusColor,
                  borderRadius: '9999px',
                  transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>

            {/* Repères et indicateurs */}
            <div className="flex items-center justify-between text-[11px] text-[#51443C] pt-0.5">
              <span>0 {currency}</span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#C08A63]" />
                Reste {daysRemaining} jour{daysRemaining > 1 ? 's' : ''} avant la clôture du dimanche
              </span>
              <span>{formatMoney(totalAllocated)} {currency}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
