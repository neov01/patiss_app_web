'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { createKioskToken } from '@/lib/kiosk-token'

export async function loginWithPin(profileId: string, pin: string) {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('pin_code, full_name, role_slug, is_active, theme_color, auto_lock_seconds, organization_id')
        .eq('id', profileId)
        .single()

    if (error || !profile) return { error: 'Profil introuvable.' }
    if (!profile.is_active) return { error: 'Profil inactif.' }
    if (!profile.pin_code) return { error: 'Aucun code PIN configuré pour ce profil.' }
    if (!profile.organization_id) return { error: 'Profil sans organisation.' }

    const isMatch = await bcrypt.compare(pin, profile.pin_code)
    if (!isMatch) return { error: 'Code PIN incorrect.' }

    // Token signé HMAC contenant userId + orgId pour prévenir toute falsification
    const token = createKioskToken(profileId, profile.organization_id)

    const cookieStore = await cookies()
    cookieStore.set('kiosk_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 8, // 8 heures max
    })
    // Supprimer l'ancien cookie non signé si présent
    cookieStore.set('kiosk_user_id', '', { path: '/', maxAge: 0 })

    return { success: true, profile }
}

export async function logoutKiosk() {
    const cookieStore = await cookies()
    cookieStore.set('kiosk_token', '', { path: '/', maxAge: 0, expires: new Date(0) })
    cookieStore.set('kiosk_user_id', '', { path: '/', maxAge: 0, expires: new Date(0) })
    return { success: true }
}

export async function verifyKioskCode(code: string) {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .eq('kiosk_code', code.trim().toUpperCase())
        .single()
        
    if (error || !org) {
        console.error('Kiosk verification error:', error?.message)
        return { error: 'Code Boutique incorrect ou introuvable.' }
    }
    return { success: true, orgId: org.id, orgName: org.name }
}

export async function getKioskProfiles(orgId: string) {
    // Uses service role to bypass RLS since the user is not yet logged in here
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .eq('organization_id', orgId)
        .in('role_slug', ['vendeur', 'patissier'])
        .order('full_name')
        
    if (error) return { error: error.message }
    return { success: true, profiles: data }
}
