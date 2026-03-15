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
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, currency_symbol, subscription_end_date')
    .order('name')

  // Fetch all profiles with auth emails for the team tab
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role_slug, is_active, organization_id, avatar_url, theme_color')
    .order('full_name')

  // Fetch roles for the dropdown
  const { data: roles } = await supabase
    .from('roles')
    .select('slug, name')
    .order('name')

  // Compute member counts per org
  const memberCounts: Record<string, number> = {}
  for (const p of allProfiles ?? []) {
    if (p.organization_id) {
      memberCounts[p.organization_id] = (memberCounts[p.organization_id] ?? 0) + 1
    }
  }

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
