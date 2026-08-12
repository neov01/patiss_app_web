import 'server-only'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifyKioskToken } from '@/lib/kiosk-token'

type OrganizationRelation = { currency_symbol: string } | { currency_symbol: string }[] | null

interface ProfileContext {
  organization_id: string | null
  role_slug: string
  is_active: boolean
  organizations: OrganizationRelation
}

export class AuthContextError extends Error {
  status: number

  constructor(message: string, status = 401) {
    super(message)
    this.name = 'AuthContextError'
    this.status = status
  }
}

function getCurrency(organization: OrganizationRelation) {
  const org = Array.isArray(organization) ? organization[0] : organization
  return org?.currency_symbol ?? 'FCFA'
}

export async function requireOrganizationContext() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new AuthContextError('Non authentifié', 401)
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role_slug, is_active, organizations(currency_symbol)')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new AuthContextError('Profil introuvable', 403)
  }

  const typedProfile = profile as ProfileContext

  if (!typedProfile.is_active) {
    throw new AuthContextError('Profil inactif', 403)
  }

  if (!typedProfile.organization_id) {
    throw new AuthContextError('Organisation non identifiée', 403)
  }

  return {
    supabase,
    userId: user.id,
    organizationId: typedProfile.organization_id,
    role: typedProfile.role_slug,
    currency: getCurrency(typedProfile.organizations),
  }
}

// Comme requireOrganizationContext, mais retombe sur le cookie kiosk_token
// (aucune session Supabase Auth) quand l'acteur est un employé en session kiosque pure.
export async function requireOrganizationContextOrKiosk() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return requireOrganizationContext()
  }

  const cookieStore = await cookies()
  const kioskToken = cookieStore.get('kiosk_token')?.value
  const claims = kioskToken ? verifyKioskToken(kioskToken) : null

  if (!claims) {
    throw new AuthContextError('Non authentifié', 401)
  }

  const { createClient: createAdminClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('organization_id, role_slug, is_active, organizations(currency_symbol)')
    .eq('id', claims.userId)
    .single()

  if (profileError || !profile) {
    throw new AuthContextError('Profil introuvable', 403)
  }

  const typedProfile = profile as ProfileContext

  if (!typedProfile.is_active) {
    throw new AuthContextError('Profil inactif', 403)
  }

  if (!typedProfile.organization_id || typedProfile.organization_id !== claims.orgId) {
    throw new AuthContextError('Organisation invalide', 403)
  }

  return {
    supabase: supabaseAdmin,
    userId: claims.userId,
    organizationId: typedProfile.organization_id,
    role: typedProfile.role_slug,
    currency: getCurrency(typedProfile.organizations),
  }
}

export async function requireOrgRole(roles: string[]) {
  const context = await requireOrganizationContext()

  if (!roles.includes(context.role)) {
    throw new AuthContextError('Accès refusé', 403)
  }

  return context
}

export async function requireRoleContext(roles: string[]) {
  return requireOrgRole(roles)
}

type RoleContext = Awaited<ReturnType<typeof requireOrganizationContext>>

export async function requireOpenSalesSession(context: RoleContext) {
  const { data, error } = await context.supabase
    .from('sales_sessions')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('status', 'open')
    .maybeSingle()

  if (error) {
    throw new AuthContextError(error.message, 500)
  }

  if (!data?.id) {
    throw new AuthContextError('La caisse est fermée. Ouvrez une session de vente avant cette opération.', 403)
  }

  return data.id
}
