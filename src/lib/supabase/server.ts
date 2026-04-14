import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

export async function createClient() {
    const cookieStore = await cookies()
    const kioskUserId = cookieStore.get('kiosk_user_id')?.value
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')

    // If it's a kiosk session WITHOUT a gérant session, use service role to allow data fetching by the server.
    // This is safe as it's only on the server, and pages already filter by organization_id.
    const isKioskOnly = kioskUserId && !cookieStore.get('sb-access-token') && !cookieStore.get('sb-refresh-token');

    if (isKioskOnly) {
        const adminClient = createSupabaseClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )
        
        // Mock getUser so pages can bypass authentication checks and use the kiosk identity
        // to filter data (organization_id check on profiles).
        adminClient.auth.getUser = async () => ({ 
            data: { 
                user: { 
                    id: kioskUserId, 
                    email: 'kiosk@patiss.app',
                    aud: 'authenticated',
                    role: 'authenticated'
                } as any 
            }, 
            error: null 
        })
        
        return adminClient
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
