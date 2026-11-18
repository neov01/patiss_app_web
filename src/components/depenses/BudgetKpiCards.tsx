'use client'

import { Wallet, TrendingUp, ArrowDownRight, Layers } from 'lucide-react'
import type { ExpenseCycle, Expense, BudgetTopUp } from '@/lib/schemas/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'

interface Props {
  cycle: ExpenseCycle
  expenses: Expense[]
  topUps: BudgetTopUp[]
}

export default function BudgetKpiCards({ cycle, expenses, topUps }: Props) {
  const { currency } = useCurrency()

  const activeExpenses = expenses.filter((e) => !e.is_cancelled)
  const totalTopUps = topUps.reduce((sum, t) => sum + Number(t.amount || 0), 0)

  // Rythme moyen par jour écoulé
  const now = new Date()
  const start = new Date(cycle.start_date)
  const elapsedDays = Math.max(1, Math.min(7, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))))
  const dailyAverage = activeExpenses.length > 0 ? Number(cycle.total_spent) / elapsedDays : 0

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {/* 1. Budget Initial & Alloué */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 2px 8px rgba(45,27,14,0.06)',
          border: '1px solid rgba(131, 116, 107, 0.15)',
        }}
        className="flex flex-col justify-between"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--color-muted)]">
            Enveloppe Allouée
          </span>
          <div
            style={{
              backgroundColor: 'var(--color-well)',
              color: 'var(--color-primary)',
              borderRadius: '10px',
              padding: '6px',
            }}
          >
            <Wallet className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="text-xl md:text-2xl font-black text-[color:var(--color-text)] tracking-tight font-display">
            {formatMoney(Number(cycle.total_allocated))} <span className="text-sm font-bold text-[color:var(--color-primary)]">{currency}</span>
          </div>
          <p className="text-[11px] text-[color:var(--color-muted)] mt-1 font-medium">
            Base fixe : {formatMoney(Number(cycle.initial_budget))} {currency}
          </p>
        </div>
      </div>

      {/* 2. Total Dépensé Net */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 2px 8px rgba(45,27,14,0.06)',
          border: '1px solid rgba(131, 116, 107, 0.15)',
        }}
        className="flex flex-col justify-between"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--color-muted)]">
            Total Dépensé
          </span>
          <div
            style={{
              backgroundColor: 'var(--color-badge-danger-bg)',
              color: 'var(--color-badge-danger-text)',
              borderRadius: '10px',
              padding: '6px',
            }}
          >
            <ArrowDownRight className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="text-xl md:text-2xl font-black text-[color:var(--color-badge-danger-text)] tracking-tight font-display">
            {formatMoney(Number(cycle.total_spent))} <span className="text-sm font-bold">{currency}</span>
          </div>
          <p className="text-[11px] text-[color:var(--color-muted)] mt-1 font-medium">
            {activeExpenses.length} achat{activeExpenses.length > 1 ? 's' : ''} validé{activeExpenses.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* 3. Rallonges exceptionnelles */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 2px 8px rgba(45,27,14,0.06)',
          border: '1px solid rgba(131, 116, 107, 0.15)',
        }}
        className="flex flex-col justify-between"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--color-muted)]">
            Rallonges Caisse
          </span>
          <div
            style={{
              backgroundColor: 'var(--color-badge-success-soft-bg)',
              color: 'var(--color-badge-success-text)',
              borderRadius: '10px',
              padding: '6px',
            }}
          >
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="text-xl md:text-2xl font-black text-[color:var(--color-secondary)] tracking-tight font-display">
            +{formatMoney(totalTopUps)} <span className="text-sm font-bold">{currency}</span>
          </div>
          <p className="text-[11px] text-[color:var(--color-muted)] mt-1 font-medium">
            {topUps.length} injection{topUps.length > 1 ? 's' : ''} en cours de semaine
          </p>
        </div>
      </div>

      {/* 4. Rythme Quotidien */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 2px 8px rgba(45,27,14,0.06)',
          border: '1px solid rgba(131, 116, 107, 0.15)',
        }}
        className="flex flex-col justify-between"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--color-muted)]">
            Moyenne / Jour
          </span>
          <div
            style={{
              backgroundColor: 'var(--color-badge-crm-bg)',
              color: 'var(--color-badge-production-text)',
              borderRadius: '10px',
              padding: '6px',
            }}
          >
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div>
          <div className="text-xl md:text-2xl font-black text-[color:var(--color-text)] tracking-tight font-display">
            ~{formatMoney(dailyAverage)} <span className="text-sm font-bold text-[color:var(--color-primary)]">{currency}</span>
          </div>
          <p className="text-[11px] text-[color:var(--color-muted)] mt-1 font-medium">
            sur les {elapsedDays} jour{elapsedDays > 1 ? 's' : ''} écoulé{elapsedDays > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
