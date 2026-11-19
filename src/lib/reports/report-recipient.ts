import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Destinataire des rapports d'une organisation : l'e-mail du gérant actif en production,
 * REPORT_DEV_EMAIL dans les autres environnements. null si aucun destinataire valable.
 */
export async function resolveReportRecipient(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: manager, error } = await admin
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('role_slug', 'gerant')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[report-recipient] lecture du gérant impossible', { orgId })
    return null
  }
  if (!manager?.id) return null

  const { data } = await admin.auth.admin.getUserById(manager.id)
  const managerEmail = data?.user?.email ?? null
  if (!managerEmail) return null

  if (process.env.ENVIRONMENT === 'production') return managerEmail
  return process.env.REPORT_DEV_EMAIL?.trim() || null
}
