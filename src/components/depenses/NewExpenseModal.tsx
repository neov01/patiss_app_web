'use client'

import { useState, useRef } from 'react'
import {
  X,
  Camera,
  Egg,
  Package,
  Sparkles,
  Bike,
  Utensils,
  Wrench,
  CircleEllipsis,
  AlertTriangle,
  Loader2,
  Trash2,
} from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import {
  EXPENSE_CATEGORIES,
  CATEGORY_CONFIG,
  type ExpenseCategoryKey,
} from '@/lib/schemas/expenses'
import { createExpenseAction, uploadExpenseReceiptAction } from '@/lib/actions/expenses'
import { useCurrency } from '@/providers/CurrencyProvider'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  cycleId: string
  currentBalance: number
  onExpenseCreated: () => void
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

const QUICK_DESCRIPTION_SUGGESTIONS: Record<ExpenseCategoryKey, string[]> = {
  ingredients_urgents: ['Dépannage œufs', 'Beurre supermarché', 'Lait frais', 'Farine T55', 'Fruits de saison'],
  emballages: ['Cartons gâteaux', 'Rubans & ficelles', 'Sachets kraft', 'Papier cuisson'],
  entretien_hygiene: ['Produits vaisselle', 'Essuie-tout & gants', 'Javel & dégraissant', 'Sacs poubelle'],
  transport_courses: ['Course coursier moto', 'Taxi marché', 'Carburant livraison'],
  petit_materiel: ['Poche à douille', 'Spatule maryse', 'Pinceau pâtisserie', 'Thermomètre'],
  reparations: ['Dépannage batteur', 'Plomberie plonge', 'Ampoules labo'],
  autre: ['Fournitures bureau', 'Frais divers'],
}

