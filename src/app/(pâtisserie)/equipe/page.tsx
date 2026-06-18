import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EquipeClient from '@/components/equipe/EquipeClient'
import type { EmployeeData } from '@/components/equipe/EmployeeCard'

type OrganizationCurrency = {
    currency_symbol: string | null
}

function getCurrencySymbol(organizations: OrganizationCurrency | OrganizationCurrency[] | null): string {
    const organization = Array.isArray(organizations) ? organizations[0] : organizations
    return organization?.currency_symbol ?? ''
}

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
    const currency = getCurrencySymbol(profile.organizations)

    // Fetch enrichi : tous les champs RH
    const { data: employees } = await supabase.from('profiles')
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
        .order('full_name')

    const normalizedEmployees: EmployeeData[] = (employees ?? []).map(employee => ({
        id: employee.id,
        full_name: employee.full_name,
        role_slug: employee.role_slug,
        theme_color: employee.theme_color ?? undefined,
        auto_lock_seconds: employee.auto_lock_seconds,
        is_active: employee.is_active,
        phone: employee.phone ?? undefined,
        hire_date: employee.hire_date ?? undefined,
        contract_type: employee.contract_type ?? undefined,
        base_salary: employee.base_salary ?? undefined,
        avatar_url: employee.avatar_url ?? undefined,
    }))

    return (
        <div className="animate-fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <EquipeClient
                employees={normalizedEmployees}
                organizationId={orgId}
                currency={currency}
            />
        </div>
    )
}
