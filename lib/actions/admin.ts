'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

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
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('organizations').update(data).eq('id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true }
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

export async function resetEmployeePin(profileId: string, newPin: string) {
  const supabase = await createClient()
  const hashedPin = await bcrypt.hash(newPin, 10)
  const { error } = await supabase
    .from('profiles')
    .update({ pin_code: hashedPin })
    .eq('id', profileId)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  return { success: true }
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
