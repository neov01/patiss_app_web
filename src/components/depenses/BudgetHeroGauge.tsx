'use client'

import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, AlertCircle, Calendar, Sparkles } from 'lucide-react'
import type { ExpenseCycle } from '@/lib/schemas/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'

interface Props {
  cycle: ExpenseCycle
  previousBilanMissing?: boolean
}

export default function BudgetHeroGauge({
  cycle,
  previousBilanMissing = false,
}: Props) {
  const { currency } = useCurrency()

  // Calcul du pourcentage dépensé
  const totalAllocated = Number(cycle.total_allocated) || 150000
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
  let statusColor = 'var(--color-secondary)' // Sage (Sain)
  let statusBadgeBg = '#E6F4EA'
  let statusBadgeText = '#137333'
  let statusLabel = 'Budget sain'
  let StatusIcon = CheckCircle2

  if (isOverBudget) {
    statusColor = 'var(--color-error)' // Danger
    statusBadgeBg = '#FCE8E6'
    statusBadgeText = '#B31412'
    statusLabel = 'Dépassement de budget'
    StatusIcon = AlertCircle
  } else if (isLowBudget) {
    statusColor = 'var(--color-primary-container)' // Terracotta warning
    statusBadgeBg = 'var(--color-badge-warning-bg)'
    statusBadgeText = 'var(--color-badge-warning-text)'
    statusLabel = 'Seuil d’alerte (< 20%)'
    StatusIcon = AlertTriangle
  }

  // Formatage des montants
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="space-y-3">
      {/* Information non bloquante : la semaine précédente a basculé sans bilan */}
      {previousBilanMissing && (
        <div
          role="status"
          style={{
            backgroundColor: 'var(--color-badge-warning-bg)',
            border: '1px solid #FDE68A',
            color: 'var(--color-badge-warning-text)',
            borderRadius: '16px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 text-[color:var(--color-badge-warning-accent)]" />
          <span className="text-sm font-semibold">
            Le bilan de la semaine dernière n&apos;a pas été fait : la recharge de l&apos;enveloppe n&apos;a pas été enregistrée en caisse.
            La semaine en cours a démarré automatiquement à {formatMoney(Number(cycle.initial_budget))} {currency}.
          </span>
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
                backgroundColor: 'var(--color-well)',
                color: 'var(--color-primary)',
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
                backgroundColor: 'var(--color-surface-variant)',
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
            <span className="text-xs uppercase tracking-wider text-[color:var(--color-muted)] font-bold block mb-1">
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
                  color: isOverBudget ? 'var(--color-error)' : 'var(--color-text)',
                }}
              >
                {formatMoney(currentBalance)}
              </span>
              <span className="text-lg font-bold text-[color:var(--color-primary)]">{currency}</span>
            </div>
            <p className="text-xs text-[color:var(--color-muted)] mt-1">
              sur une enveloppe allouée de <strong>{formatMoney(totalAllocated)} {currency}</strong>
            </p>
          </div>

          {/* Bloc Jauge & Progression */}
          <div className="md:col-span-7 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[color:var(--color-muted)]">
              <span>Consommation de la semaine</span>
              <span>
                <strong>{formatMoney(totalSpent)} {currency}</strong> dépensés ({spentRatio.toFixed(0)}%)
              </span>
            </div>

            {/* Barre de jauge stylisée */}
            <div
              style={{
                height: '14px',
                backgroundColor: 'var(--color-well)',
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
            <div className="flex items-center justify-between text-[11px] text-[color:var(--color-muted)] pt-0.5">
              <span>0 {currency}</span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[color:var(--color-primary-container)]" />
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
