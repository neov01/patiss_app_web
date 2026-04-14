'use server'

// {"file":"src/lib/actions/employees.ts","type":"action","depends":["@/lib/supabase/server","@/lib/schemas/employee.schema","next/cache"],"exports":["createEmployee","updateEmployee","deleteEmployee","addPayEvent","deletePayEvent","getMonthlyPayslip","uploadEmployeeAvatar"],"supabase_tables":["profiles","employee_pay_events"]}

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { EmployeeFormValues, PayEventFormValues } from '@/lib/schemas/employee.schema'
import bcrypt from 'bcryptjs'

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────
async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  return data?.organization_id ?? null
}

// ─────────────────────────────────────────────────
// 1. Créer un employé
// ─────────────────────────────────────────────────
export async function createEmployee(data: EmployeeFormValues & { organization_id?: string }) {
  const supabase = await createClient()
  const orgId = data.organization_id ?? await getOrgId()
  if (!orgId) return { success: false, error: 'Non authentifié' }

  try {
    const hashedPin = data.pinCode ? await bcrypt.hash(data.pinCode, 10) : null
    
    // Hash du PIN via Supabase Edge Function ou simple bcrypt côté server
    // Pour simplifier : on stocke le hash via la logique existante
    const { data: emp, error } = await (supabase.from as any)('profiles')
      .insert({
        organization_id: orgId,
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
        is_active:       true,
      } )
      .select()
      .single()

    if (error) throw new Error(error.message)

    revalidatePath('/mon-equipe')
    return { success: true, employeeId: emp.id }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg }
  }
}

// ─────────────────────────────────────────────────
// 2. Mettre à jour un employé
// ─────────────────────────────────────────────────
export async function updateEmployee(id: string, data: Partial<EmployeeFormValues>) {
  const supabase = await createClient()

  try {
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
    
    if (data.pinCode && data.pinCode.length === 4) {
      patch.pin_code = await bcrypt.hash(data.pinCode, 10)
    }

    const { error } = await (supabase.from as any)('profiles')
      .update(patch)
      .eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/mon-equipe')
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
  const supabase = await createClient()

  try {
    const { error } = await (supabase.from as any)('profiles')
      .update({ is_active: false })
      .eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/mon-equipe')
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
  const supabase = await createClient()

  try {
    const { error } = await (supabase.from as any)('profiles')
      .update({ is_active: true })
      .eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/mon-equipe')
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
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { success: false, error: 'Non authentifié' }

  try {
    const { error } = await (supabase.from as any)('employee_pay_events')
      .insert({
        organization_id: orgId,
        employee_id:     data.employeeId,
        month:           data.month,
        type:            data.type,
        amount:          data.amount,
        label:           data.label,
      })

    if (error) throw new Error(error.message)

    revalidatePath('/mon-equipe')
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
  const supabase = await createClient()

  try {
    const { error } = await (supabase.from as any)('employee_pay_events')
      .delete()
      .eq('id', id)

    if (error) throw new Error(error.message)

    revalidatePath('/mon-equipe')
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
  const supabase = await createClient()

  try {
    const [empRes, eventsRes] = await Promise.all([
      (supabase.from as any)('profiles')
        .select('base_salary, full_name')
        .eq('id', employeeId)
        .single(),
      (supabase.from as any)('employee_pay_events')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('month', month)
        .order('created_at')
    ])

    const baseSalary = Number(empRes.data?.base_salary ?? 0)
    const events: Array<{ id: string; type: 'prime' | 'retenue'; amount: number; label: string; created_at: string }> = eventsRes.data ?? []

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
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { success: false, error: 'Non authentifié', url: '' }

  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'Aucun fichier', url: '' }

  try {
    const path = `${orgId}/${employeeId}.webp`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: 'image/webp' })

    if (uploadError) throw new Error(uploadError.message)

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = urlData.publicUrl

    // Update profile
    await (supabase.from as any)('profiles').update({ avatar_url: url }).eq('id', employeeId)

    revalidatePath('/mon-equipe')
    return { success: true, url }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur inconnue'
    return { success: false, error: msg, url: '' }
  }
}
