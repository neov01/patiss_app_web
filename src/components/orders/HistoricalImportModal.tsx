'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Upload, Download, Plus, Trash2, FileText, CheckCircle2, Image as ImageIcon, Flame } from 'lucide-react'
import { toast } from 'sonner'
import { importHistoricalOrder } from '@/lib/actions/orders'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import ExcelJS from 'exceljs'
import { compressImage } from '@/lib/utils/image-compression'
import TouchInput from '@/components/ui/TouchInput'
import DatePicker from '@/components/ui/DatePicker'
import TimeDigiPad from '@/components/ui/TimeDigiPad'

interface Product {
  id: string
  name: string
  selling_price: number
  current_stock: number | null
}

interface ItemInput {
  product_id?: string
  name: string
  quantity: number
  unit_price: number
  parts?: number
  floors?: number
  candles_fontaine?: number
  candles_ficelle?: number
  notes?: string
  imageFile?: File | null
}

type ExcelCellPrimitive = string | number | boolean | Date

interface ParsedImportItem {
  product_id: string | null
  name: string
  quantity: number
  unit_price: number
}

interface ParsedImportOrder {
  customer_name: string
  customer_contact: string
  created_at: string
  pickup_date: string
  items: ParsedImportItem[]
  notes_list: string[]
  ac1Montant: number
  ac1Moyen: string
  ac2Montant: number
  ac2Moyen: string
  soldeMontant: number
  soldeMoyen: string
  total_amount?: number
  deposit_amount?: number
  payments?: Array<{ amount: number; payment_method: string; label_type: 'ACOMPTE' | 'SOLDE' }>
  payment_status_label?: string
  payment_status?: string
  status?: string
  balance?: number
  customization_notes?: string
}

interface HistoricalImportModalProps {
  open: boolean
  onClose: () => void
  products: Product[]
  currency: string
  onSuccess: () => void
}

const PAYMENT_METHODS = [
  { value: 'Espèces', label: '💵 Espèces' },
  { value: 'Orange Money', label: '🟠 Orange Money' },
  { value: 'Wave', label: '🌊 Wave' },
  { value: 'MTN MOMO', label: '🍌 MTN MOMO' },
  { value: 'Moov Money', label: '🔵 Moov Money' },
]

const VALID_PAYMENT_METHODS = ['Espèces', 'Orange Money', 'Wave', 'MTN MOMO', 'Moov Money']

function formatDateToDDMMYYYY(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()
  return `${day}-${month}-${year}`
}

function parseAndFormatDate(cellValue: unknown): string {
  if (cellValue === null || cellValue === undefined) return ''

  if (cellValue instanceof Date) {
    return formatDateToDDMMYYYY(cellValue)
  }

  if (typeof cellValue === 'number') {
    const date = new Date(Math.round((cellValue - 25569) * 86400 * 1000))
    return formatDateToDDMMYYYY(date)
  }

  const val = String(cellValue).trim()
  
  if (/^\d{2}-\d{2}-\d{4}$/.test(val)) {
    return val
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const parts = val.split('-')
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }

  if (val.match(/^\d{4}-\d{2}-\d{2}/)) {
    const date = new Date(val)
    if (!isNaN(date.getTime())) {
      return formatDateToDDMMYYYY(date)
    }
  }

  return val
}

function validateDateFormat(dateStr: string): boolean {
  return /^\d{2}-\d{2}-\d{4}$/.test(dateStr)
}

function ddMmYyyyToIsoString(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return ''
  const day = parts[0]
  const month = parts[1]
  const year = parts[2]
  return new Date(`${year}-${month}-${day}T12:00:00.000Z`).toISOString()
}

function normalizeExcelCellValue(value: ExcelJS.CellValue): ExcelCellPrimitive | '' {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) {
      return normalizeExcelCellValue(value.result as ExcelJS.CellValue)
    }
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map(part => part.text).join('')
    }
    if ('hyperlink' in value && 'text' in value && typeof value.text === 'string') return value.text
  }
  return String(value)
}

