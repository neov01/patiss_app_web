'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { RoleSlug } from '@/types/supabase'
import { updateUserRole } from '@/lib/actions/admin'

interface AdminUserRow {
  id: string
  full_name: string
  role_slug: RoleSlug
  is_active: boolean
  organization_name: string
}

const ROLES: { value: RoleSlug; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin (SaaS)' },
  { value: 'gerant', label: 'Gérant' },
  { value: 'vendeur', label: 'Vendeur' },
  { value: 'patissier', label: 'Pâtissier' },
]

export default function AdminUsersClient({ users }: { users: AdminUserRow[] }) {
  const [isPending, startTransition] = useTransition()

  async function handleChangeRole(userId: string, role_slug: RoleSlug, is_active: boolean) {
    startTransition(async () => {
      const result = await updateUserRole({ userId, role_slug, is_active })
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success('Rôle mis à jour')
      }
    })
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-cream)', borderBottom: '1.5px solid var(--color-border)' }}>
              {['Nom', 'Organisation', 'Rôle', 'Actif', ''].map(h => (
                <th
                  key={h}
                  style={{
                    padding: '12px 16px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--color-muted)',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  background: i % 2 === 0 ? 'white' : 'var(--color-cream)',
                }}
              >
                <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.9rem' }}>{u.full_name}</td>
                <td style={{ padding: '10px 16px', fontSize: '0.85rem', color: 'var(--color-muted)' }}>{u.organization_name}</td>
                <td style={{ padding: '10px 16px' }}>
                  <select
                    className="input"
                    value={u.role_slug}
                    onChange={e => handleChangeRole(u.id, e.target.value as RoleSlug, u.is_active)}
                    disabled={isPending}
                    style={{ maxWidth: '210px' }}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <button
                    type="button"
                    onClick={() => handleChangeRole(u.id, u.role_slug, !u.is_active)}
                    className="btn-ghost"
                    disabled={isPending}
                    style={{
                      minHeight: '32px',
                      padding: '0 12px',
                      fontSize: '0.8rem',
                      color: u.is_active ? '#4C9E6A' : '#9C8070',
                    }}
                  >
                    {u.is_active ? 'Actif' : 'Inactif'}
                  </button>
                </td>
                <td style={{ padding: '10px 16px', width: '60px' }}>
                  {isPending && <Loader2 size={16} className="animate-spin" style={{ color: '#C4836A' }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

