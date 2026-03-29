'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

export async function createEmployee(data: {
    full_name: string
    role_slug: string
    pin_code: string
    theme_color?: string
    auto_lock_seconds?: number
    organization_id: string
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role_slug, organization_id')
        .eq('id', user.id)
        .single()

    if (!profile || !['super_admin', 'gerant'].includes(profile.role_slug)) {
        return { error: 'Permission refusée' }
    }

    const hashedPin = await bcrypt.hash(data.pin_code, 10)

    const { error } = await supabase.from('profiles').insert({
        full_name: data.full_name,
        role_slug: data.role_slug,
        pin_code: hashedPin,
        theme_color: data.theme_color || null,
        auto_lock_seconds: data.auto_lock_seconds ?? 60,
        organization_id: data.organization_id,
        is_active: true,
    })

    if (error) return { error: error.message }
    revalidatePath('/equipe')
    return { success: true }
}

export async function updateEmployee(id: string, data: {
    full_name?: string
    role_slug?: string
    pin_code?: string
    theme_color?: string | null
    auto_lock_seconds?: number
    is_active?: boolean
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    let updateData = { ...data }
    if (data.pin_code) {
        updateData.pin_code = await bcrypt.hash(data.pin_code, 10)
    }

    const { error } = await supabase.from('profiles').update(updateData).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/equipe')
    return { success: true }
}

export async function deleteEmployee(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/equipe')
    return { success: true }
}
