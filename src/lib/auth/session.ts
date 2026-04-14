import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function getCurrentSession() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const cookieStore = await cookies()
    const kioskUserId = cookieStore.get('kiosk_user_id')?.value

    if (!user && !kioskUserId) return null

    // Fetch profile (use service role if kiosk-only session)
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('*, organizations(*)')
            .eq('id', user.id)
            .single()
        if (!profile) return null
        return {
            user,
            profile,
            orgId: profile.organization_id,
            currency: (profile.organizations as any)?.currency_symbol || '',
            isKiosk: false
        }
    } else {
        // Kiosk fallback: Use admin client to fetch the employee's profile
        const { createClient: createAdminClient } = await import('@supabase/supabase-js')
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('*, organizations(*)')
            .eq('id', kioskUserId)
            .single()
        if (!profile) return null
        return {
            user: null, // No official Supabase Auth user
            profile,
            orgId: profile.organization_id,
            currency: (profile.organizations as any)?.currency_symbol || '',
            isKiosk: true,
            supabaseAdmin // Return the admin client for subsequent data fetching in the page
        }
    }
}
