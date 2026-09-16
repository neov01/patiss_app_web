'use client'

import { useState, useMemo } from 'react'
import { Search, Filter, Layers, Inbox } from 'lucide-react'
import ExpenseItemRow from './ExpenseItemRow'
import {
  EXPENSE_CATEGORIES,
  CATEGORY_CONFIG,
  type Expense,
  type BudgetTopUp,
  type ExpenseCategoryKey,
} from '@/lib/schemas/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'

interface Props {
  expenses: Expense[]
  topUps: BudgetTopUp[]
  onPreviewReceipt: (url: string) => void
  onCancelRequest: (expense: Expense) => void
}

type FeedItem =
  | { type: 'expense'; date: Date; data: Expense }
  | { type: 'topup'; date: Date; data: BudgetTopUp }

export default function ExpenseHistoryFeed({
  expenses,
  topUps,
  onPreviewReceipt,
  onCancelRequest,
}: Props) {
  const { currency } = useCurrency()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Fusion et tri chronologique inverse des dépenses et des rallonges
  const feedItems = useMemo(() => {
    const items: FeedItem[] = []

    expenses.forEach((e) => {
      items.push({
        type: 'expense',
        date: new Date(e.expense_date || e.created_at),
        data: e,
      })
    })

    topUps.forEach((t) => {
      items.push({
        type: 'topup',
        date: new Date(t.created_at),
        data: t,
      })
    })

    return items.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [expenses, topUps])

  // Filtrage par catégorie et par recherche
  const filteredItems = useMemo(() => {
    return feedItems.filter((item) => {
      if (item.type === 'expense') {
        if (selectedCategory !== 'all' && item.data.category !== selectedCategory) {
          return false
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const descMatch = item.data.description.toLowerCase().includes(q)
          const authorMatch = item.data.profiles?.full_name?.toLowerCase().includes(q) || false
          if (!descMatch && !authorMatch) return false
        }
        return true
      } else {
        // top-up
        if (selectedCategory !== 'all') return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const reasonMatch = item.data.reason.toLowerCase().includes(q)
          const authorMatch = item.data.profiles?.full_name?.toLowerCase().includes(q) || false
          if (!reasonMatch && !authorMatch) return false
        }
        return true
      }
    })
  }, [feedItems, selectedCategory, searchQuery])

  // Regroupement par jour
  const groupedByDay = useMemo(() => {
    const groups: { label: string; date: string; items: FeedItem[] }[] = []
    const todayStr = new Date().toDateString()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toDateString()

    filteredItems.forEach((item) => {
      const itemDateStr = item.date.toDateString()
      let label = item.date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })

      // Capitaliser le jour
      label = label.charAt(0).toUpperCase() + label.slice(1)

      if (itemDateStr === todayStr) {
        label = `Aujourd'hui (${label})`
      } else if (itemDateStr === yesterdayStr) {
        label = `Hier (${label})`
      }

      let existing = groups.find((g) => g.date === itemDateStr)
      if (!existing) {
        existing = { label, date: itemDateStr, items: [] }
        groups.push(existing)
      }
      existing.items.push(item)
    })

    return groups
  }, [filteredItems])

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="space-y-4">
      {/* Barre de filtre et de recherche */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '14px 18px',
          border: '1px solid rgba(131, 116, 107, 0.15)',
        }}
        className="space-y-3"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Recherche */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#83746B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher une dépense ou un auteur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                height: '40px',
                backgroundColor: '#F5EEE4',
                borderRadius: '10px',
                border: 'none',
                paddingLeft: '36px',
                paddingRight: '12px',
                fontSize: '13px',
                color: '#1A1C1A',
                width: '100%',
              }}
            />
          </div>

          {/* Compteur d'éléments */}
          <div className="text-xs font-bold text-[#51443C] shrink-0 text-right">
            {filteredItems.length} opération{filteredItems.length > 1 ? 's' : ''} trouvée{filteredItems.length > 1 ? 's' : ''}
          </div>
        </div>

        {/* Puces de filtrage par catégorie */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              fontWeight: 700,
              backgroundColor: selectedCategory === 'all' ? '#4B6450' : '#F5EEE4',
              color: selectedCategory === 'all' ? '#FFFFFF' : '#51443C',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Toutes
          </button>

          {EXPENSE_CATEGORIES.map((catKey) => {
            const isSelected = selectedCategory === catKey
            const cfg = CATEGORY_CONFIG[catKey]
            return (
              <button
                key={catKey}
                onClick={() => setSelectedCategory(catKey)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  backgroundColor: isSelected ? '#815431' : '#F5EEE4',
                  color: isSelected ? '#FFFFFF' : '#51443C',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {cfg.shortLabel}
              </button>
            )
          })}
        </div>
      </div>

      {/* Fil chronologique */}
      {groupedByDay.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '48px 24px',
            textAlign: 'center',
            border: '1px solid rgba(131, 116, 107, 0.15)',
          }}
          className="space-y-2"
        >
          <Inbox className="w-10 h-10 text-[#83746B] mx-auto opacity-50" />
          <h3 className="text-base font-bold text-[#1A1C1A]">Aucune dépense enregistrée</h3>
          <p className="text-xs text-[#51443C] max-w-sm mx-auto">
            Utilisez le bouton « Nouvelle dépense » ci-dessus pour saisir les achats d'ingrédients, emballages ou courses de fonctionnement.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map((group) => {
            // Calcul du total dépensé ce jour-là
            const dayExpensesTotal = group.items.reduce((sum, it) => {
              if (it.type === 'expense' && !it.data.is_cancelled) {
                return sum + Number(it.data.amount)
              }
              return sum
            }, 0)

            return (
              <div key={group.date} className="space-y-2.5">
                {/* En-tête de jour */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#51443C]">
                    {group.label}
                  </span>
                  {dayExpensesTotal > 0 && (
                    <span className="text-xs font-semibold text-[#815431]">
                      Total jour : -{formatMoney(dayExpensesTotal)} {currency}
                    </span>
                  )}
                </div>

                {/* Liste des éléments du jour */}
                <div className="space-y-2">
                  {group.items.map((item) => {
                    if (item.type === 'expense') {
                      return (
                        <ExpenseItemRow
                          key={item.data.id}
                          expense={item.data}
                          onPreviewReceipt={onPreviewReceipt}
                          onCancelRequest={onCancelRequest}
                        />
                      )
                    } else {
                      // Carte spéciale d'injection / rallonge de fonds
                      return (
                        <div
                          key={item.data.id}
                          style={{
                            backgroundColor: '#F4F9F5',
                            borderRadius: '16px',
                            padding: '14px 18px',
                            border: '1px solid rgba(75, 100, 80, 0.25)',
                          }}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              style={{
                                backgroundColor: '#CDEAD0',
                                color: '#4B6450',
                                borderRadius: '12px',
                                padding: '10px',
                              }}
                            >
                              <Layers className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="bg-[#4B6450] text-white text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full">
                                  Rallonge caisse
                                </span>
                                <span className="text-[11px] text-[#51443C] font-medium">
                                  {item.date.toLocaleTimeString('fr-FR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {item.data.profiles?.full_name && (
                                  <span className="text-[11px] text-[#51443C]">
                                    par {item.data.profiles.full_name}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-[#1A1C1A]">
                                {item.data.reason}
                              </p>
                              <span className="text-[11px] text-[#4B6450] italic">
                                Source : {item.data.source === 'caisse_du_jour' ? 'Tiroir-caisse des ventes (débit vérifié)' : 'Apport externe gérant'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-base font-black text-[#4B6450] tracking-tight font-display">
                              +{formatMoney(Number(item.data.amount))} <span className="text-xs font-bold">{currency}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