export default function HistoricalImportModal({ open, onClose, products, currency, onSuccess }: HistoricalImportModalProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'manual' | 'csv'>('manual')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Saisie Manuelle State ──
  const [orderNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerContact, setCustomerContact] = useState('')
  const [createdAt, setCreatedAt] = useState<Date | null>(null)
  const [pickupDate, setPickupDate] = useState<Date | null>(null)
  const [pickupTime, setPickupTime] = useState('')
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositMethod, setDepositMethod] = useState('Espèces')
  const [balanceMethod, setBalanceMethod] = useState('Espèces')
  const [paymentType, setPaymentType] = useState<'ACOMPTE' | 'SOLDE'>('SOLDE')

  // Paiement Multiple
  const [isMultiplePayment, setIsMultiplePayment] = useState(false)
  const [payments, setPayments] = useState<Array<{ id: string, amount: number, payment_method: string, label_type: 'ACOMPTE' | 'SOLDE' }>>([
    { id: '1', amount: 0, payment_method: 'Espèces', label_type: 'SOLDE' }
  ])
  
  const [items, setItems] = useState<ItemInput[]>([
    { name: '', quantity: 1, unit_price: 0, candles_fontaine: 0, candles_ficelle: 0, notes: '', imageFile: null }
  ])
  const [activeCandlesIndex, setActiveCandlesIndex] = useState<number | null>(null)

  const handleUpdateCandle = (index: number, type: 'candles_fontaine' | 'candles_ficelle', val: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [type]: val } : item))
  }

  // ── Excel Import State ──
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [parsedOrders, setParsedOrders] = useState<ParsedImportOrder[]>([])
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Calculer le total à la volée incluant les bougies
  const calculatedTotal = items.reduce((sum, item) => {
    const itemTotal = item.quantity * item.unit_price
    const fontaineTotal = (item.candles_fontaine || 0) * 2000
    const ficelleTotal = (item.candles_ficelle || 0) * 1000
    return sum + itemTotal + fontaineTotal + ficelleTotal
  }, 0)

  const totalPayments = isMultiplePayment
    ? payments.reduce((sum, p) => sum + p.amount, 0)
    : depositAmount

  // Quand mode Soldé : le dépôt suit automatiquement le total
  useEffect(() => {
    if (paymentType === 'SOLDE') {
      setDepositAmount(calculatedTotal)
    }
  }, [paymentType, calculatedTotal])

  const handleAddItem = () => {
    setItems(prev => [...prev, { name: '', quantity: 1, unit_price: 0, candles_fontaine: 0, candles_ficelle: 0, notes: '', imageFile: null }])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: keyof ItemInput, value: ItemInput[keyof ItemInput]) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      
      if (field === 'product_id') {
        const productId = typeof value === 'string' ? value : undefined
        const prod = products.find(p => p.id === productId)
        return {
          ...item,
          product_id: productId,
          name: prod ? prod.name : item.name,
          unit_price: prod ? prod.selling_price : item.unit_price
        }
      }
      return { ...item, [field]: value }
    }))
  }

  // ── Soumission Manuelle ──
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim()) return toast.error('Nom du client requis')
    if (!createdAt) return toast.error('Date de prise de commande requise')
    if (!pickupDate) return toast.error('Date de retrait requise')
    if (items.some(item => !item.name.trim())) return toast.error('Tous les articles doivent avoir une désignation')
    if (items.some(item => item.quantity <= 0)) return toast.error('Toutes les quantités doivent être positives')

    if (!isMultiplePayment && depositAmount > calculatedTotal) {
      return toast.error("L'acompte ne peut pas être supérieur au montant total")
    }

    if (isMultiplePayment) {
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
      if (totalPaid > calculatedTotal) {
        return toast.error("Le total des paiements ne peut pas être supérieur au montant total de la commande")
      }
    }

    setIsSubmitting(true)
    try {
      // Fonction interne d'upload d'une image d'article
      const uploadImage = async (file: File): Promise<string | undefined> => {
        try {
          const compressed = await compressImage(file, { maxWidth: 1200, quality: 0.7 })
          const supabase = createSupabaseClient()
          const filePath = `orders/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
          
          const { error: uploadError } = await supabase.storage.from('order-images').upload(filePath, compressed, {
            contentType: 'image/webp',
            upsert: true
          })
          
          if (!uploadError) {
            const { data } = supabase.storage.from('order-images').getPublicUrl(filePath)
            return data.publicUrl
          } else {
            console.error('Upload de la photo échoué:', uploadError)
          }
        } catch (err) {
          console.error("Erreur compression/upload:", err)
        }
        return undefined
      }

      // Uploader toutes les images en parallèle
      const itemsWithUrls = await Promise.all(
        items.map(async (item) => {
          let imageUrl: string | undefined = undefined
          if (item.imageFile) {
            imageUrl = await uploadImage(item.imageFile)
          }
          return { ...item, imageUrl }
        })
      )

      // Trouver la première URL d'image disponible pour custom_image_url
      const firstImageUrl = itemsWithUrls.find(i => i.imageUrl)?.imageUrl

      // Construire le JSON structuré des notes et images pour chaque article
      const notesArray = itemsWithUrls.map((item) => {
        let finalName = item.name.trim()
        const partsStr = item.parts ? `${item.parts} parts` : ''
        const floorsStr = item.floors ? `${item.floors} étage${item.floors > 1 ? 's' : ''}` : ''
        const details = [partsStr, floorsStr].filter(Boolean).join(', ')
        if (details) {
          finalName = `${finalName} (${details})`
        }
        return {
          name: finalName,
          notes: item.notes?.trim() || '',
          image_url: item.imageUrl || ''
        }
      })

      // On n'enregistre le JSON que si au moins un article a des notes ou une image
      const hasCustomization = notesArray.some(n => n.notes || n.image_url)
      const customizationNotes = hasCustomization ? JSON.stringify(notesArray) : undefined

      const calculatedDeposit = isMultiplePayment
        ? payments.filter(p => p.label_type === 'ACOMPTE').reduce((sum, p) => sum + p.amount, 0)
        : depositAmount

      const pickupDateWithTime = new Date(pickupDate)
      if (pickupTime) {
        const [hh, mm] = pickupTime.split(':')
        pickupDateWithTime.setHours(parseInt(hh), parseInt(mm), 0, 0)
      } else {
        pickupDateWithTime.setHours(10, 0, 0, 0)
      }

      const payload = {
        order_number: orderNumber.trim() || undefined,
        customer_name: customerName.trim(),
        customer_contact: customerContact.trim() || undefined,
        pickup_date: pickupDateWithTime.toISOString(),
        created_at: createdAt.toISOString(),
        total_amount: calculatedTotal,
        deposit_amount: calculatedDeposit,
        deposit_payment_method: !isMultiplePayment && depositAmount > 0 ? depositMethod : undefined,
        balance_payment_method: !isMultiplePayment && calculatedTotal - depositAmount > 0 ? balanceMethod : undefined,
        payments: isMultiplePayment ? payments.map(p => ({
          amount: p.amount,
          payment_method: p.payment_method,
          label_type: p.label_type
        })) : undefined,
        customization_notes: customizationNotes,
        custom_image_url: firstImageUrl,
        items: (() => {
          const finalItems = []
          for (const item of items) {
            let finalName = item.name.trim()
            const partsStr = item.parts ? `${item.parts} parts` : ''
            const floorsStr = item.floors ? `${item.floors} étage${item.floors > 1 ? 's' : ''}` : ''
            const details = [partsStr, floorsStr].filter(Boolean).join(', ')
            if (details) {
              finalName = `${finalName} (${details})`
            }
            finalItems.push({
              name: finalName,
              quantity: item.quantity,
              unit_price: item.unit_price,
              product_id: item.product_id || null,
              from_inventory: !!item.product_id
            })
          }
          
          let totalFontaine = 0
          let totalFicelle = 0
          for (const item of items) {
            totalFontaine += item.candles_fontaine || 0
            totalFicelle += item.candles_ficelle || 0
          }
          
          if (totalFontaine > 0) {
            finalItems.push({
              name: "Bougie Fontaine",
              quantity: totalFontaine,
              unit_price: 2000,
              product_id: null,
              from_inventory: false
            })
          }
          
          if (totalFicelle > 0) {
            finalItems.push({
              name: "Bougie Ficelle",
              quantity: totalFicelle,
              unit_price: 1000,
              product_id: null,
              from_inventory: false
            })
          }
          return finalItems
        })()
      }

      const res = await importHistoricalOrder(payload)
      if (res.success) {
        toast.success('Bon de commande historique inséré avec succès')
        onSuccess()
        onClose()
      } else {
        toast.error(res.error || 'Erreur lors de l\'insertion')
      }
    } catch (err: unknown) {
      toast.error('Erreur technique : ' + (err instanceof Error ? err.message : 'Erreur inconnue'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Télécharger le Modèle Excel ──
  const handleDownloadTemplate = () => {
    const link = document.createElement('a')
    link.href = '/gabarit_import_commandes_tracabilite.xlsx'
    link.setAttribute('download', 'gabarit_import_commandes_tracabilite.xlsx')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Parser le fichier Excel ──
  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFile(file)

    const reader = new FileReader()
    reader.onload = async (event) => {
      const data = event.target?.result
      if (!data) return

      try {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(data as ArrayBuffer)
        const worksheet = workbook.worksheets[0]
        const rows: Array<Array<ExcelCellPrimitive | ''>> = []

        worksheet?.eachRow({ includeEmpty: true }, row => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : []
          rows.push(values.map(value => normalizeExcelCellValue(value as ExcelJS.CellValue)))
        })

        if (rows.length <= 1) {
          toast.error('Le fichier Excel est vide ou ne contient pas de données')
          return
        }

        const headers = rows[0].map(h => String(h).trim())

        const colIndices = {
          customerName: headers.findIndex(h => h.startsWith('Nom Client')),
          customerContact: headers.findIndex(h => h.startsWith('Téléphone Client')),
          dateCmd: headers.findIndex(h => h.startsWith('Date Prise de Commande')),
          dateRetrait: headers.findIndex(h => h.startsWith('Date de Retrait')),
          productName: headers.findIndex(h => h.startsWith('Désignation Article')),
          parts: headers.findIndex(h => h.startsWith('Parts')),
          floors: headers.findIndex(h => h.startsWith('Étages')),
          quantity: headers.findIndex(h => h.startsWith('Quantité')),
          price: headers.findIndex(h => h.startsWith('Prix Article')),
          ac1Montant: headers.findIndex(h => h.startsWith('Acompte 1 - Montant')),
          ac1Moyen: headers.findIndex(h => h.startsWith('Acompte 1 - Moyen')),
          ac2Montant: headers.findIndex(h => h.startsWith('Acompte 2 - Montant')),
          ac2Moyen: headers.findIndex(h => h.startsWith('Acompte 2 - Moyen')),
          soldeMontant: headers.findIndex(h => h.startsWith('Solde - Montant')),
          soldeMoyen: headers.findIndex(h => h.startsWith('Solde - Moyen')),
          notes: headers.findIndex(h => h.startsWith('Notes'))
        }

        if (
          colIndices.customerName === -1 || 
          colIndices.dateCmd === -1 || 
          colIndices.dateRetrait === -1 || 
          colIndices.productName === -1 ||
          colIndices.ac1Montant === -1 ||
          colIndices.ac1Moyen === -1 ||
          colIndices.ac2Montant === -1 ||
          colIndices.ac2Moyen === -1 ||
          colIndices.soldeMontant === -1 ||
          colIndices.soldeMoyen === -1
        ) {
          toast.error('Le format du fichier Excel ne correspond pas au gabarit V5 de traçabilité (colonnes requises manquantes)')
          return
        }

        const ordersMap: Record<string, ParsedImportOrder> = {}
        const errorsList: string[] = []

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.length === 0) continue

          const isEmptyRow = row.every(val => val === null || val === undefined || String(val).trim() === '')
          if (isEmptyRow) continue

          const clientName = String(row[colIndices.customerName] || '').trim()
          const rawDateCmd = row[colIndices.dateCmd]
          const rawDateRetrait = row[colIndices.dateRetrait]
          const productName = String(row[colIndices.productName] || '').trim()

          if (!clientName && !productName) {
            continue
          }

          if (!clientName) {
            errorsList.push(`Ligne ${i + 1} : Le nom du client est requis.`)
            continue
          }
          if (!productName) {
            errorsList.push(`Ligne ${i + 1} : La désignation de l'article est requise.`)
            continue
          }

          const dateCmdStr = parseAndFormatDate(rawDateCmd)
          if (!validateDateFormat(dateCmdStr)) {
            errorsList.push(`Ligne ${i + 1} : La date de prise de commande "${dateCmdStr || rawDateCmd}" est invalide ou ne respecte pas le format JJ-MM-AAAA.`)
            continue
          }

          const dateRetraitStr = parseAndFormatDate(rawDateRetrait)
          if (!validateDateFormat(dateRetraitStr)) {
            errorsList.push(`Ligne ${i + 1} : La date de retrait "${dateRetraitStr || rawDateRetrait}" est invalide ou ne respecte pas le format JJ-MM-AAAA.`)
            continue
          }

          const customerContact = colIndices.customerContact !== -1 ? String(row[colIndices.customerContact] || '').trim() : ''
          const parts = colIndices.parts !== -1 ? parseInt(String(row[colIndices.parts])) || null : null
          const floors = colIndices.floors !== -1 ? parseInt(String(row[colIndices.floors])) || null : null
          const quantity = colIndices.quantity !== -1 ? parseInt(String(row[colIndices.quantity])) || 1 : 1
          const price = colIndices.price !== -1 ? parseFloat(String(row[colIndices.price])) || 0 : 0
          const notes = colIndices.notes !== -1 ? String(row[colIndices.notes] || '').trim() : ''

          // Extraction et validation des transactions de paiement
          const ac1Val = parseFloat(String(row[colIndices.ac1Montant])) || 0
          const ac1MoyenVal = String(row[colIndices.ac1Moyen] || '').trim()
          if (ac1Val > 0) {
            if (!ac1MoyenVal) {
              errorsList.push(`Ligne ${i + 1} : Le moyen de paiement pour l'Acompte 1 est requis car le montant est supérieur à 0.`)
              continue
            }
            if (!VALID_PAYMENT_METHODS.includes(ac1MoyenVal)) {
              errorsList.push(`Ligne ${i + 1} : Le moyen de paiement "${ac1MoyenVal}" pour l'Acompte 1 est invalide. Valeurs acceptées : ${VALID_PAYMENT_METHODS.join(', ')}.`)
              continue
            }
          }

          const ac2Val = parseFloat(String(row[colIndices.ac2Montant])) || 0
          const ac2MoyenVal = String(row[colIndices.ac2Moyen] || '').trim()
          if (ac2Val > 0) {
            if (!ac2MoyenVal) {
              errorsList.push(`Ligne ${i + 1} : Le moyen de paiement pour l'Acompte 2 est requis car le montant est supérieur à 0.`)
              continue
            }
            if (!VALID_PAYMENT_METHODS.includes(ac2MoyenVal)) {
              errorsList.push(`Ligne ${i + 1} : Le moyen de paiement "${ac2MoyenVal}" pour l'Acompte 2 est invalide. Valeurs acceptées : ${VALID_PAYMENT_METHODS.join(', ')}.`)
              continue
            }
          }

          const soldeVal = parseFloat(String(row[colIndices.soldeMontant])) || 0
          const soldeMoyenVal = String(row[colIndices.soldeMoyen] || '').trim()
          if (soldeVal > 0) {
            if (!soldeMoyenVal) {
              errorsList.push(`Ligne ${i + 1} : Le moyen de paiement pour le Solde est requis car le montant est supérieur à 0.`)
              continue
            }
            if (!VALID_PAYMENT_METHODS.includes(soldeMoyenVal)) {
              errorsList.push(`Ligne ${i + 1} : Le moyen de paiement "${soldeMoyenVal}" pour le Solde est invalide. Valeurs acceptées : ${VALID_PAYMENT_METHODS.join(', ')}.`)
              continue
            }
          }

          const orderKey = `${clientName}_${dateCmdStr}_${customerContact}`

          let finalProductName = productName
          const partsStr = parts ? `${parts} parts` : ''
          const floorsStr = floors ? `${floors} étage${floors > 1 ? 's' : ''}` : ''
          const details = [partsStr, floorsStr].filter(Boolean).join(', ')
          if (details) {
            finalProductName = `${finalProductName} (${details})`
          }

          const matchingProduct = products.find(p => p.name.toLowerCase() === productName.toLowerCase())

          if (!ordersMap[orderKey]) {
            ordersMap[orderKey] = {
              created_at: dateCmdStr,
              pickup_date: dateRetraitStr,
              customer_name: clientName,
              customer_contact: customerContact,
              ac1Montant: ac1Val,
              ac1Moyen: ac1MoyenVal,
              ac2Montant: ac2Val,
              ac2Moyen: ac2MoyenVal,
              soldeMontant: soldeVal,
              soldeMoyen: soldeMoyenVal,
              notes_list: notes ? [notes] : [],
              items: []
            }
          } else {
            // Consolidation : première valeur non nulle rencontrée dans les lignes du groupe
            if (ac1Val > 0 && ordersMap[orderKey].ac1Montant === 0) {
              ordersMap[orderKey].ac1Montant = ac1Val
              ordersMap[orderKey].ac1Moyen = ac1MoyenVal
            }
            if (ac2Val > 0 && ordersMap[orderKey].ac2Montant === 0) {
              ordersMap[orderKey].ac2Montant = ac2Val
              ordersMap[orderKey].ac2Moyen = ac2MoyenVal
            }
            if (soldeVal > 0 && ordersMap[orderKey].soldeMontant === 0) {
              ordersMap[orderKey].soldeMontant = soldeVal
              ordersMap[orderKey].soldeMoyen = soldeMoyenVal
            }
            
            if (notes && !ordersMap[orderKey].notes_list.includes(notes)) {
              ordersMap[orderKey].notes_list.push(notes)
            }
          }

          ordersMap[orderKey].items.push({
            name: finalProductName,
            quantity: quantity,
            unit_price: price,
            product_id: matchingProduct ? matchingProduct.id : null
          })
        }

        if (errorsList.length > 0) {
          const displayErrors = errorsList.slice(0, 5).join('\n')
          const remainingErrors = errorsList.length > 5 ? `\n... et ${errorsList.length - 5} autres erreurs.` : ''
          toast.error(`Erreurs de validation dans le fichier Excel :\n${displayErrors}${remainingErrors}`, { duration: 8000 })
          return
        }

        const parsedList = Object.values(ordersMap).map(ord => {
          const totalAmount = ord.items.reduce((sum, it) => sum + (it.quantity * it.unit_price), 0)
          
          // Construction du tableau de paiements
          const payments: Array<{ amount: number; payment_method: string; label_type: 'ACOMPTE' | 'SOLDE' }> = []
          if (ord.ac1Montant > 0) {
            payments.push({ amount: ord.ac1Montant, payment_method: ord.ac1Moyen, label_type: 'ACOMPTE' })
          }
          if (ord.ac2Montant > 0) {
            payments.push({ amount: ord.ac2Montant, payment_method: ord.ac2Moyen, label_type: 'ACOMPTE' })
          }
          if (ord.soldeMontant > 0) {
            payments.push({ amount: ord.soldeMontant, payment_method: ord.soldeMoyen, label_type: 'SOLDE' })
          }

          const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
          const isSolded = totalPaid === totalAmount
          const balance = Math.max(0, totalAmount - totalPaid)

          return {
            ...ord,
            total_amount: totalAmount,
            deposit_amount: ord.ac1Montant + ord.ac2Montant,
            payments: payments,
            payment_status_label: isSolded ? 'SOLDÉE' : 'ACOMPTE_PRÉLEVÉ',
            payment_status: isSolded ? 'SOLDEE' : 'PARTIEL',
            status: isSolded ? 'completed' : 'pending',
            balance: balance,
            customization_notes: ord.notes_list.join('\n') || undefined
          }
        })

        if (parsedList.length === 0) {
          toast.error('Aucune commande valide trouvée dans le fichier Excel')
          return
        }

        setParsedOrders(parsedList)
        toast.success(`${parsedList.length} commande(s) détectée(s) dans le fichier Excel`)
      } catch (err: unknown) {
        toast.error('Erreur lors du traitement du fichier Excel : ' + (err instanceof Error ? err.message : 'Erreur inconnue'))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // ── Lancer l'import en masse des commandes d'Excel ──
  const handleImportExcelOrders = async () => {
    if (parsedOrders.length === 0) return
    setIsSubmitting(true)
    setImportProgress({ current: 0, total: parsedOrders.length })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < parsedOrders.length; i++) {
      setImportProgress({ current: i + 1, total: parsedOrders.length })
      const ord = parsedOrders[i]

      try {
        const payload = {
          customer_name: ord.customer_name,
          customer_contact: ord.customer_contact || undefined,
          pickup_date: ddMmYyyyToIsoString(ord.pickup_date),
          created_at: ddMmYyyyToIsoString(ord.created_at),
          total_amount: ord.total_amount ?? 0,
          deposit_amount: ord.deposit_amount ?? 0,
          payments: ord.payments ?? [], // Plusieurs paiements typés ACOMPTE / SOLDE
          customization_notes: ord.customization_notes,
          items: ord.items.map(it => ({
            name: it.name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            product_id: it.product_id,
            from_inventory: false
          }))
        }

        const res = await importHistoricalOrder(payload)
        if (res.success) {
          successCount++
        } else {
          failCount++
          console.error(`Échec d'import pour ${ord.customer_name}:`, res.error)
        }
      } catch (err) {
        failCount++
        console.error(`Erreur d'import pour ${ord.customer_name}:`, err)
      }
    }

    setIsSubmitting(false)
    setImportProgress(null)

    if (successCount > 0) {
      toast.success(`${successCount} commandes historiques importées avec succès !`)
      onSuccess()
      onClose()
    }

    if (failCount > 0) {
      toast.error(`${failCount} commandes ont échoué lors de l'import. Consultez la console.`)
    }
  }

  if (!open || !isMounted) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      {/* Backdrop */}
      <div 
        style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.5)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* Modal Card */}
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: '640px',
        background: '#fff', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
        maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1.5px solid var(--color-border)', display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'var(--color-text)' }}>Importation de l&apos;Historique</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--color-muted)' }}>Entrer des anciens bons de commande papier en base de données</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--color-cream)', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1.5px solid var(--color-border)' }}>
          <button
            onClick={() => setActiveTab('manual')}
            style={{
              flex: 1, padding: '14px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: activeTab === 'manual' ? 800 : 500, fontSize: '0.85rem',
              color: activeTab === 'manual' ? 'var(--color-rose-dark)' : 'var(--color-muted)',
              borderBottom: `2.5px solid ${activeTab === 'manual' ? 'var(--color-rose-dark)' : 'transparent'}`,
              transition: 'all 0.15s'
            }}
          >
            ✍️ Saisie Manuelle
          </button>
          <button
            onClick={() => setActiveTab('csv')}
            style={{
              flex: 1, padding: '14px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: activeTab === 'csv' ? 800 : 500, fontSize: '0.85rem',
              color: activeTab === 'csv' ? 'var(--color-rose-dark)' : 'var(--color-muted)',
              borderBottom: `2.5px solid ${activeTab === 'csv' ? 'var(--color-rose-dark)' : 'transparent'}`,
              transition: 'all 0.15s'
            }}
          >
            📄 Import Excel en masse
          </button>
        </div>

        {/* Content Scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          
          {/* ══ Tab 1: Manual entry ══ */}
          {activeTab === 'manual' && (
            <form id="manual-import-form" onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Infos Client */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="label">Nom du Client *</label>
                  <input
                    type="text" required
                    className="input" placeholder="ex: Marie Konan"
                    value={customerName} onChange={e => setCustomerName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Téléphone du Client</label>
                  <TouchInput
                    value={customerContact}
                    onChange={setCustomerContact}
                    placeholder="+225 00000000"
                    title="Numéro de téléphone"
                    isPhone={true}
                    style={{ borderColor: 'var(--color-primary)' }}
                  />
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px', gap: '14px', alignItems: 'flex-start' }}>
                <div>
                  <label className="label">Date de Prise de Commande *</label>
                  <DatePicker
                    value={createdAt}
                    onChange={setCreatedAt}
                    placeholder="Sélectionner la date"
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', marginTop: '4px', display: 'block' }}>Date du bon d&apos;époque (date de l&apos;acompte)</span>
                </div>
                <div>
                  <label className="label">Date de Retrait / Solde *</label>
                  <DatePicker
                    value={pickupDate}
                    onChange={setPickupDate}
                    placeholder="Sélectionner la date"
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', marginTop: '4px', display: 'block' }}>Date à laquelle la commande a été récupérée</span>
                </div>
                <div>
                  <label className="label">Heure</label>
                  <TimeDigiPad
                    value={pickupTime}
                    onChange={setPickupTime}
                    placeholder="Heure"
                    align="right"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="label" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Articles du bon de commande</label>
                  <button type="button" onClick={handleAddItem} className="btn-secondary" style={{ padding: '6px 12px', minHeight: '34px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> Ajouter un article
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {items.map((item, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      background: 'var(--color-well)',
                      padding: '16px',
                      borderRadius: '18px',
                      border: '1.5px solid var(--color-border)',
                      position: 'relative'
                    }}>
                      {/* Entête de la carte */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-rose-dark)' }}>
                          🍰 Article #{index + 1}
                        </span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#D94F38',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '6px',
                              transition: 'background-color 0.2s'
                            }}
                          >
                            <Trash2 size={14} /> Supprimer
                          </button>
                        )}
                      </div>

                      {/* Ligne 1 : Désignation + Parts + Étages */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 2fr) 1fr 1fr', gap: '8px' }}>
                        <div>
                          <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Désignation *</label>
                          <input
                            className="input"
                            value={item.name}
                            onChange={e => handleItemChange(index, 'name', e.target.value)}
                            placeholder="ex: Gâteau d'anniversaire..."
                            style={{ padding: '6px 8px', height: '36px', borderRadius: '10px', background: '#ffffff', border: '1.5px solid var(--color-border)' }}
                            required
                          />
                        </div>
                        <div>
                          <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Parts</label>
                          <TouchInput
                            value={item.parts?.toString() || ''}
                            onChange={v => handleItemChange(index, 'parts', parseInt(v) || undefined)}
                            allowDecimal={false}
                            placeholder="Parts"
                            title={`Nombre de parts : ${item.name || 'Produit'}`}
                            hideIcon={true}
                            style={{ padding: '6px 2px', height: '36px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                          />
                        </div>
                        <div>
                          <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Étages</label>
                          <TouchInput
                            value={item.floors?.toString() || ''}
                            onChange={v => handleItemChange(index, 'floors', parseInt(v) || undefined)}
                            allowDecimal={false}
                            placeholder="Étages"
                            title={`Nombre d'étages : ${item.name || 'Produit'}`}
                            hideIcon={true}
                            style={{ padding: '6px 2px', height: '36px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                          />
                        </div>
                      </div>

                      {/* Ligne 2 : Quantité + Prix unitaire + Bouton Bougies */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr auto', gap: '8px', alignItems: 'flex-end' }}>
                        <div>
                          <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Quantité</label>
                          <TouchInput
                            value={item.quantity.toString()}
                            onChange={v => handleItemChange(index, 'quantity', parseInt(v) || 1)}
                            allowDecimal={false}
                            title={`Quantité : ${item.name || 'Produit'}`}
                            placeholder="Qté"
                            hideIcon={true}
                            style={{ padding: '6px 8px', height: '36px', textAlign: 'center', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                          />
                        </div>
                        <div>
                          <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px' }}>Prix Unitaire</label>
                          <TouchInput
                            value={item.unit_price === 0 ? '' : item.unit_price.toString()}
                            onChange={v => handleItemChange(index, 'unit_price', parseFloat(v) || 0)}
                            placeholder="Prix"
                            title={`Prix unitaire : ${item.name || 'Produit'}`}
                            hideIcon={true}
                            style={{ padding: '6px 8px', height: '36px', textAlign: 'right', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                          />
                        </div>

                        {/* Bougies popover */}
                        <div style={{ position: 'relative' }}>
                          <label className="label" style={{ fontSize: '0.7rem', marginBottom: '4px', display: 'block' }}>Bougies</label>
                          <button
                            type="button"
                            onClick={() => setActiveCandlesIndex(activeCandlesIndex === index ? null : index)}
                            style={{
                              background: (item.candles_fontaine || item.candles_ficelle) ? 'var(--color-primary-container)' : '#ffffff',
                              border: '1.5px solid',
                              borderColor: (item.candles_fontaine || item.candles_ficelle) ? 'var(--color-primary)' : 'var(--color-border)',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              padding: '0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: '36px',
                              width: '44px',
                              color: (item.candles_fontaine || item.candles_ficelle) ? 'var(--color-primary)' : 'var(--color-muted)',
                              position: 'relative',
                              transition: 'all 0.2s'
                            }}
                            title="Ajouter des bougies"
                          >
                            <Flame size={18} fill={(item.candles_fontaine || item.candles_ficelle) ? 'var(--color-primary)' : 'none'} />
                            {(item.candles_fontaine || item.candles_ficelle) ? (
                              <span style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                background: 'var(--color-primary)',
                                color: 'white',
                                fontSize: '0.6rem',
                                fontWeight: 900,
                                borderRadius: '50%',
                                width: '16px',
                                height: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid white'
                              }}>
                                {(item.candles_fontaine || 0) + (item.candles_ficelle || 0)}
                              </span>
                            ) : null}
                          </button>

                          {activeCandlesIndex === index && (
                            <div style={{
                              position: 'absolute',
                              bottom: '100%',
                              right: 0,
                              marginBottom: '8px',
                              background: '#fff',
                              border: '1.5px solid var(--color-border)',
                              borderRadius: '16px',
                              boxShadow: '0 12px 36px rgba(45,27,14,0.15)',
                              padding: '16px',
                              width: '290px',
                              zIndex: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px'
                            }}>
                              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-text)', borderBottom: '1.5px solid var(--color-border)', paddingBottom: '6px' }}>
                                Achat de Bougies
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <div>
                                  <div style={{ fontWeight: 700 }}>Fontaine</div>
                                  <div style={{ color: 'var(--color-muted)', fontSize: '0.72rem' }}>2 000 FCFA / u</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <button type="button" onClick={() => handleUpdateCandle(index, 'candles_fontaine', Math.max(0, (item.candles_fontaine || 0) - 1))}
                                    style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: 'var(--color-well)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>-</button>
                                  <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 800, fontSize: '1rem' }}>{item.candles_fontaine || 0}</span>
                                  <button type="button" onClick={() => handleUpdateCandle(index, 'candles_fontaine', (item.candles_fontaine || 0) + 1)}
                                    style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: 'var(--color-well)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>+</button>
                                </div>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <div>
                                  <div style={{ fontWeight: 700 }}>Ficelle</div>
                                  <div style={{ color: 'var(--color-muted)', fontSize: '0.72rem' }}>1 000 FCFA / u</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <button type="button" onClick={() => handleUpdateCandle(index, 'candles_ficelle', Math.max(0, (item.candles_ficelle || 0) - 1))}
                                    style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: 'var(--color-well)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>-</button>
                                  <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 800, fontSize: '1rem' }}>{item.candles_ficelle || 0}</span>
                                  <button type="button" onClick={() => handleUpdateCandle(index, 'candles_ficelle', (item.candles_ficelle || 0) + 1)}
                                    style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: 'var(--color-well)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>+</button>
                                </div>
                              </div>

                              <button type="button" onClick={() => setActiveCandlesIndex(null)} className="btn-secondary" style={{ padding: '4px 0', minHeight: '38px', fontSize: '0.88rem', fontWeight: 700, width: '100%', borderRadius: '10px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                Valider
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Notes particulières + image d'inspiration pour cet article */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '4px' }}>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Notes particulières pour cet article (parfum, écritures, etc.)..."
                          style={{ resize: 'none', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: '12px', background: '#ffffff', flex: 1, fontSize: '0.78rem', minHeight: '48px' }}
                          value={item.notes || ''}
                          onChange={e => handleItemChange(index, 'notes', e.target.value)}
                        />
                        <label
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '48px',
                            height: '48px',
                            border: '1.5px dashed var(--color-border)',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            background: item.imageFile ? 'var(--color-primary-container)' : '#ffffff',
                            color: item.imageFile ? 'var(--color-primary)' : 'var(--color-muted)',
                            flexShrink: 0,
                            position: 'relative'
                          }}
                          title={item.imageFile ? item.imageFile.name : "Photo d'inspiration pour cet article"}
                        >
                          {item.imageFile ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <CheckCircle2 size={16} color="var(--color-primary)" />
                              <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '2px', maxWidth: '44px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Ok
                              </span>
                            </div>
                          ) : (
                            <ImageIcon size={18} />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => handleItemChange(index, 'imageFile', e.target.files?.[0] || null)}
                          />
                        </label>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              {/* RÉCAP FINANCIER & MODES DE PAIEMENT */}
              <div style={{ background: 'var(--color-well)', borderRadius: '18px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1.5px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                  <span>Sous-total</span>
                  <span style={{ fontWeight: 700 }}>{calculatedTotal.toLocaleString('fr-FR')} {currency}</span>
                </div>

                {/* Toggle Acompte / Soldé */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Paiement reçu</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px' }}>
                      <button type="button" onClick={() => {
                        setPaymentType('ACOMPTE');
                        setDepositAmount(0);
                        if (isMultiplePayment) {
                          setPayments(prev => prev.map((p, idx) => idx === 0 ? { ...p, label_type: 'ACOMPTE' } : p));
                        }
                      }}
                        style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'ACOMPTE' && !isMultiplePayment ? 'var(--color-warning)' : 'transparent', color: paymentType === 'ACOMPTE' && !isMultiplePayment ? 'white' : 'var(--color-muted)' }}>
                        Acompte reçu
                      </button>
                      <button type="button" onClick={() => {
                        setPaymentType('SOLDE');
                        setDepositAmount(calculatedTotal);
                        if (isMultiplePayment) {
                          setPayments(prev => prev.map((p, idx) => idx === 0 ? { ...p, label_type: 'SOLDE' } : p));
                        }
                      }}
                        style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'SOLDE' && !isMultiplePayment ? 'var(--color-secondary)' : 'transparent', color: paymentType === 'SOLDE' && !isMultiplePayment ? 'white' : 'var(--color-muted)' }}>
                        Soldé
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isMultiplePayment) {
                          setIsMultiplePayment(true);
                          const initialAmount = paymentType === 'SOLDE' ? calculatedTotal : depositAmount;
                          const initialType = paymentType;
                          const initialMethod = depositMethod;
                          setPayments([
                            { id: '1', amount: initialAmount, payment_method: initialMethod, label_type: initialType },
                            { id: '2', amount: Math.max(0, calculatedTotal - initialAmount), payment_method: 'Espèces', label_type: initialType === 'ACOMPTE' ? 'SOLDE' : 'ACOMPTE' }
                          ]);
                        } else {
                          const remaining = Math.max(0, calculatedTotal - payments.reduce((sum, p) => sum + p.amount, 0));
                          setPayments(prev => [
                            ...prev,
                            { id: Date.now().toString(), amount: remaining, payment_method: 'Espèces', label_type: 'SOLDE' }
                          ]);
                        }
                      }}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        border: '1.5px solid var(--color-primary)',
                        background: isMultiplePayment ? 'var(--color-primary)' : 'transparent',
                        color: isMultiplePayment ? 'white' : 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        transition: 'all 0.15s'
                      }}
                      title="Ajouter un mode de paiement multiple"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Section paiement unique classique */}
                {!isMultiplePayment && paymentType === 'ACOMPTE' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Montant acompte</span>
                    <div style={{ width: '150px' }}>
                      <TouchInput value={depositAmount.toString()} onChange={v => setDepositAmount(parseFloat(v) || 0)} style={{ height: '34px', padding: '4px 8px', textAlign: 'right' }} />
                    </div>
                  </div>
                )}

                {!isMultiplePayment && depositAmount > 0 && (
                  <div>
                    <label className="label" style={{ marginBottom: '6px' }}>Mode de paiement de l&apos;Acompte</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {PAYMENT_METHODS.map(m => (
                        <button key={m.value} type="button" onClick={() => setDepositMethod(m.value)}
                          style={{
                            padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700,
                            borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                            border: '1.5px solid', borderColor: depositMethod === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                            background: depositMethod === m.value ? '#FDE8E0' : 'var(--color-lift)',
                            color: depositMethod === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                          }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!isMultiplePayment && calculatedTotal - depositAmount > 0 && (
                  <div>
                    <label className="label" style={{ marginBottom: '6px' }}>Mode de paiement du Solde (au Retrait)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {PAYMENT_METHODS.map(m => (
                        <button key={m.value} type="button" onClick={() => setBalanceMethod(m.value)}
                          style={{
                            padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700,
                            borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                            border: '1.5px solid', borderColor: balanceMethod === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                            background: balanceMethod === m.value ? '#FDE8E0' : 'var(--color-lift)',
                            color: balanceMethod === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                          }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section paiement multiple */}
                {isMultiplePayment && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                    {payments.map((p) => (
                      <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {/* Toggle Acompte / Solde pour cette ligne */}
                          <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '2px', gap: '2px' }}>
                            <button type="button" onClick={() => {
                              setPayments(prev => prev.map(item => item.id === p.id ? { ...item, label_type: 'ACOMPTE' } : item))
                            }}
                              style={{ padding: '3px 8px', fontSize: '0.65rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: p.label_type === 'ACOMPTE' ? 'var(--color-warning)' : 'transparent', color: p.label_type === 'ACOMPTE' ? 'white' : 'var(--color-muted)' }}>
                              Acompte
                            </button>
                            <button type="button" onClick={() => {
                              setPayments(prev => prev.map(item => item.id === p.id ? { ...item, label_type: 'SOLDE' } : item))
                            }}
                              style={{ padding: '3px 8px', fontSize: '0.65rem', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: p.label_type === 'SOLDE' ? 'var(--color-secondary)' : 'transparent', color: p.label_type === 'SOLDE' ? 'white' : 'var(--color-muted)' }}>
                              Solde
                            </button>
                          </div>

                          {/* Saisie montant */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '140px' }}>
                              <TouchInput value={p.amount.toString()} onChange={v => {
                                const newAmount = parseFloat(v) || 0;
                                setPayments(prev => prev.map(item => item.id === p.id ? { ...item, amount: newAmount } : item));
                              }} style={{ height: '28px', padding: '2px 6px', textAlign: 'right', fontSize: '0.75rem' }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-muted)' }}>FCFA</span>
                            
                            {payments.length > 1 && (
                              <button type="button" onClick={() => {
                                setPayments(prev => {
                                  const next = prev.filter(item => item.id !== p.id);
                                  if (next.length === 1) {
                                    setIsMultiplePayment(false);
                                    setDepositAmount(next[0].amount);
                                    if (next[0].label_type === 'ACOMPTE') {
                                      setDepositMethod(next[0].payment_method);
                                    } else {
                                      setBalanceMethod(next[0].payment_method);
                                    }
                                    setPaymentType(next[0].label_type);
                                  }
                                  return next;
                                });
                              }} style={{ width: '22px', height: '22px', borderRadius: '6px', border: 'none', background: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Modes de paiement */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {PAYMENT_METHODS.map(m => (
                            <button key={m.value} type="button" onClick={() => {
                              setPayments(prev => prev.map(item => item.id === p.id ? { ...item, payment_method: m.value } : item))
                            }}
                              style={{
                                padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700,
                                borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s',
                                border: '1.5px solid', borderColor: p.payment_method === m.value ? 'var(--color-primary)' : 'var(--color-border)',
                                background: p.payment_method === m.value ? '#FDE8E0' : 'var(--color-lift)',
                                color: p.payment_method === m.value ? 'var(--color-primary)' : 'var(--color-muted)',
                              }}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-primary)' }}>
                  <span>Solde restant</span>
                  <span>{Math.max(0, calculatedTotal - totalPayments).toLocaleString('fr-FR')} {currency}</span>
                </div>
              </div>

              {/* Le bloc de notes a été déplacé juste sous les articles */}
            </form>
          )}

          {/* ══ Tab 2: Excel Import ══ */}
          {activeTab === 'csv' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Instructions */}
              <div style={{ padding: '14px', background: '#EFF6FF', borderRadius: '16px', border: '1px solid #BFDBFE', color: '#1E3A8A', fontSize: '0.8rem', lineHeight: 1.45 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, marginBottom: '6px' }}>
                  <FileText size={16} /> Instructions de préparation du fichier Excel
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li>Utilisez le modèle téléchargeable ci-dessous.</li>
                  <li>Le regroupement par commande est fait automatiquement par <strong>Client + Date Commande + Téléphone</strong>.</li>
                  <li>Les dates doivent respecter le format <strong>JJ-MM-AAAA</strong> (ex: 25-01-2025).</li>
                  <li>Les méthodes de paiement valides sont : <code>Espèces</code>, <code>Orange Money</code>, <code>Wave</code>, <code>MTN MOMO</code>, <code>Moov Money</code>.</li>
                </ul>
              </div>

              {/* Template Download & File Picker */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button type="button" onClick={handleDownloadTemplate} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', minHeight: '40px', fontSize: '0.8rem' }}>
                  <Download size={14} /> Télécharger le gabarit Excel
                </button>

                <label style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '2px dashed var(--color-border)', borderRadius: '14px', padding: '10px 16px', background: 'var(--color-cream)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-muted)' }}>
                    <Upload size={14} /> {excelFile ? excelFile.name : 'Sélectionner le fichier Excel'}
                  </div>
                  <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleExcelFileChange} />
                </label>
              </div>

              {/* Preview of Parsed Orders */}
              {parsedOrders.length > 0 && (
                <div style={{ border: '1.5px solid var(--color-border)', borderRadius: '18px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--color-cream)', borderBottom: '1.5px solid var(--color-border)', fontWeight: 800, fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Aperçu des commandes à importer</span>
                    <span style={{ color: 'var(--color-primary)' }}>{parsedOrders.length} commande(s)</span>
                  </div>
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ background: '#FAF8F5', borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ padding: '8px 12px' }}>Client</th>
                          <th style={{ padding: '8px 12px' }}>Date Cmd</th>
                          <th style={{ padding: '8px 12px' }}>Date Retrait</th>
                          <th style={{ padding: '8px 12px' }}>Articles</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Payé</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Reste</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedOrders.map((ord, i) => {
                          const totalPaid = (ord.payments ?? []).reduce((sum, p) => sum + p.amount, 0)
                          const totalAmount = ord.total_amount ?? 0
                          const balance = ord.balance ?? 0
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 700 }}>{ord.customer_name}</td>
                              <td style={{ padding: '8px 12px' }}>{ord.created_at}</td>
                              <td style={{ padding: '8px 12px' }}>{ord.pickup_date}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--color-muted)' }}>
                                {ord.items.map(it => `${it.quantity}x ${it.name}`).join(', ')}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{totalAmount.toLocaleString('fr-FR')} {currency}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: 'green', fontWeight: 700 }}>{totalPaid.toLocaleString('fr-FR')} {currency}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: balance > 0 ? 'red' : 'inherit' }}>
                                {balance.toLocaleString('fr-FR')} {currency}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: ord.status === 'completed' ? 'var(--color-secondary)' : 'var(--color-warning)' }}>
                                {ord.payment_status_label ?? 'ACOMPTE_PRÉLEVÉ'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Import Progress Loader */}
        {importProgress && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <Loader2 size={36} className="animate-spin" color="var(--color-rose-dark)" />
            <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text)' }}>Importation en cours...</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
              Commande {importProgress.current} sur {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)
            </div>
          </div>
        )}

        {/* Footer sticky */}
        <div style={{ padding: '16px 24px', borderTop: '1.5px solid var(--color-border)', display: 'flex', gap: '12px', background: '#fff' }}>
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1 }} disabled={isSubmitting}>
            Annuler
          </button>
          
          {activeTab === 'manual' ? (
            <button
              type="submit" form="manual-import-form"
              className="btn-primary" style={{ flex: 2, height: '48px' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {isSubmitting ? 'Enregistrement...' : 'Importer ce bon de commande'}
            </button>
          ) : (
            <button
              onClick={handleImportExcelOrders}
              className="btn-primary" style={{ flex: 2, height: '48px' }}
              disabled={isSubmitting || parsedOrders.length === 0}
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {isSubmitting ? 'Importation...' : `Importer les ${parsedOrders.length} commandes`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
