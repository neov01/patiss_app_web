'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Upload, Download, Plus, Trash2, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { importHistoricalOrder } from '@/lib/actions/orders'
import TouchInput from '@/components/ui/TouchInput'
import DatePicker from '@/components/ui/DatePicker'

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

export default function HistoricalImportModal({ open, onClose, products, currency, onSuccess }: HistoricalImportModalProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'manual' | 'csv'>('manual')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Saisie Manuelle State ──
  const [orderNumber, setOrderNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerContact, setCustomerContact] = useState('')
  const [createdAt, setCreatedAt] = useState<Date | null>(null)
  const [pickupDate, setPickupDate] = useState<Date | null>(null)
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositMethod, setDepositMethod] = useState('Espèces')
  const [balanceMethod, setBalanceMethod] = useState('Espèces')
  const [notes, setNotes] = useState('')
  const [paymentType, setPaymentType] = useState<'ACOMPTE' | 'SOLDE'>('SOLDE')
  
  const [items, setItems] = useState<ItemInput[]>([
    { name: '', quantity: 1, unit_price: 0 }
  ])

  // ── CSV Import State ──
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [parsedOrders, setParsedOrders] = useState<any[]>([])
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Calculer le total à la volée
  const calculatedTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)

  // Quand mode Soldé : le dépôt suit automatiquement le total
  useEffect(() => {
    if (paymentType === 'SOLDE') {
      setDepositAmount(calculatedTotal)
    }
  }, [paymentType, calculatedTotal])

  const handleAddItem = () => {
    setItems(prev => [...prev, { name: '', quantity: 1, unit_price: 0 }])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: keyof ItemInput, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      
      if (field === 'product_id') {
        const prod = products.find(p => p.id === value)
        return {
          ...item,
          product_id: value,
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

    setIsSubmitting(true)
    try {
      const payload = {
        order_number: orderNumber.trim() || undefined,
        customer_name: customerName.trim(),
        customer_contact: customerContact.trim() || undefined,
        pickup_date: pickupDate.toISOString(),
        created_at: createdAt.toISOString(),
        total_amount: calculatedTotal,
        deposit_amount: depositAmount,
        deposit_payment_method: depositAmount > 0 ? depositMethod : undefined,
        balance_payment_method: calculatedTotal - depositAmount > 0 ? balanceMethod : undefined,
        customization_notes: notes.trim() || undefined,
        status: 'completed',
        items: items.map(item => {
          let finalName = item.name.trim()
          const partsStr = item.parts ? `${item.parts} parts` : ''
          const floorsStr = item.floors ? `${item.floors} étage${item.floors > 1 ? 's' : ''}` : ''
          const details = [partsStr, floorsStr].filter(Boolean).join(', ')
          if (details) {
            finalName = `${finalName} (${details})`
          }
          return {
            name: finalName,
            quantity: item.quantity,
            unit_price: item.unit_price,
            product_id: item.product_id || null,
            from_inventory: !!item.product_id
          }
        })
      }

      const res = await importHistoricalOrder(payload)
      if (res.success) {
        toast.success('Bon de commande historique inséré avec succès')
        onSuccess()
        onClose()
      } else {
        toast.error(res.error || 'Erreur lors de l\'insertion')
      }
    } catch (err: any) {
      toast.error('Erreur technique : ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Télécharger le Modèle CSV ──
  const handleDownloadTemplate = () => {
    const csvContent = [
      'Date Commande (AAAA-MM-JJ),Date Retrait (AAAA-MM-JJ),Client,Telephone,Nom Produit,Quantite,Prix Unitaire,Acompte,Methode Acompte,Methode Solde',
      '2024-01-01,2024-01-04,Marie Konan,+22507000000,Croissant,5,500,1000,Espèces,Wave',
      '2024-01-01,2024-01-04,Marie Konan,+22507000000,Cake Cannette,1,2500,1000,Espèces,Wave',
      '2024-02-14,2024-02-14,Vente Passage,,Choux à la crème,3,500,1500,Orange Money,Orange Money'
    ].join('\n')

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'modele_import_historique.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Parser le CSV ──
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      try {
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
        if (lines.length <= 1) {
          toast.error('Le fichier CSV est vide ou ne contient pas de données')
          return
        }

        // On ignore l'entête
        const dataLines = lines.slice(1)
        const ordersMap: Record<string, any> = {}

        dataLines.forEach((line, idx) => {
          // Gérer le split par virgule (en faisant attention aux guillemets si présents)
          const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
          if (cols.length < 7) return // Ligne invalide

          const [
            rawDateCmd, 
            rawDateRetrait, 
            client, 
            tel, 
            productName, 
            rawQty, 
            rawPrice, 
            rawAcompte, 
            methodeAcompte, 
            methodeSolde
          ] = cols

          if (!rawDateCmd || !rawDateRetrait || !client || !productName) return

          // Clé unique pour regrouper les articles d'une même commande
          const orderKey = `${rawDateCmd}_${rawDateRetrait}_${client}_${tel || ''}`

          const qty = parseInt(rawQty) || 1
          const price = parseFloat(rawPrice) || 0
          const acompte = parseFloat(rawAcompte) || 0

          // Rechercher si le produit existe dans le catalogue par nom pour lier l'ID
          const matchingProduct = products.find(p => p.name.toLowerCase() === productName.toLowerCase())

          if (!ordersMap[orderKey]) {
            ordersMap[orderKey] = {
              created_at: rawDateCmd,
              pickup_date: rawDateRetrait,
              customer_name: client,
              customer_contact: tel || '',
              deposit_amount: acompte,
              deposit_payment_method: methodeAcompte || 'Espèces',
              balance_payment_method: methodeSolde || 'Espèces',
              items: []
            }
          }

          ordersMap[orderKey].items.push({
            name: productName,
            quantity: qty,
            unit_price: price,
            product_id: matchingProduct ? matchingProduct.id : null
          })
        })

        // Conversion en tableau
        const parsedList = Object.values(ordersMap).map((ord: any) => {
          const total = ord.items.reduce((sum: number, it: any) => sum + (it.quantity * it.unit_price), 0)
          return {
            ...ord,
            total_amount: total
          }
        })

        setParsedOrders(parsedList)
        toast.success(`${parsedList.length} commandes détectées dans le fichier`)
      } catch (err: any) {
        toast.error('Erreur lors du traitement du fichier : ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  // ── Lancer l'import en masse des commandes du CSV ──
  const handleImportCsvOrders = async () => {
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
          pickup_date: new Date(ord.pickup_date).toISOString(),
          created_at: new Date(ord.created_at).toISOString(),
          total_amount: ord.total_amount,
          deposit_amount: ord.deposit_amount,
          deposit_payment_method: ord.deposit_amount > 0 ? ord.deposit_payment_method : undefined,
          balance_payment_method: ord.total_amount - ord.deposit_amount > 0 ? ord.balance_payment_method : undefined,
          status: 'completed',
          items: ord.items.map((it: any) => ({
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
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#2D1B0E' }}>Importation de l&apos;Historique</h2>
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
            📄 Import CSV en masse
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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
              </div>

              {/* Items Section */}
              <div style={{ padding: '16px', background: 'var(--color-cream)', borderRadius: '18px', border: '1.5px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label className="label" style={{ margin: 0 }}>Articles du bon de commande</label>
                  <button type="button" onClick={handleAddItem} className="btn-secondary" style={{ padding: '4px 10px', minHeight: '30px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={14} /> Ajouter
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {items.map((item, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 100px 32px', gap: '6px', alignItems: 'center', background: 'var(--color-well)', padding: '6px', borderRadius: '8px' }}>
                      {/* Designation + Parts + Floors */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                        <input className="input" value={item.name} onChange={e => handleItemChange(index, 'name', e.target.value)} placeholder="Désignation" style={{ padding: '6px 8px', height: '32px', flex: 2, minWidth: '80px', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }} required />
                        <TouchInput
                          value={item.parts?.toString() || ''}
                          onChange={v => handleItemChange(index, 'parts', parseInt(v) || undefined)}
                          allowDecimal={false}
                          placeholder="Parts"
                          title={`Nombre de parts : ${item.name || 'Produit'}`}
                          hideIcon={true}
                          style={{ padding: '6px 2px', height: '32px', width: '62px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                        />
                        <TouchInput
                          value={item.floors?.toString() || ''}
                          onChange={v => handleItemChange(index, 'floors', parseInt(v) || undefined)}
                          allowDecimal={false}
                          placeholder="Étages"
                          title={`Nombre d'étages : ${item.name || 'Produit'}`}
                          hideIcon={true}
                          style={{ padding: '6px 2px', height: '32px', width: '62px', textAlign: 'center', fontSize: '0.78rem', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                        />
                      </div>

                      {/* Qty */}
                      <TouchInput
                        value={item.quantity.toString()}
                        onChange={v => handleItemChange(index, 'quantity', parseInt(v) || 1)}
                        allowDecimal={false}
                        title={`Quantité : ${item.name || 'Produit'}`}
                        placeholder="Qté"
                        hideIcon={true}
                        style={{ padding: '6px 8px', height: '32px', textAlign: 'center', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                      />

                      {/* Unit Price */}
                      <TouchInput
                        value={item.unit_price === 0 ? '' : item.unit_price.toString()}
                        onChange={v => handleItemChange(index, 'unit_price', parseFloat(v) || 0)}
                        placeholder="Prix"
                        title={`Prix unitaire : ${item.name || 'Produit'}`}
                        hideIcon={true}
                        style={{ padding: '6px 8px', height: '32px', textAlign: 'right', border: '1.5px solid var(--color-border)', borderRadius: '10px', background: '#ffffff' }}
                      />

                      {/* Remove Button */}
                      <button
                        type="button" disabled={items.length === 1}
                        onClick={() => handleRemoveItem(index)}
                        style={{ background: 'none', border: 'none', color: '#D94F38', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px', opacity: items.length === 1 ? 0.3 : 1 }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Total recalculé */}
                <div style={{ marginTop: '14px', borderTop: '1.5px solid var(--color-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '0.9rem' }}>
                  <span>Montant Total :</span>
                  <span style={{ color: 'var(--color-rose-dark)' }}>{calculatedTotal.toLocaleString('fr-FR')} {currency}</span>
                </div>
              </div>

              {/* Notes / Instructions du bon papier (déplacées ici) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="label">Notes / Instructions du bon papier (optionnel)</label>
                <textarea
                  className="input" rows={2} placeholder="Notes particulières..."
                  style={{ resize: 'none', padding: '10px', border: '1.5px solid var(--color-border)', borderRadius: '12px', background: '#ffffff' }}
                  value={notes} onChange={e => setNotes(e.target.value)}
                />
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
                  <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', padding: '3px', gap: '2px' }}>
                    <button type="button" onClick={() => { setPaymentType('ACOMPTE'); setDepositAmount(0) }}
                      style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'ACOMPTE' ? 'var(--color-warning)' : 'transparent', color: paymentType === 'ACOMPTE' ? 'white' : 'var(--color-muted)' }}>
                      Acompte reçu
                    </button>
                    <button type="button" onClick={() => { setPaymentType('SOLDE'); setDepositAmount(calculatedTotal) }}
                      style={{ padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: paymentType === 'SOLDE' ? 'var(--color-secondary)' : 'transparent', color: paymentType === 'SOLDE' ? 'white' : 'var(--color-muted)' }}>
                      Soldé
                    </button>
                  </div>
                </div>

                {paymentType === 'ACOMPTE' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Montant acompte</span>
                    <div style={{ width: '120px' }}>
                      <TouchInput value={depositAmount.toString()} onChange={v => setDepositAmount(parseFloat(v) || 0)} style={{ height: '34px', padding: '4px 8px', textAlign: 'right' }} />
                    </div>
                  </div>
                )}

                {/* Mode de paiement acompte */}
                {depositAmount > 0 && (
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

                {/* Mode de paiement du solde (si acompte partiel) */}
                {calculatedTotal - depositAmount > 0 && (
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

                <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-primary)' }}>
                  <span>Solde restant</span>
                  <span>{(calculatedTotal - depositAmount).toLocaleString('fr-FR')} {currency}</span>
                </div>
              </div>

              {/* Le bloc de notes a été déplacé juste sous les articles */}
            </form>
          )}

          {/* ══ Tab 2: CSV Import ══ */}
          {activeTab === 'csv' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Instructions */}
              <div style={{ padding: '14px', background: '#EFF6FF', borderRadius: '16px', border: '1px solid #BFDBFE', color: '#1E3A8A', fontSize: '0.8rem', lineHeight: 1.45 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, marginBottom: '6px' }}>
                  <FileText size={16} /> Instructions de préparation du fichier CSV
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  <li>Utilisez le modèle téléchargeable ci-dessous.</li>
                  <li>Le regroupement par commande est fait automatiquement par <strong>Client + Date Commande + Téléphone</strong>.</li>
                  <li>Les dates doivent respecter le format <code>AAAA-MM-JJ</code> (ex: 2024-01-25).</li>
                  <li>Les méthodes de paiement valides sont : <code>Espèces</code>, <code>Orange Money</code>, <code>Wave</code>, <code>MTN MOMO</code>, <code>Moov Money</code>.</li>
                </ul>
              </div>

              {/* Template Download & File Picker */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button type="button" onClick={handleDownloadTemplate} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', minHeight: '40px', fontSize: '0.8rem' }}>
                  <Download size={14} /> Télécharger le gabarit CSV
                </button>

                <label style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '2px dashed var(--color-border)', borderRadius: '14px', padding: '10px 16px', background: 'var(--color-cream)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-muted)' }}>
                    <Upload size={14} /> {csvFile ? csvFile.name : 'Sélectionner le fichier CSV'}
                  </div>
                  <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvFileChange} />
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
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Acompte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedOrders.map((ord, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700 }}>{ord.customer_name}</td>
                            <td style={{ padding: '8px 12px' }}>{ord.created_at}</td>
                            <td style={{ padding: '8px 12px' }}>{ord.pickup_date}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--color-muted)' }}>
                              {ord.items.map((it: any) => `${it.quantity}x ${it.name}`).join(', ')}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{ord.total_amount}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{ord.deposit_amount}</td>
                          </tr>
                        ))}
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
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#2D1B0E' }}>Importation en cours...</div>
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
              onClick={handleImportCsvOrders}
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
