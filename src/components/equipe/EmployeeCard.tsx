'use client'

// {"file":"src/components/equipe/EmployeeCard.tsx","type":"component","depends":["lucide-react","sonner","@/lib/actions/employees"],"exports":["EmployeeCard"],"supabase_tables":["profiles"]}

import { useState } from 'react'
import { Pencil, Banknote, Power, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { deleteEmployee, reactivateEmployee } from '@/lib/actions/employees'
import ConfirmModal from '@/components/ui/ConfirmModal'

const CONTRACT_LABELS: Record<string, string> = {
  full_time: 'Temps plein',
  part_time: 'Temps partiel',
  daily:     'Journalier',
}

const ROLE_LABELS: Record<string, string> = {
  vendeur:   '🛒 Vendeur',
  patissier: '👨‍🍳 Pâtissier',
  gerant:    '👑 Gérant',
}

export interface EmployeeData {
  id: string
  full_name: string
  role_slug: string
  theme_color?: string
  auto_lock_seconds?: number
  phone?: string
  hire_date?: string
  contract_type?: string
  base_salary?: number
  avatar_url?: string
  is_active?: boolean
}

interface Props {
  employee: EmployeeData
  currency: string
  onEdit: (emp: EmployeeData) => void
  onPayslip: (emp: EmployeeData) => void
  onDeactivated: (id: string) => void
}

export default function EmployeeCard({ employee: emp, currency, onEdit, onPayslip, onDeactivated }: Props) {
  const [deactivating, setDeactivating] = useState(false)
  const [showSalary, setShowSalary]   = useState(false)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'deactivate' | 'reactivate' | null;
  }>({ isOpen: false, type: null })

  const color = emp.theme_color ?? '#C4836A'

  const initials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const handleDeactivate = async () => {
    setDeactivating(true)
    const res = await deleteEmployee(emp.id)
    if (res.success) {
      toast.success(`${emp.full_name} désactivé`)
      onDeactivated(emp.id)
      setConfirmModal({ isOpen: false, type: null })
    } else {
      toast.error(res.error)
    }
    setDeactivating(false)
  }

  const handleReactivate = async () => {
    setDeactivating(true)
    const res = await reactivateEmployee(emp.id)
    if (res.success) {
      toast.success(`${emp.full_name} réactivé`)
      onDeactivated(emp.id)
      setConfirmModal({ isOpen: false, type: null })
    } else {
      toast.error(res.error)
    }
    setDeactivating(false)
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '20px',
      border: '1.5px solid var(--color-border)',
      boxShadow: '0 2px 12px rgba(45,27,14,0.06)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      transition: 'all 0.2s',
      opacity: emp.is_active !== false ? 1 : 0.7,
      filter: emp.is_active !== false ? 'none' : 'grayscale(0.4)',
    }}>
      {/* ── Identité ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {emp.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={emp.avatar_url}
              alt={emp.full_name}
              style={{
                width: 56, height: 56, borderRadius: '50%',
                objectFit: 'cover',
                border: `3px solid ${color}`,
                boxShadow: `0 0 0 2px white, 0 0 0 4px ${color}30`,
              }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1.1rem', color: '#fff',
              border: `3px solid ${color}`,
              boxShadow: `0 0 0 2px white, 0 0 0 4px ${color}30`,
            }}>
              {initials(emp.full_name)}
            </div>
          )}
          {/* Badge actif */}
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 12, height: 12, borderRadius: '50%',
            background: emp.is_active !== false ? '#10B981' : '#9CA3AF',
            border: '2px solid white',
          }} />
        </div>

        {/* Infos */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#2D1B0E', marginBottom: '2px' }}>
            {emp.full_name}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span>{ROLE_LABELS[emp.role_slug] ?? emp.role_slug}</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span>{CONTRACT_LABELS[emp.contract_type ?? 'full_time']}</span>
          </div>
          {emp.phone && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '2px' }}>
              📞 {emp.phone}
            </div>
          )}
        </div>

        {/* Badge actif/inactif */}
        <div style={{
          padding: '4px 10px', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 700,
          background: emp.is_active !== false ? '#D1FAE5' : '#F3F4F6',
          color:      emp.is_active !== false ? '#065F46'  : '#6B7280',
          flexShrink: 0,
        }}>
          {emp.is_active !== false ? 'Actif' : 'Inactif'}
        </div>
      </div>

      {/* ── Salaire ── */}
      {(emp.base_salary !== undefined && emp.base_salary !== null) && (
        <div style={{
          background: 'var(--color-cream)',
          borderRadius: '12px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontWeight: 600 }}>
              Salaire de base
            </span>
            <button 
              type="button" 
              onClick={() => setShowSalary(!showSalary)}
              style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--color-muted)', display: 'flex', alignItems: 'center' }}
            >
              {showSalary ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#2D1B0E', letterSpacing: showSalary ? '0' : '0.1em' }}>
            {showSalary 
              ? `${Number(emp.base_salary).toLocaleString('fr-FR')} ${currency}`
              : '••••••'}
          </span>
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
        <button
          type="button"
          onClick={() => onEdit(emp)}
          style={{
            flex: 1, padding: '9px', borderRadius: '10px', border: '1.5px solid var(--color-border)',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', transition: 'all 0.15s'
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-cream)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}
        >
          <Pencil size={14} /> Modifier
        </button>

        <button
          type="button"
          onClick={() => onPayslip(emp)}
          style={{
            flex: 1, padding: '9px', borderRadius: '10px', border: '1.5px solid #A7F3D0',
            background: '#ECFDF5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#059669', transition: 'all 0.15s'
          }}
        >
          <Banknote size={14} /> Paie
        </button>

        {emp.is_active !== false ? (
          <button
            type="button"
            onClick={() => setConfirmModal({ isOpen: true, type: 'deactivate' })}
            disabled={deactivating}
            title="Désactiver"
            style={{
              width: '40px', height: '40px', borderRadius: '10px', border: '1.5px solid #FECACA',
              background: '#FEF2F2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#DC2626', transition: 'all 0.15s', flexShrink: 0
            }}
          >
            {deactivating ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmModal({ isOpen: true, type: 'reactivate' })}
            disabled={deactivating}
            title="Réactiver"
            style={{
              width: '40px', height: '40px', borderRadius: '10px', border: '1.5px solid #A7F3D0',
              background: '#ECFDF5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#059669', transition: 'all 0.15s', flexShrink: 0
            }}
          >
            {deactivating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        )}
      </div>

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, type: null })}
        onConfirm={confirmModal.type === 'deactivate' ? handleDeactivate : handleReactivate}
        isLoading={deactivating}
        title={confirmModal.type === 'deactivate' ? 'Désactiver l\'employé' : 'Réactiver l\'employé'}
        message={confirmModal.type === 'deactivate' 
          ? `Êtes-vous sûr de vouloir désactiver ${emp.full_name} ? Il perdra l'accès au kiosque immédiatement.`
          : `Souhaitez-vous réactiver ${emp.full_name} ? Il pourra à nouveau se connecter au kiosque.`
        }
        confirmText={confirmModal.type === 'deactivate' ? 'Désactiver' : 'Réactiver'}
        variant={confirmModal.type === 'deactivate' ? 'danger' : 'success'}
      />
    </div>
  )
}
