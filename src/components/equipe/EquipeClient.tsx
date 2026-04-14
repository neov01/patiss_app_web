'use client'

// {"file":"src/components/equipe/EquipeClient.tsx","type":"component","depends":["react","lucide-react","sonner","./EmployeeCard","./EmployeeModal","./PayslipDrawer"],"exports":["default"],"supabase_tables":["profiles"]}

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Users } from 'lucide-react'
import EmployeeCard, { EmployeeData } from './EmployeeCard'
import EmployeeModal from './EmployeeModal'
import PayslipDrawer from './PayslipDrawer'

interface Props {
  employees: EmployeeData[]
  organizationId: string
  currency: string
}

export default function EquipeClient({ employees: initial, organizationId, currency }: Props) {
  const [employees, setEmployees] = useState<EmployeeData[]>(initial)
  const router = useRouter()

  // Modals state
  const [modalOpen, setModalOpen]       = useState(false)
  const [modalMode, setModalMode]       = useState<'create' | 'edit'>('create')
  const [editTarget, setEditTarget]     = useState<EmployeeData | undefined>(undefined)

  const [payslipOpen, setPayslipOpen]   = useState(false)
  const [payslipTarget, setPayslipTarget] = useState<EmployeeData | undefined>(undefined)
  const [showInactive, setShowInactive] = useState(false)

  // ── Handlers ──
  const openCreate = () => {
    setModalMode('create')
    setEditTarget(undefined)
    setModalOpen(true)
  }

  const openEdit = (emp: EmployeeData) => {
    setModalMode('edit')
    setEditTarget(emp)
    setModalOpen(true)
  }

  const openPayslip = (emp: EmployeeData) => {
    setPayslipTarget(emp)
    setPayslipOpen(true)
  }

  const handleDeactivated = (id: string) => {
    // router.refresh() will update initial props
    router.refresh()
  }

  const handleSuccess = () => {
    // Rafraîchit les données sans recharger toute la page
    router.refresh()
  }

  return (
    <>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: '#2D1B0E', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={24} color="var(--color-rose-dark)" />
            {showInactive ? 'Membres archivés' : 'Mon Équipe'}
          </h1>
          <p style={{ color: 'var(--color-muted)', margin: '6px 0 0', fontSize: '0.875rem' }}>
            {initial.filter(e => e.is_active !== showInactive).length} membre{initial.filter(e => e.is_active !== showInactive).length > 1 ? 's' : ''} {showInactive ? 'désactivés' : 'actifs'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            type="button" 
            onClick={() => setShowInactive(!showInactive)}
            className="btn-ghost"
            style={{ 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              color: showInactive ? 'var(--color-rose-dark)' : 'var(--color-muted)',
              border: showInactive ? '1px solid var(--color-rose-dark)' : '1px solid var(--color-border)',
              padding: '8px 16px',
              borderRadius: '12px'
            }}
          >
            {showInactive ? 'Voir l\'équipe active' : 'Voir les archivés'}
          </button>
          <button type="button" onClick={openCreate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={18} />
            Ajouter un employé
          </button>
        </div>
      </div>

      {/* ── Liste ── */}
      {employees.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 24px',
          background: 'var(--color-cream)', borderRadius: '20px',
          border: '2px dashed var(--color-border)',
        }}>
          <Users size={48} style={{ opacity: 0.25, margin: '0 auto 16px' }} />
          <p style={{ fontWeight: 700, fontSize: '1.05rem', color: '#2D1B0E', margin: '0 0 6px' }}>Aucun employé pour l&apos;instant</p>
          <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: '0.875rem' }}>
            Ajoutez vos vendeurs et pâtissiers pour le mode kiosque.
          </p>
          <button type="button" onClick={openCreate} className="btn-primary" style={{ marginTop: '24px' }}>
            <UserPlus size={16} /> Ajouter le premier employé
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {initial
            .filter(emp => showInactive ? emp.is_active === false : (emp.is_active !== false))
            .map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                currency={currency}
                onEdit={openEdit}
                onPayslip={openPayslip}
                onDeactivated={handleDeactivated}
              />
            ))
          }
        </div>
      )}

      {/* ── Modals ── */}
      <EmployeeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
        mode={modalMode}
        employee={editTarget}
        organizationId={organizationId}
        currency={currency}
      />

      {payslipTarget && (
        <PayslipDrawer
          open={payslipOpen}
          onClose={() => { setPayslipOpen(false); setPayslipTarget(undefined) }}
          employeeId={payslipTarget.id}
          employeeName={payslipTarget.full_name}
          currency={currency}
        />
      )}
    </>
  )
}
