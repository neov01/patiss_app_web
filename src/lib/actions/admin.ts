'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

// Helper to verify super_admin role
async function checkSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_slug')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role_slug !== 'super_admin') {
    throw new Error('Action réservée aux Super Administrateurs')
  }
  return true
}


export async function updateUserRole({ userId, role_slug, is_active }: {
  userId: string
  role_slug: string
  is_active: boolean
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update({ role_slug, is_active }).eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true }
}

export async function updateOrganization(orgId: string, data: {
  name?: string
  currency_symbol?: string
  subscription_end_date?: string | null
  tier?: string
  max_users?: number
  contact_email?: string | null
  contact_phone?: string | null
}) {
  try {
    await checkSuperAdmin()
    const supabase = await createClient()
    const { error } = await supabase.from('organizations').update(data).eq('id', orgId)
    if (error) return { error: error.message }
    revalidatePath('/admin')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}


export async function createOrganizationWithGerant(data: {
  org_name: string
  currency_symbol: string
  subscription_end_date: string | null
  gerant_full_name: string
  gerant_email: string
  gerant_pin: string
}) {
  const supabase = await createClient()

  // 1. Create the organization
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: data.org_name,
      currency_symbol: data.currency_symbol,
      subscription_end_date: data.subscription_end_date,
    })
    .select('id')
    .single()

  if (orgErr || !org) return { error: orgErr?.message ?? 'Erreur lors de la création de l\'organisation' }

  // 2. Initialize admin client to bypass sign-up restrictions and avoid session mutation
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: data.gerant_email,
    password: data.gerant_pin.padEnd(6, '0'), // Pad to 6 chars for Supabase Auth
    email_confirm: true,
  });

  if (authErr) {
    // Rollback org creation if user creation fails
    await supabase.from('organizations').delete().eq('id', org.id);
    return { error: `Erreur Auth: ${authErr.message}` };
  }

  const userId = authData.user?.id;

  if (!userId) {
    await supabase.from('organizations').delete().eq('id', org.id);
    return { error: 'Impossible de récupérer l\'ID de l\'utilisateur' };
  }

  const hashedPin = await bcrypt.hash(data.gerant_pin, 10)

  // 3. Create/Update the gérant profile linked to this org
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name: data.gerant_full_name,
      role_slug: 'gerant',
      organization_id: org.id,
      pin_code: hashedPin,
      is_active: true,
      auto_lock_seconds: 120,
    })

  if (profileErr) {
    return { error: `Erreur Profil: ${profileErr.message}` }
  }

  revalidatePath('/admin')
  return { success: true, orgId: org.id }
}

export async function suspendOrganization(orgId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true }
}

export async function reactivateOrganization(orgId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true }
}

export async function resetEmployeePin(profileId: string, customPin?: string) {
  try {
    await checkSuperAdmin()
    const supabase = await createClient()
    
    // If no PIN provided, generate one (4 digits)
    const pin = customPin || Math.floor(1000 + Math.random() * 9000).toString()
    const hashedPin = await bcrypt.hash(pin, 10)
    
    const { error } = await supabase
      .from('profiles')
      .update({ pin_code: hashedPin })
      .eq('id', profileId)
      
    if (error) return { error: error.message }
    
    revalidatePath('/admin')
    return { success: true, newPin: pin }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function impersonateUser(orgId: string) {
  try {
    await checkSuperAdmin()
    
    // Initialize admin client to generate link
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Find a user from that organization to impersonate (usually the gérant)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('role_slug', 'gerant')
      .limit(1)
      .single()

    if (pErr || !profile) {
      return { error: "Aucun gérant trouvé pour cette organisation." }
    }

    // 2. Get the user's email from auth.users
    const { data: { user: targetUser }, error: uErr } = await supabaseAdmin.auth.admin.getUserById(profile.id)
    if (uErr || !targetUser?.email) {
      return { error: "Utilisateur introuvable dans l'authentification." }
    }

    // 3. Generate a magic link
    const { data: linkData, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard` }
    })

    if (lErr || !linkData.properties?.action_link) {
      return { error: `Erreur génération lien: ${lErr?.message}` }
    }

    return { 
      success: true, 
      link: linkData.properties.action_link, 
      targetName: profile.full_name 
    }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function createClientUser(data: {
  organization_id: string
  full_name: string
  role_slug: string
  pin_code: string
  email?: string
}) {
  try {
    await checkSuperAdmin()
    
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Create Auth User
    const email = data.email || `${data.full_name.toLowerCase().replace(/\s/g, '.')}@${data.organization_id.slice(0, 8)}.internal`
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: data.pin_code.padEnd(6, '0'),
      email_confirm: true,
      user_metadata: { full_name: data.full_name, role_slug: data.role_slug }
    })

    if (authErr) return { error: `Erreur Auth: ${authErr.message}` }

    const userId = authData.user?.id
    if (!userId) return { error: "Erreur lors de la création de l'ID utilisateur" }

    // 2. Create Profile
    const hashedPin = await bcrypt.hash(data.pin_code, 10)
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        organization_id: data.organization_id,
        full_name: data.full_name,
        role_slug: data.role_slug,
        pin_code: hashedPin,
        is_active: true
      })

    if (profileErr) return { error: `Erreur Profil: ${profileErr.message}` }

    revalidatePath('/admin')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}


export async function generateKioskCode(orgId: string) {
  const supabase = await createClient()
  
  // 1. Get the organization name
  const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).single()
  if (!org) return { error: 'Organisation introuvable' }

  // 2. Generate the code (4 letters from name + 4 random digits)
  const letters = org.name.replace(/[^a-zA-Z]/g, '').toUpperCase().substring(0, 4).padEnd(4, 'X')
  const digits = Math.floor(1000 + Math.random() * 9000).toString()
  const code = `${letters}${digits}`

  const { error } = await supabase
    .from('organizations')
    .update({ kiosk_code: code })
    .eq('id', orgId)
    
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true, code }
}

export async function deleteOrganization(orgId: string) {
  const supabase = await createClient()
  
  // 1. Delete profiles linked to this org
  const { error: profileErr } = await supabase
    .from('profiles')
    .delete()
    .eq('organization_id', orgId)
    
  if (profileErr) return { error: profileErr.message }

  // 2. Delete the org
  const { error: orgErr } = await supabase
    .from('organizations')
    .delete()
    .eq('id', orgId)
    
  if (orgErr) return { error: orgErr.message }
  
  revalidatePath('/admin')
  return { success: true }
}
