'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function SuperAdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const navItems = [
        { href: '/admin', icon: LayoutDashboard, label: 'Super Admin' },
    ]

    const handleSignOut = async () => {
        try {
            await supabase.auth.signOut()
            toast.success('Déconnexion réussie')
            router.push('/login')
            router.refresh()
        } catch (error) {
            console.error('Sign out error', error)
            toast.error('Erreur lors de la déconnexion')
        }
    }

    return (
        <aside className="w-64 bg-white border-r border-[#EEEEEE] h-screen flex flex-col hidden md:flex shrink-0">
            <div className="p-6">
                <Link href="/admin" className="flex items-center gap-2 group">
                    <div className="bg-[#FEF3EC] p-2 rounded-xl group-hover:scale-105 transition-transform">
                        <span className="text-xl">🛠️</span>
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-[#2D1B0E] tracking-tight leading-none">Pâtiss'App</h1>
                        <span className="text-[10px] uppercase font-bold text-[#D97757] tracking-wider">Super Admin</span>
                    </div>
                </Link>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
                {navItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group
                                ${isActive
                                    ? 'bg-[#2D1B0E] text-white shadow-md'
                                    : 'text-[#8E8680] hover:bg-[#FDFCFB] hover:text-[#2D1B0E]'
                                }`}
                        >
                            <item.icon
                                size={20}
                                className={isActive ? 'text-[#D97757]' : 'group-hover:text-[#D97757] transition-colors'}
                            />
                            <span className="font-bold text-sm">{item.label}</span>
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 mt-auto border-t border-[#EEEEEE]">
                <button
                    onClick={handleSignOut}
                    className="flex w-full items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-[#D94F38] hover:bg-[#FEF3EC] transition-colors"
                >
                    <LogOut size={16} />
                    <span>Déconnexion</span>
                </button>
            </div>
        </aside>
    )
}
