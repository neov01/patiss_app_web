import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EquipeClient from '@/components/equipe/EquipeClient'

export default async function EquipePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role_slug, organization_id')
        .eq('id', user.id)
        .single()

    if (!profile || !['super_admin', 'gerant'].includes(profile.role_slug)) {
        redirect('/dashboard')
    }

    const { data: employees } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', profile.organization_id!)
        .in('role_slug', ['vendeur', 'patissier'])
        .order('full_name')

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Mon Équipe</h1>
                <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                    Gérez vos employés et leurs accès au mode kiosque
                </p>
            </div>

            <EquipeClient
                employees={employees ?? []}
                organizationId={profile.organization_id!}
            />
        </div>
    )
}
