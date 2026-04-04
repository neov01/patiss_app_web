import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import AutoLockProvider from '@/components/auth/AutoLockProvider'
import { checkSubscriptionStatus } from '@/lib/utils/subscription'
import { getOpenSession } from '@/lib/actions/sessions'
import SessionMaster from '@/components/layout/SessionMaster'
import RealtimeSync from '@/components/shared/RealtimeSync'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const cookieStore = await cookies()
    const kioskUserId = cookieStore.get('kiosk_user_id')?.value

    if (!user && !kioskUserId) redirect('/login')

    // 1. Fetch the REAL authenticated user's profile (the admin/manager) or the kiosk profile
    let adminProfile = null
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('*, organizations(*)')
            .eq('id', user.id)
            .single()
        adminProfile = profile
    }

    // 2. Determine the profile to display (start with admin, override if kiosk)
    let displayProfile = adminProfile
    
    if (kioskUserId) {
        // Use admin client to reliably fetch kiosk profile since there's no auth session
        const { createClient: createAdminClient } = await import('@supabase/supabase-js')
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: kioskProfile } = await supabaseAdmin
            .from('profiles')
            .select('*, organizations(*)')
            .eq('id', kioskUserId)
            .single()
        
        if (kioskProfile) {
            displayProfile = kioskProfile
            // If the manager isn't logged in, use the kiosk profile as the 'primary' session
            if (!adminProfile) adminProfile = kioskProfile
        }
    }

    if (!displayProfile) redirect('/login')

    // 1.1 Check subscription status for the organization
    const { isExpired } = await checkSubscriptionStatus()

    // Fetch active sales session
    const openSession = await getOpenSession(displayProfile.organization_id!)

    return (
        <AutoLockProvider
            autoLockSeconds={(displayProfile as any).auto_lock_seconds ?? 0}
            themeColor={(displayProfile as any).theme_color}
            userId={displayProfile.id}
            role={displayProfile.role_slug}
            organizationId={displayProfile.organization_id!}
            isKiosk={!!kioskUserId}
        >
            <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--color-bg)' }}>
                <RealtimeSync organizationId={displayProfile.organization_id!} />
                {isExpired && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: '#ef4444',
                        color: 'white',
                        textAlign: 'center',
                        padding: '8px',
                        zIndex: 9999,
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}>
                        ⚠️ Abonnement expiré — Mode lecture seule activé. Veuillez contacter le support ou renouveler votre offre.
                    </div>
                )}
                <DashboardSidebar
                    profile={displayProfile}
                    adminProfile={adminProfile}
                    organization={displayProfile.organizations as { name: string; currency_symbol: string }}
                    isKiosk={!!kioskUserId}
                />
                <main style={{ 
                    flex: 1, 
                    minWidth: 0, 
                    padding: '24px', 
                    paddingTop: isExpired ? '60px' : '24px',
                    paddingBottom: '120px',
                    height: '100dvh',
                    overflowY: 'auto' 
                }}>
                    <SessionMaster 
                        initialSession={openSession} 
                        orgId={displayProfile.organization_id!} 
                        userId={displayProfile.id}
                        role={displayProfile.role_slug}
                    >
                        {children}
                    </SessionMaster>
                </main>
            </div>
        </AutoLockProvider>
    )
}
