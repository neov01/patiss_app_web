import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'
import { verifyKioskToken } from '@/lib/kiosk-token'

export async function createClient() {
    const cookieStore = await cookies()
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')

    // Session kiosque : vérifier le token HMAC signé (résistant à la falsification)
    const kioskToken = cookieStore.get('kiosk_token')?.value
        ?? cookieStore.get('kiosk_user_id')?.value // rétrocompat ancien cookie non signé
    const hasGerantSession = cookieStore.get('sb-access-token') || cookieStore.get('sb-refresh-token')

    if (kioskToken && !hasGerantSession) {
        // Vérifier la signature cryptographique du token
        const claims = kioskToken.includes('.') ? verifyKioskToken(kioskToken) : null

        // Ancien cookie non signé (rétrocompat) : accepté mais limité
        const userId = claims?.userId ?? (kioskToken.includes('.') ? null : kioskToken)
        const orgId = claims?.orgId ?? null

        if (userId) {
            const adminClient = createSupabaseClient<Database>(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } }
            )

            adminClient.auth.getUser = async () => ({
                data: {
                    user: {
                        id: userId,
                        email: 'kiosk@patiss.app',
                        aud: 'authenticated',
                        role: 'authenticated',
                        // orgId exposé pour validation côté pages/actions
                        app_metadata: { kiosk_org_id: orgId },
                    } as any
                },
                error: null
            })

            return adminClient
        }
    }

    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Server Component — ignorer les erreurs de set
                    }
                },
            },
        }
    )
}
