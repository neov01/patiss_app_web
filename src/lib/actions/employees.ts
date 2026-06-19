'use server'

// {"file":"src/lib/actions/employees.ts","type":"action","depends":["@/lib/supabase/server","@/lib/schemas/employee.schema","next/cache"],"exports":["createEmployee","updateEmployee","deleteEmployee","addPayEvent","deletePayEvent","getMonthlyPayslip","uploadEmployeeAvatar"],"supabase_tables":["profiles","employee_pay_events"]}

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { EmployeeFormValues, PayEventFormValues } from '@/lib/schemas/employee.schema'
import bcrypt from 'bcryptjs'
import { requireOrgRole } from '@/lib/auth/organization-context'
import type { Database } from '@/types/supabase'

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────
function createAdminClient() {
  return createSupabaseAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function makeInternalEmail(fullName: string, organizationId: string) {
  const slug = fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40) || 'employe'
  return `${slug}.${organizationId.slice(0, 8)}.${crypto.randomUUID().slice(0, 8)}@internal.patiss.app`
}

// ─────────────────────────────────────────────────
// 1. Créer un employé
// ─────────────────────────────────────────────────
export async function createEmployee(data: EmployeeFormValues) {
  let createdUserId: string | null = null
  try {
    const { organizationId } = await requireOrgRole(['gerant', 'super_admin'])
    if (!data.pinCode || data.pinCode.length !== 4) {
      return { success: false, error: 'PIN 4 chiffres requis pour créer un employé' }
    }

    const supabaseAdmin = createAdminClient()
    const email = makeInternalEmail(data.fullName, organizationId)
    const password = data.pinCode.padEnd(6, '0')
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, role_slug: data.role, internal_account: true },
    })

    if (authError) throw new Error(`Erreur Auth: ${authError.message}`)

    createdUserId = authData.user?.id ?? null
    if (!createdUserId) throw new Error("Impossible de récupérer l'ID utilisateur")

    const hashedPin = await bcrypt.hash(data.pinCode, 10)
    const { data: emp, error } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: createdUserId,
        organization_id: organizationId,
        full_name:       data.fullName,
        role_slug:       data.role,
        pin_code:        hashedPin,
        theme_color:     data.identityColor,
        auto_lock_seconds: data.autoLockSeconds,
        phone:           data.phone || null,
        hire_date:       data.hireDate || null,
        contract_type:   data.contractType,
        base_salary:     data.baseSalary,
        avatar_url:      data.avatarUrl || null,
        can_import_history: data.canImportHistory || false,
        is_active:       true,
      } )
      .select()
      .single()

    if (error) throw new Error(error.message)

    revalidatePath('/equipe')
    return { success: true, employeeId: emp.id }
  } catch (e: unknown) {
    if (createdUserId) {
      await createAdminClient().auth.admin.deleteUser(createdUserId).catch(() => {})
    }
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────
// 2. Mettre à jour un employé
// ─────────────────────────────────────────────────
export async function updateEmployee(id: string, data: Partial<EmployeeFormValues>) {
  try {
    const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin'])
    const patch: Record<string, unknown> = {}
    if (data.fullName        !== undefined) patch.full_name         = data.fullName
    if (data.role            !== undefined) patch.role_slug         = data.role
    if (data.identityColor   !== undefined) patch.theme_color       = data.identityColor
    if (data.autoLockSeconds !== undefined) patch.auto_lock_seconds = data.autoLockSeconds
    if (data.phone           !== undefined) patch.phone             = data.phone || null
    if (data.hireDate        !== undefined) patch.hire_date         = data.hireDate || null
    if (data.contractType    !== undefined) patch.contract_type     = data.contractType
    if (data.baseSalary      !== undefined) patch.base_salary       = data.baseSalary
    if (data.avatarUrl       !== undefined) patch.avatar_url        = data.avatarUrl || null
    if (data.canImportHistory !== undefined) patch.can_import_history = data.canImportHistory
    
    if (data.pinCode && data.pinCode.length === 4) {
      patch.pin_code = await bcrypt.hash(data.pinCode, 10)
    }

    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (error) throw new Error(error.message)

    revalidatePath('/equipe')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────
// 3. Désactiver un employé (soft delete)
// ─────────────────────────────────────────────────
export async function deleteEmployee(id: string) {
  try {
    const { supabase, organizationId, userId } = await requireOrgRole(['gerant', 'super_admin'])
    if (id === userId) return { success: false, error: 'Vous ne pouvez pas désactiver votre propre profil' }

    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (error) throw new Error(error.message)

    revalidatePath('/equipe')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────
// 4. Réactiver un employé
// ─────────────────────────────────────────────────
export async function reactivateEmployee(id: string) {
  try {
    const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin'])
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true })
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (error) throw new Error(error.message)

    revalidatePath('/equipe')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────
// 4. Ajouter un événement de paie (prime / retenue)
// ─────────────────────────────────────────────────
export async function addPayEvent(data: PayEventFormValues) {
  try {
    const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin'])
    const { data: employee } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.employeeId)
      .eq('organization_id', organizationId)
      .single()

    if (!employee) return { success: false, error: 'Employé introuvable' }

    const { error } = await supabase
      .from('employee_pay_events')
      .insert({
        organization_id: organizationId,
        employee_id:     data.employeeId,
        month:           data.month,
        type:            data.type,
        amount:          data.amount,
        label:           data.label,
      })

    if (error) throw new Error(error.message)

    revalidatePath('/equipe')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────
// 5. Supprimer un événement de paie (hard delete)
// ─────────────────────────────────────────────────
export async function deletePayEvent(id: string) {
  try {
    const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin'])
    const { error } = await supabase
      .from('employee_pay_events')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (error) throw new Error(error.message)

    revalidatePath('/equipe')
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────
// 6. Fiche de paie mensuelle
// ─────────────────────────────────────────────────
export async function getMonthlyPayslip(employeeId: string, month: string) {
  try {
    const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin'])
    const [empRes, eventsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('base_salary, full_name')
        .eq('id', employeeId)
        .eq('organization_id', organizationId)
        .single(),
      supabase
        .from('employee_pay_events')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('organization_id', organizationId)
        .eq('month', month)
        .order('created_at')
    ])

    const baseSalary = Number(empRes.data?.base_salary ?? 0)
    const events = (eventsRes.data ?? []).map(e => ({
      id: e.id,
      type: e.type === 'prime' ? 'prime' as const : 'retenue' as const,
      amount: e.amount,
      label: e.label,
      created_at: e.created_at ?? ''
    }))

    const primes   = events.filter(e => e.type === 'prime')
    const retenues = events.filter(e => e.type === 'retenue')

    const sumPrimes   = primes.reduce((s, e) => s + Number(e.amount), 0)
    const sumRetenues = retenues.reduce((s, e) => s + Number(e.amount), 0)
    const net = baseSalary + sumPrimes - sumRetenues

    return {
      employeeName: empRes.data?.full_name ?? '',
      baseSalary,
      primes,
      retenues,
      sumPrimes,
      sumRetenues,
      net,
      month,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    console.error('getMonthlyPayslip error:', msg)
    return null
  }
}

// ─────────────────────────────────────────────────
// 7. Upload avatar employé
// ─────────────────────────────────────────────────
export async function uploadEmployeeAvatar(employeeId: string, formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'Aucun fichier', url: '' }

  try {
    const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin'])
    const path = `${organizationId}/${employeeId}.webp`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: 'image/webp' })

    if (uploadError) throw new Error(uploadError.message)

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = urlData.publicUrl

    // Update profile
    await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', employeeId)
      .eq('organization_id', organizationId)

    revalidatePath('/equipe')
    return { success: true, url }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg, url: '' }
  }
}
