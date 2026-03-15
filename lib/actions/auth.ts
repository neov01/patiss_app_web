'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function loginWithPin(profileId: string, pin: string) {
    const supabase = await createClient()

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('pin_code, full_name, role_slug, is_active, theme_color, auto_lock_seconds')
        .eq('id', profileId)
        .single()

    if (error || !profile) return { error: 'Profil introuvable.' }
    if (!profile.is_active) return { error: 'Profil inactif.' }
    if (profile.pin_code !== pin) return { error: 'Code PIN incorrect.' }

    const cookieStore = await cookies()
    cookieStore.set('kiosk_user_id', profileId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 8, // 8 heures max
    })

    return { success: true, profile }
}

export async function logoutKiosk() {
    const cookieStore = await cookies()
    cookieStore.delete('kiosk_user_id')
    return { success: true }
}
