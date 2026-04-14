'use client'

// {"file":"src/components/equipe/PayslipDrawer.tsx","type":"component","depends":["react","lucide-react","sonner","date-fns","@/lib/actions/employees"],"exports":["PayslipDrawer"],"supabase_tables":["profiles","employee_pay_events"]}

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Trash2, Plus, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { getMonthlyPayslip, deletePayEvent } from '@/lib/actions/employees'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import PayEventModal from './PayEventModal'

interface PayslipData {
  employeeName: string
  baseSalary: number
  primes:   Array<{ id: string; label: string; amount: number; created_at: string }>
  retenues: Array<{ id: string; label: string; amount: number; created_at: string }>
  sumPrimes: number
  sumRetenues: number
  net: number
  month: string
}

interface Props {
  open: boolean
  onClose: () => void
  employeeId: string
  employeeName: string
  currency: string
}

export default function PayslipDrawer({ open, onClose, employeeId, employeeName, currency }: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [data, setData]     = useState<PayslipData | null>(null)
  const [loading, setLoading] = useState(false)
  const [payEventOpen, setPayEventOpen] = useState(false)

  const loadPayslip = useCallback(async (month: string) => {
    setLoading(true)
    const result = await getMonthlyPayslip(employeeId, month)
    setData(result as PayslipData | null)
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    if (open) loadPayslip(currentMonth)
  }, [open, currentMonth, loadPayslip])

  const navigateMonth = (dir: 1 | -1) => {
    const parsed = parseISO(currentMonth + '-01')
    const next = dir === 1 ? addMonths(parsed, 1) : subMonths(parsed, 1)
    setCurrentMonth(format(next, 'yyyy-MM'))
  }

  const handleDeleteEvent = async (id: string, label: string) => {
    if (!confirm(`Supprimer "${label}" ?`)) return
    const res = await deletePayEvent(id)
    if (res.success) {
      toast.success('Événement supprimé')
      loadPayslip(currentMonth)
    } else {
      toast.error(res.error)
    }
  }

  const monthLabel = (() => {
    try { return format(parseISO(currentMonth + '-01'), 'MMMM yyyy', { locale: fr }) }
    catch { return currentMonth }
  })()

  // ── Render ──
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,14,0.35)', backdropFilter: 'blur(4px)', zIndex: 150 }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 151,
        width: '100%', maxWidth: '480px',
        background: '#fff',
        boxShadow: '-8px 0 40px rgba(45,27,14,0.15)',
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1.5px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" onClick={onClose} style={{ background: 'var(--color-cream)', border: 'none', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#2D1B0E' }}>Fiche de paie</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{employeeName}</div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            title="Imprimer"
            style={{ background: 'var(--color-cream)', border: 'none', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Printer size={16} />
          </button>
        </div>

        {/* Navigation mois */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-cream)' }}>
          <button type="button" onClick={() => navigateMonth(-1)} style={{ background: '#fff', border: '1.5px solid var(--color-border)', borderRadius: '10px', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2D1B0E', textTransform: 'capitalize' }}>{monthLabel}</span>
          <button type="button" onClick={() => navigateMonth(1)} style={{ background: '#fff', border: '1.5px solid var(--color-border)', borderRadius: '10px', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Corps */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
              <Loader2 size={32} color="var(--color-rose-dark)" className="animate-spin" />
            </div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>Impossible de charger la fiche</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {/* Tableau de paie */}
              <div style={{ background: 'var(--color-cream)', borderRadius: '16px', overflow: 'hidden', border: '1.5px solid var(--color-border)' }}>
                {/* Salaire de base */}
                <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontWeight: 600, color: '#2D1B0E', fontSize: '0.9rem' }}>Salaire de base</span>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#2D1B0E' }}>
                    {Number(data.baseSalary).toLocaleString('fr-FR')} {currency}
                  </span>
                </div>

                {/* Primes */}
                {data.primes.length > 0 && (
                  <div style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {data.primes.map(p => (
                      <div key={p.id} style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F0FDF4' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.7rem', background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>PRIME</span>
                          <span style={{ fontSize: '0.85rem', color: '#065F46', fontWeight: 500 }}>{p.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.9rem' }}>+ {Number(p.amount).toLocaleString('fr-FR')} {currency}</span>
                          <button type="button" onClick={() => handleDeleteEvent(p.id, p.label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Retenues */}
                {data.retenues.length > 0 && (
                  <div style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {data.retenues.map(r => (
                      <div key={r.id} style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FEF2F2' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.7rem', background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>RETENUE</span>
                          <span style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: 500 }}>{r.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#DC2626', fontSize: '0.9rem' }}>− {Number(r.amount).toLocaleString('fr-FR')} {currency}</span>
                          <button type="button" onClick={() => handleDeleteEvent(r.id, r.label)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Net à payer */}
                <div style={{ padding: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2D1B0E' }}>
                  <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net à payer</span>
                  <span style={{ fontWeight: 900, color: '#FDE8DB', fontSize: '1.25rem' }}>
                    {Number(data.net).toLocaleString('fr-FR')} {currency}
                  </span>
                </div>
              </div>

              {/* Bouton ajouter prime/retenue */}
              <button
                type="button"
                onClick={() => setPayEventOpen(true)}
                style={{
                  marginTop: '16px', width: '100%', padding: '14px',
                  border: '2px dashed var(--color-rose-dark)',
                  background: 'none', borderRadius: '14px',
                  cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                  color: 'var(--color-rose-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-blush)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <Plus size={18} /> Ajouter prime / retenue
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PayEvent Modal (nested) */}
      <PayEventModal
        open={payEventOpen}
        onClose={() => setPayEventOpen(false)}
        onSuccess={() => loadPayslip(currentMonth)}
        employeeId={employeeId}
        employeeName={employeeName}
        defaultMonth={currentMonth}
      />
    </>
  )
}