export default function NewExpenseModal({
  isOpen,
  onClose,
  cycleId,
  currentBalance,
  onExpenseCreated,
}: Props) {
  const { currency } = useCurrency()
  const [amountStr, setAmountStr] = useState('')
  const [category, setCategory] = useState<ExpenseCategoryKey>('ingredients_urgents')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'orange_money' | 'wave' | 'autre'>('cash')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const amount = parseFloat(amountStr) || 0
  const isOverBalance = amount > currentBalance

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setReceiptFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveReceipt = () => {
    setReceiptFile(null)
    setReceiptPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (amount <= 0) {
      toast.error('Veuillez saisir un montant supérieur à 0')
      return
    }
    if (!description.trim()) {
      toast.error('Veuillez renseigner le motif de la dépense')
      return
    }

    setIsSubmitting(true)
    const toastId = toast.loading('Enregistrement de la dépense...')

    try {
      let receiptUrl: string | null = null

      // Téléversement du justificatif si fourni
      if (receiptFile) {
        const formData = new FormData()
        formData.append('file', receiptFile)
        const uploadRes = await uploadExpenseReceiptAction(formData)
        if (uploadRes.success && uploadRes.publicUrl) {
          receiptUrl = uploadRes.publicUrl
        }
      }

      // Enregistrement atomique
      const res = await createExpenseAction({
        cycle_id: cycleId,
        amount,
        category,
        description: description.trim(),
        payment_method: paymentMethod,
        receipt_url: receiptUrl,
      })

      if (!res.success) {
        toast.error(res.error || "Erreur lors de l'enregistrement", { id: toastId })
        return
      }

      toast.success('Dépense enregistrée avec succès', { id: toastId })
      onExpenseCreated()
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
          maxWidth: '560px',
          width: '100%',
          maxHeight: '92vh',
          boxShadow: '0 16px 48px rgba(45,27,14,0.2)',
          border: '1px solid rgba(131, 116, 107, 0.2)',
        }}
        className="flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* En-tête du modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(131,116,107,0.15)] bg-[#FDFBF7]">
          <div>
            <h3 className="text-lg font-bold text-[#1A1C1A] font-display">
              Nouvelle Dépense
            </h3>
            <p className="text-xs text-[#51443C]">
              Régie d'avances hebdomadaire (Solde dispo : {new Intl.NumberFormat('fr-FR').format(currentBalance)} {currency})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#83746B] hover:text-[#1A1C1A] hover:bg-[#F5EEE4] rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps du formulaire scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. Saisie Montant avec TouchInput */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Montant dépensé ({currency}) *
            </label>
            <TouchInput
              value={amountStr}
              onChange={setAmountStr}
              placeholder="0"
              title="Montant de la dépense"
              style={{
                height: '52px',
                fontSize: '22px',
                fontWeight: 'bold',
                backgroundColor: '#F5EEE4',
                borderRadius: '12px',
                color: '#1A1C1A',
                textAlign: 'left',
              }}
            />

            {/* Avertissement de dépassement de solde */}
            {isOverBalance && (
              <div className="mt-2 p-2.5 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#D97706] mt-0.5" />
                <span>
                  Ce montant dépasse le solde disponible de {new Intl.NumberFormat('fr-FR').format(amount - currentBalance)} {currency}.
                  Le solde passera en négatif jusqu'à la régularisation par une rallonge caisse.
                </span>
              </div>
            )}
          </div>

          {/* 2. Sélection de Catégorie (Boutons tactiles 48px) */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Catégorie de la dépense *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EXPENSE_CATEGORIES.map((catKey) => {
                const isSelected = category === catKey
                const cfg = CATEGORY_CONFIG[catKey]
                const Icon = CATEGORY_ICONS[catKey] || CircleEllipsis
                return (
                  <button
                    type="button"
                    key={catKey}
                    onClick={() => setCategory(catKey)}
                    style={{
                      height: '54px',
                      borderRadius: '12px',
                      backgroundColor: isSelected ? '#815431' : '#F5EEE4',
                      color: isSelected ? '#FFFFFF' : '#1A1C1A',
                      border: isSelected ? '2px solid #815431' : '1px solid rgba(131, 116, 107, 0.15)',
                    }}
                    className="flex items-center gap-2.5 px-3 text-left transition-all active:scale-[0.98]"
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-[#815431]'}`} />
                    <span className="text-xs font-bold leading-tight line-clamp-2">
                      {cfg.shortLabel}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Suggestions rapides de motifs */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1">
              Suggestions rapides
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DESCRIPTION_SUGGESTIONS[category]?.map((sugg) => (
                <button
                  type="button"
                  key={sugg}
                  onClick={() => setDescription(sugg)}
                  className="px-2.5 py-1 text-xs font-medium rounded-full bg-[#F5EEE4] hover:bg-[#E0D8CE] text-[#51443C] transition-colors"
                >
                  + {sugg}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Description / Motif personnalisé */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Motif exact de l'achat *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: 2 plateaux d'œufs pour la vitrine"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                height: '48px',
                backgroundColor: '#F5EEE4',
                borderRadius: '12px',
                border: '1px solid rgba(131, 116, 107, 0.2)',
                padding: '0 16px',
                fontSize: '14px',
                color: '#1A1C1A',
                width: '100%',
              }}
            />
          </div>

          {/* 5. Mode de paiement */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Payé en
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs font-bold">
              {[
                { id: 'cash', label: '💵 Espèces (caisse)' },
                { id: 'wave', label: '🌊 Wave' },
                { id: 'orange_money', label: '🍊 Orange Money' },
              ].map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id as any)}
                  style={{
                    height: '44px',
                    borderRadius: '10px',
                    backgroundColor: paymentMethod === m.id ? '#4B6450' : '#F5EEE4',
                    color: paymentMethod === m.id ? '#FFFFFF' : '#1A1C1A',
                    border: 'none',
                  }}
                  className="transition-all active:scale-[0.98]"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* 6. Photo du justificatif / reçu */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#51443C] block mb-1.5">
              Photo du reçu / ticket (facultatif)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {receiptPreview ? (
              <div className="relative inline-block border rounded-xl overflow-hidden shadow-xs">
                <img
                  src={receiptPreview}
                  alt="Aperçu reçu"
                  className="w-32 h-32 object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveReceipt}
                  className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#F5EEE4',
                  border: '1px dashed rgba(131, 116, 107, 0.4)',
                  color: '#51443C',
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-bold hover:bg-[#E0D8CE] transition-all"
              >
                <Camera className="w-4 h-4 text-[#815431]" />
                <span>Prendre en photo ou joindre un ticket</span>
              </button>
            )}
          </div>
        </form>

        {/* Pied du modal avec actions tactiles */}
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
            onClick={handleSubmit}
            disabled={isSubmitting || amount <= 0}
            style={{
              height: '48px',
              borderRadius: '9999px',
              backgroundColor: isSubmitting || amount <= 0 ? '#C08A63' : '#815431',
              color: '#FFFFFF',
              border: 'none',
            }}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-bold shadow-sm transition-all active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validation...</span>
              </>
            ) : (
              <span>Valider la dépense (-{new Intl.NumberFormat('fr-FR').format(amount)} {currency})</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
