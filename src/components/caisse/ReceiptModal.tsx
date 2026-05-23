'use client'

import { useRef } from 'react'
import { Printer, X, Check } from 'lucide-react'

export interface ReceiptData {
  transactionId: string
  orgName: string
  orgAddress?: string
  date: string
  clientName: string
  labelType: 'VENTE_DIRECTE' | 'SOLDE' | 'ACOMPTE' | 'REMBOURSEMENT'
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
  }>
  subtotal: number
  amount: number
  paymentMethod: string
  paymentDetails?: Record<string, number>
  currency: string
}

interface Props {
  receipt: ReceiptData | null
  onClose: () => void
}

function formatLabel(label: ReceiptData['labelType']): string {
  switch (label) {
    case 'VENTE_DIRECTE': return 'Vente'
    case 'SOLDE': return 'Solde de commande'
    case 'ACOMPTE': return 'Acompte'
    case 'REMBOURSEMENT': return 'Remboursement'
  }
}

export default function ReceiptModal({ receipt, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  if (!receipt) return null

  // Capture stable pour les closures (évite le "possibly null" TypeScript)
  const stableReceipt = receipt

  function handlePrint() {
    if (!printRef.current) return
    const content = printRef.current.innerHTML
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) return

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reçu — ${stableReceipt.orgName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      padding: 4mm;
      color: #000;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .label-badge {
      display: inline-block;
      border: 1px solid #000;
      padding: 1px 4px;
      font-size: 10px;
      margin-bottom: 4px;
    }
    .total-row { font-size: 14px; font-weight: bold; }
    .footer { font-size: 10px; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>${content}</body>
</html>`)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }

  const fmt = (n: number) => n.toLocaleString('fr-FR') + ' ' + receipt.currency

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
        {/* En-tête modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 id="receipt-title" style={{ fontWeight: 800, fontSize: '1rem' }}>Aperçu du reçu</h3>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Contenu du reçu (utilisé pour l'impression) */}
        <div ref={printRef} style={{ fontFamily: "'Courier New', monospace", fontSize: '13px', lineHeight: '1.5', border: '1px dashed #ccc', padding: '16px', borderRadius: '8px' }}>
          {/* En-tête boutique */}
          <div className="center bold" style={{ textAlign: 'center', fontWeight: 700, fontSize: '15px' }}>{receipt.orgName}</div>
          {receipt.orgAddress && (
            <div className="center" style={{ textAlign: 'center', fontSize: '11px', color: '#555' }}>{receipt.orgAddress}</div>
          )}
          <div style={{ textAlign: 'center', marginTop: '4px' }}>
            <span style={{ border: '1px solid #000', padding: '1px 6px', fontSize: '11px' }}>{formatLabel(receipt.labelType)}</span>
          </div>

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Infos transaction */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span>N° {receipt.transactionId.slice(0, 8).toUpperCase()}</span>
            <span>{receipt.date}</span>
          </div>
          <div style={{ fontSize: '11px' }}>Client : <strong>{receipt.clientName}</strong></div>

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Lignes articles */}
          {receipt.items.map((item, i) => (
            <div key={i} style={{ marginBottom: '4px' }}>
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingLeft: '8px' }}>
                <span>{item.quantity} × {fmt(item.unitPrice)}</span>
                <span>{fmt(item.quantity * item.unitPrice)}</span>
              </div>
            </div>
          ))}

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Totaux */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px' }}>
            <span>TOTAL PAYÉ</span>
            <span>{fmt(receipt.amount)}</span>
          </div>

          {/* Détail des paiements si mixte */}
          {receipt.paymentDetails && Object.keys(receipt.paymentDetails).length > 1 && (
            <div style={{ marginTop: '6px', fontSize: '11px' }}>
              {Object.entries(receipt.paymentDetails).map(([method, amount]) => (
                <div key={method} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{method}</span>
                  <span>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          )}

          {receipt.paymentDetails && Object.keys(receipt.paymentDetails).length <= 1 && (
            <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
              Règlement : {receipt.paymentMethod}
            </div>
          )}

          <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

          {/* Pied de reçu */}
          <div style={{ textAlign: 'center', fontSize: '11px', color: '#555' }}>
            Merci pour votre confiance !<br />
            À bientôt chez {receipt.orgName}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button
            onClick={onClose}
            className="btn"
            style={{ flex: 1, background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
          >
            <Check size={16} style={{ marginRight: '6px' }} />
            Terminer sans imprimer
          </button>
          <button
            onClick={handlePrint}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            <Printer size={16} style={{ marginRight: '6px' }} />
            Imprimer le reçu
          </button>
        </div>
      </div>
    </div>
  )
}
