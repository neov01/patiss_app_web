import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'
import type { User } from '@supabase/supabase-js'
import { verifyKioskToken } from '@/lib/kiosk-token'

export async function createClient() {
    const cookieStore = await cookies()
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')

    // Session kiosque : vérifier le token HMAC signé (résistant à la falsification)
    const kioskToken = cookieStore.get('kiosk_token')?.value
    const hasGerantSession = cookieStore.get('sb-access-token') || cookieStore.get('sb-refresh-token')

    if (kioskToken && !hasGerantSession) {
        // Vérifier la signature cryptographique du token
        const claims = verifyKioskToken(kioskToken)
        const userId = claims?.userId ?? null
        const orgId = claims?.orgId ?? null

        if (userId) {
            const kioskUser = {
                id: userId,
                email: 'kiosk@patiss.app',
                aud: 'authenticated',
                role: 'authenticated',
                app_metadata: { kiosk_org_id: orgId },
                user_metadata: {},
                created_at: new Date(0).toISOString(),
            } as unknown as User

            const adminClient = createSupabaseClient<Database>(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } }
            )

            adminClient.auth.getUser = async () => ({
                data: {
                    user: kioskUser
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
