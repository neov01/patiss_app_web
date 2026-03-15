import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import AutoLockProvider from '@/components/auth/AutoLockProvider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    let { data: profile } = await supabase
        .from('profiles')
        .select('*, organizations(*)')
        .eq('id', user.id)
        .single()

    if (!profile) redirect('/login')

    const cookieStore = await cookies()
    const kioskUserId = cookieStore.get('kiosk_user_id')?.value

    if (kioskUserId) {
        const { data: kioskProfile } = await supabase
            .from('profiles')
            .select('*, organizations(*)')
            .eq('id', kioskUserId)
            .single()
        if (kioskProfile) profile = kioskProfile
    }

    return (
        <AutoLockProvider
            autoLockSeconds={(profile as any).auto_lock_seconds ?? 0}
            themeColor={(profile as any).theme_color}
            userId={profile.id}
            role={profile.role_slug}
        >
            <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--color-bg)' }}>
                <DashboardSidebar profile={profile} organization={profile.organizations as { name: string; currency_symbol: string }} />
                <main style={{ flex: 1, minWidth: 0, padding: '24px', paddingBottom: '100px' }}>
                    {children}
                </main>
            </div>
        </AutoLockProvider>
    )
}
