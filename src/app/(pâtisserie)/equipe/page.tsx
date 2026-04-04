import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EquipeClient from '@/components/equipe/EquipeClient'

export default async function EquipePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role_slug, organization_id, organizations(currency_symbol)')
        .eq('id', user.id)
        .single()

    if (!profile || !['super_admin', 'gerant'].includes(profile.role_slug)) {
        redirect('/dashboard')
    }

    const orgId = profile.organization_id!
    const currency = (profile?.organizations as any)?.currency_symbol ?? 'FCFA'

    // Fetch enrichi : tous les champs RH
    const { data: employees } = await (supabase.from as any)('profiles')
        .select(`
            id,
            full_name,
            role_slug,
            theme_color,
            auto_lock_seconds,
            is_active,
            phone,
            hire_date,
            contract_type,
            base_salary,
            avatar_url
        `)
        .eq('organization_id', orgId)
        .in('role_slug', ['vendeur', 'patissier', 'gerant'])
        .eq('is_active', true)
        .order('full_name')

    return (
        <div className="animate-fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <EquipeClient
                employees={employees ?? []}
                organizationId={orgId}
                currency={currency}
            />
        </div>
    )
}
