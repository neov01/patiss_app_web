'use client'

// {"file":"src/components/equipe/PayEventModal.tsx","type":"component","depends":["react","react-dom","lucide-react","sonner","@/lib/actions/employees","@/lib/schemas/employee.schema"],"exports":["PayEventModal"],"supabase_tables":["employee_pay_events"]}

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { addPayEvent } from '@/lib/actions/employees'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  employeeId: string
  employeeName: string
  defaultMonth?: string // 'YYYY-MM'
}

export default function PayEventModal({ open, onClose, onSuccess, employeeId, employeeName, defaultMonth }: Props) {
  const [isMounted, setIsMounted] = useState(false)
  const [type, setType]     = useState<'prime' | 'retenue'>('prime')
  const [amount, setAmount] = useState('')
  const [label, setLabel]   = useState('')
  const [month, setMonth]   = useState(defaultMonth ?? format(new Date(), 'yyyy-MM'))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setIsMounted(true) }, [])
  useEffect(() => {
    if (open) {
      setType('prime')
      setAmount('')
      setLabel('')
      setMonth(defaultMonth ?? format(new Date(), 'yyyy-MM'))
    }
  }, [open, defaultMonth])

  const handleSubmit = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return toast.error('Montant invalide')
    if (!label.trim())    return toast.error('Motif requis')

    setSaving(true)
    try {
      const res = await addPayEvent({ employeeId, month, type, amount: amt, label: label.trim() })
      if (res.success) {
        toast.success(`${type === 'prime' ? 'Prime' : 'Retenue'} ajoutée`)
        onSuccess()
        onClose()
      } else {
        toast.error(res.error)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open || !isMounted) return null

  const monthLabel = (() => {
    try {
      return format(new Date(month + '-01'), 'MMMM yyyy', { locale: fr })
    } catch {
      return month
    }
  })()

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.45)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: '#fff', borderRadius: '24px', width: '100%', maxWidth: '420px',
        boxShadow: '0 24px 64px rgba(45,27,14,0.2)',
        animation: 'scaleIn 0.25s ease',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#2D1B0E' }}>{employeeName}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginTop: '2px', textTransform: 'capitalize' }}>{monthLabel}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'var(--color-cream)', border: 'none', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Toggle Prime / Retenue */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setType('prime')}
              style={{
                padding: '14px', borderRadius: '14px', border: `2px solid ${type === 'prime' ? '#10B981' : 'var(--color-border)'}`,
                background: type === 'prime' ? '#ECFDF5' : '#fff',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              <TrendingUp size={22} color={type === 'prime' ? '#10B981' : '#9CA3AF'} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: type === 'prime' ? '#059669' : 'var(--color-muted)' }}>Prime</span>
            </button>
            <button
              type="button"
              onClick={() => setType('retenue')}
              style={{
                padding: '14px', borderRadius: '14px', border: `2px solid ${type === 'retenue' ? '#EF4444' : 'var(--color-border)'}`,
                background: type === 'retenue' ? '#FEF2F2' : '#fff',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              <TrendingDown size={22} color={type === 'retenue' ? '#EF4444' : '#9CA3AF'} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: type === 'retenue' ? '#DC2626' : 'var(--color-muted)' }}>Retenue</span>
            </button>
          </div>

          {/* Montant */}
          <div>
            <label className="label">Montant (FCFA)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Ex: 15000"
              style={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'right' }}
            />
          </div>

          {/* Motif */}
          <div>
            <label className="label">Motif</label>
            <input
              className="input"
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={type === 'prime' ? 'Ex: Prime vente weekend' : 'Ex: Avance sur salaire'}
            />
          </div>

          {/* Mois */}
          <div>
            <label className="label">Mois concerné</label>
            <input
              className="input"
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px' }}>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Annuler</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex: 2, padding: '12px', borderRadius: '12px', border: 'none',
              background: type === 'prime'
                ? 'linear-gradient(135deg, #10B981, #059669)'
                : 'linear-gradient(135deg, #EF4444, #DC2626)',
              color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : (type === 'prime' ? '+ Ajouter la prime' : '− Enregistrer la retenue')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
