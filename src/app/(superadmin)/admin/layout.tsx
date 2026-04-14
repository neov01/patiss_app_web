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

            <main className="flex-1 h-screen overflow-y-auto custom-scrollbar relative">
                <AutoLockProvider
                    userId={user.id}
                    role={profile.role_slug}
                    autoLockSeconds={1800} // 30 mins
                    themeColor="#9333EA"
                    organizationId={profile.organization_id || ''}
                    isKiosk={false}
                >
                    <div className="p-4 md:p-8">
                        <div className="max-w-7xl mx-auto w-full">
                            {children}
                        </div>
                    </div>
                </AutoLockProvider>
            </main>
        </div>
    )
}
