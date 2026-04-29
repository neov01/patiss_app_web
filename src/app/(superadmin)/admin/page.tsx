import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminClient from '@/components/admin/AdminClient'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_slug')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role_slug !== 'super_admin') redirect('/dashboard')

  // Fetch all orgs with member count
  let { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('id, name, currency_symbol, subscription_end_date, kiosk_code, tier, max_users, contact_email, contact_phone')
    .order('name')

  // Fallback if kiosk_code doesn't exist yet (migration not run)
  if (orgsError) {
    console.error('Error fetching organizations with kiosk_code:', orgsError.message)
    const fallback = await supabase
      .from('organizations')
      .select('id, name, currency_symbol, subscription_end_date')
      .order('name')
    
    // Add null kiosk_code and default values to avoid type errors
    orgs = (fallback.data ?? []).map(o => ({ 
      ...o, 
      kiosk_code: null,
      tier: 'Basic',
      max_users: 5,
      contact_email: null,
      contact_phone: null
    })) as any
  }

  // Fetch all profiles with auth emails for the team tab
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role_slug, is_active, organization_id, avatar_url, theme_color')
    .order('full_name')

  // Fetch roles for the dropdown
  const { data: roles } = await (supabase
    .from('roles' as any)
    .select('slug, name')
    .order('name') as any)

  // Compute member counts per org
  const memberCounts = (allProfiles ?? []).reduce((acc, p) => {
    if (p.organization_id) {
      acc[p.organization_id] = (acc[p.organization_id] ?? 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  const orgsWithCounts = (orgs ?? []).map(o => ({
    ...o,
    member_count: memberCounts[o.id] ?? 0,
  }))

  return (
    <div className="animate-fade-in">
      <AdminClient
        orgs={orgsWithCounts}
        allProfiles={allProfiles ?? []}
        roles={roles ?? []}
      />
    </div>
  )
}
