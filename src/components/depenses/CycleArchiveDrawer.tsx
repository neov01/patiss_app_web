'use client'

import { useState, useEffect } from 'react'
import { X, History, Calendar, CheckCircle, ArrowDownRight, Layers, Loader2 } from 'lucide-react'
import { getClosedExpenseCyclesAction } from '@/lib/actions/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function CycleArchiveDrawer({ isOpen, onClose }: Props) {
  const { currency } = useCurrency()
  const [cycles, setCycles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true)
      getClosedExpenseCyclesAction().then((res) => {
        if (res.success && res.cycles) {
          setCycles(res.cycles)
        }
        setIsLoading(false)
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div
        style={{
          backgroundColor: '#FFFFFF',
          maxWidth: '520px',
          width: '100%',
          height: '100%',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.15)',
        }}
        className="flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(131,116,107,0.15)] bg-[#FDFBF7]">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#815431]" />
            <h3 className="text-base font-bold text-[#1A1C1A] font-display">
              Archives des Semaines Clôturées
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#83746B] hover:text-[#1A1C1A] rounded-full hover:bg-[#F5EEE4]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-[#83746B]">
              <Loader2 className="w-8 h-8 animate-spin text-[#815431]" />
              <span className="text-xs">Chargement de l'historique...</span>
            </div>
          ) : cycles.length === 0 ? (
            <div className="py-20 text-center space-y-2 text-[#51443C]">
              <Calendar className="w-10 h-10 mx-auto text-[#83746B] opacity-50" />
              <h4 className="font-bold text-sm text-[#1A1C1A]">Aucun cycle archivé</h4>
              <p className="text-xs max-w-xs mx-auto">
                Les bilans des semaines passées apparaîtront ici après chaque clôture dominicale.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {cycles.map((c) => {
                const start = new Date(c.start_date).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })
                const end = new Date(c.end_date).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
                const closedDate = c.closed_at
                  ? new Date(c.closed_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : null

                return (
                  <div
                    key={c.id}
                    style={{
                      backgroundColor: '#FDFBF7',
                      borderRadius: '16px',
                      border: '1px solid rgba(131, 116, 107, 0.18)',
                      padding: '16px',
                    }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-[rgba(131,116,107,0.1)] pb-2">
                      <div>
                        <h4 className="font-bold text-sm text-[#1A1C1A]">
                          Semaine du {start} au {end}
                        </h4>
                        {closedDate && (
                          <span className="text-[11px] text-[#51443C]">
                            Clôturé le {closedDate} {c.profiles?.full_name ? `par ${c.profiles.full_name}` : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-[#4B6450] bg-[#E6F4EA] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Clôturé
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-[#FFFFFF] p-2 rounded-lg border border-[rgba(131,116,107,0.1)]">
                        <span className="text-[10px] text-[#51443C] block uppercase font-bold">Alloué</span>
                        <span className="font-black text-[#1A1C1A]">
                          {formatMoney(Number(c.total_allocated))} {currency}
                        </span>
                      </div>

                      <div className="bg-[#FFFFFF] p-2 rounded-lg border border-[rgba(131,116,107,0.1)]">
                        <span className="text-[10px] text-[#51443C] block uppercase font-bold">Dépensé</span>
                        <span className="font-black text-[#991B1B]">
                          -{formatMoney(Number(c.total_spent))} {currency}
                        </span>
                      </div>

                      <div className="bg-[#FFFFFF] p-2 rounded-lg border border-[rgba(131,116,107,0.1)]">
                        <span className="text-[10px] text-[#51443C] block uppercase font-bold">Solde final</span>
                        <span className="font-black text-[#4B6450]">
                          {formatMoney(Number(c.current_balance))} {currency}
                        </span>
                      </div>
                    </div>

                    {/* Détail de la recharge */}
                    {c.recharge_amount > 0 && (
                      <div className="flex items-center justify-between text-xs pt-1 text-[#51443C]">
                        <span>Recharge effectuée :</span>
                        <strong className="text-[#815431]">
                          +{formatMoney(Number(c.recharge_amount))} {currency} ({c.recharge_source === 'ventes_hebdo' ? 'Ventes' : 'Externe'})
                        </strong>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
