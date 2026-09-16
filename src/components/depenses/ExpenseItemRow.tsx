'use client'

import {
  Egg,
  Package,
  Sparkles,
  Bike,
  Utensils,
  Wrench,
  CircleEllipsis,
  Camera,
  XCircle,
  Clock,
  User,
} from 'lucide-react'
import { CATEGORY_CONFIG, type Expense } from '@/lib/schemas/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'

interface Props {
  expense: Expense
  onPreviewReceipt: (url: string) => void
  onCancelRequest: (expense: Expense) => void
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  ingredients_urgents: Egg,
  emballages: Package,
  entretien_hygiene: Sparkles,
  transport_courses: Bike,
  petit_materiel: Utensils,
  reparations: Wrench,
  autre: CircleEllipsis,
}

export default function ExpenseItemRow({
  expense,
  onPreviewReceipt,
  onCancelRequest,
}: Props) {
  const { currency } = useCurrency()
  const catConfig = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.autre
  const IconComponent = CATEGORY_ICONS[expense.category] || CircleEllipsis

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  const timeStr = new Date(expense.expense_date || expense.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      style={{
        backgroundColor: expense.is_cancelled ? '#F8F6F3' : '#FFFFFF',
        borderRadius: '16px',
        padding: '14px 18px',
        border: expense.is_cancelled
          ? '1px dashed rgba(186, 26, 26, 0.25)'
          : '1px solid rgba(131, 116, 107, 0.12)',
        opacity: expense.is_cancelled ? 0.72 : 1,
      }}
      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all hover:border-[rgba(131,116,107,0.25)]"
    >
      {/* Côté gauche : Catégorie & Libellé */}
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        {/* Icône de Catégorie */}
        <div
          style={{
            backgroundColor: catConfig.badgeBg,
            color: catConfig.badgeText,
            border: `1px solid ${catConfig.badgeBorder}`,
            borderRadius: '12px',
            padding: '10px',
          }}
          className="shrink-0"
        >
          <IconComponent className="w-5 h-5" />
        </div>

        {/* Détails textuels */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              style={{
                backgroundColor: catConfig.badgeBg,
                color: catConfig.badgeText,
                borderRadius: '9999px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {catConfig.shortLabel}
            </span>

            {/* Heure */}
            <span className="text-[11px] text-[#51443C] flex items-center gap-1 font-medium">
              <Clock className="w-3 h-3 text-[#83746B]" />
              {timeStr}
            </span>

            {/* Auteur */}
            {expense.profiles?.full_name && (
              <span className="text-[11px] text-[#51443C] flex items-center gap-1 font-medium">
                <User className="w-3 h-3 text-[#83746B]" />
                {expense.profiles.full_name}
              </span>
            )}

            {/* Badge mode de paiement */}
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#F5EEE4] text-[#815431]">
              {expense.payment_method}
            </span>
          </div>

          {/* Motif principal */}
          <h4
            className={`text-sm font-bold text-[#1A1C1A] leading-snug break-words ${
              expense.is_cancelled ? 'line-through text-[#83746B]' : ''
            }`}
          >
            {expense.description}
          </h4>

          {/* Motif d'annulation si applicable */}
          {expense.is_cancelled && (
            <div className="mt-1 text-xs text-[#991B1B] bg-[#FEE2E2] px-2 py-1 rounded-md inline-flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Annulée : <em>{expense.cancellation_reason || 'Erreur de saisie'}</em>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Côté droit : Justificatif, Montant & Action d'annulation */}
      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[rgba(131,116,107,0.1)]">
        {/* Bouton photo justificatif */}
        {expense.receipt_url ? (
          <button
            onClick={() => onPreviewReceipt(expense.receipt_url!)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#4B6450] bg-[#CDEAD0] hover:bg-[#b8dec0] rounded-lg transition-colors"
            title="Voir le reçu / ticket"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Reçu</span>
          </button>
        ) : (
          <span className="text-[11px] text-[#83746B] italic hidden sm:inline">
            Sans reçu
          </span>
        )}

        {/* Montant débité */}
        <div className="text-right">
          <div
            className={`text-base font-black tracking-tight font-display ${
              expense.is_cancelled ? 'text-[#83746B] line-through' : 'text-[#BA1A1A]'
            }`}
          >
            -{formatMoney(Number(expense.amount))} <span className="text-xs font-bold">{currency}</span>
          </div>
        </div>

        {/* Bouton Annulation (accessible au personnel avec motif obligatoire) */}
        {!expense.is_cancelled && (
          <button
            onClick={() => onCancelRequest(expense)}
            className="p-2 text-[#83746B] hover:text-[#BA1A1A] hover:bg-[#FEE2E2] rounded-lg transition-colors"
            title="Annuler cette dépense"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
