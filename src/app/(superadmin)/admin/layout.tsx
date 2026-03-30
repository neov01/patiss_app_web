import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import AutoLockProvider from '@/components/auth/AutoLockProvider'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role_slug, is_active, organization_id')
        .eq('id', user.id)
        .single()

    if (!profile?.is_active) {
        redirect('/logout?reason=inactive')
    }

    if (profile.role_slug !== 'super_admin') {
        redirect('/unauthorized')
    }

    return (
        <div className="flex h-screen bg-[#FDFCFB] overflow-hidden">
            <SuperAdminSidebar />

            <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
                <AutoLockProvider
                    userId={user.id}
                    role={profile.role_slug}
                    autoLockSeconds={1800} // 30 mins, though ignored for super_admin natively
                    themeColor="#9333EA" // Purple for super admin
                    organizationId={profile.organization_id || ''}
                    isKiosk={false}
                >
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                        <div className="max-w-7xl mx-auto w-full">
                            {children}
                        </div>
                    </div>
                </AutoLockProvider>
            </main>
        </div>
    )
}
