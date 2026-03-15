'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard, ShoppingBag, BookOpen, Package,
    ClipboardList, Bot, LogOut, Menu, X, CakeSlice, Users, Lock
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logoutKiosk } from '@/lib/actions/auth'
import { toast } from 'sonner'
import type { Profile } from '@/types/supabase'

interface Props {
    profile: Profile
    organization: { name: string; currency_symbol: string } | null
    kioskProfile?: { full_name: string; theme_color: string | null; role_slug: string } | null
}

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'gerant', 'vendeur', 'patissier'] },
    { href: '/commandes', label: 'Commandes', icon: ShoppingBag, roles: ['super_admin', 'gerant', 'vendeur'] },
    { href: '/recettes', label: 'Recettes', icon: BookOpen, roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/ingredients', label: 'Ingrédients', icon: Package, roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/inventaire', label: 'Inventaire', icon: ClipboardList, roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/ai-assistant', label: 'Comptable IA', icon: Bot, roles: ['super_admin', 'gerant'] },
    { href: '/equipe', label: 'Mon Équipe', icon: Users, roles: ['super_admin', 'gerant'] },
    // Section Admin réservée au Super Admin SaaS
    { href: '/admin', label: 'Admin', icon: LayoutDashboard, roles: ['super_admin'] },
]

export default function DashboardSidebar({ profile, organization }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)

    const filtered = navItems.filter(n => n.roles.includes(profile.role_slug))

    async function handleLogout() {
        const supabase = createClient()
        // Si on est en mode kiosque, on retire juste le cookie sans déconnecter la session gerant
        const kioskCookie = document.cookie.includes('kiosk_user_id=')
        if (kioskCookie) {
            await logoutKiosk()
            router.push('/kiosk')
        } else {
            await supabase.auth.signOut()
            toast.success('Déconnexion réussie')
            router.push('/login')
        }
        router.refresh()
    }

    const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    const SidebarContent = () => (
        <nav style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 12px' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 8px', marginBottom: '24px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '38px', height: '38px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #C4836A, #C78A4A)', flexShrink: 0,
                }}>
                    <CakeSlice size={20} color="white" strokeWidth={1.5} />
                </div>
                <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#2D1B0E', lineHeight: 1.2 }}>Pâtiss&apos;App</div>
                    <div style={{ fontSize: '0.7rem', color: '#9C8070', lineHeight: 1.2 }}>{organization?.name ?? ''}</div>
                </div>
            </div>

            {/* Nav links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                {filtered.map(item => {
                    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                    return (
                        <Link key={item.href} href={item.href}
                            className={`sidebar-link${active ? ' active' : ''}`}
                            onClick={() => setOpen(false)}
                        >
                            <item.icon size={18} strokeWidth={1.75} />
                            {item.label}
                        </Link>
                    )
                })}
            </div>

            {/* Profile + Logout */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: 'var(--radius-md)', marginBottom: '8px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: '#E8B4A0', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: '#6B3F2A', flexShrink: 0,
                    }}>
                        {initials(profile.full_name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2D1B0E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {profile.full_name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9C8070', textTransform: 'capitalize' }}>
                            {profile.role_slug}
                        </div>
                    </div>
                </div>
                <button onClick={handleLogout} className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: '#D94F38' }}>
                    <LogOut size={16} />
                    Déconnexion
                </button>
            </div>
        </nav>
    )

    return (
        <>
            {/* Desktop sidebar */}
            <aside style={{
                width: '220px', flexShrink: 0,
                background: 'white', borderRight: '1.5px solid var(--color-border)',
                position: 'sticky', top: 0, height: '100dvh', overflowY: 'auto',
                display: 'none',
            }} className="sidebar-desktop">
                <SidebarContent />
            </aside>

            {/* Mobile top bar */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
                background: 'white', borderBottom: '1.5px solid var(--color-border)',
                display: 'flex', alignItems: 'center', padding: '0 16px', height: '56px',
                gap: '12px',
            }} className="sidebar-mobile-bar">
                <button onClick={() => setOpen(true)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 8px' }}>
                    <Menu size={22} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #C4836A, #C78A4A)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CakeSlice size={16} color="white" strokeWidth={1.5} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#2D1B0E' }}>Pâtiss&apos;App</span>
                </div>
            </div>

            {/* Mobile drawer */}
            {open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
                    <div onClick={() => setOpen(false)}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.4)', backdropFilter: 'blur(4px)' }} />
                    <div style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0, width: '260px',
                        background: 'white', animation: 'slideUp 0.25s ease',
                    }}>
                        <button onClick={() => setOpen(false)}
                            style={{ position: 'absolute', top: '12px', right: '12px' }}
                            className="btn-ghost">
                            <X size={20} />
                        </button>
                        <SidebarContent />
                    </div>
                </div>
            )}

            <style>{`
        @media (min-width: 768px) {
          .sidebar-desktop { display: block !important; }
          .sidebar-mobile-bar { display: none !important; }
          main { padding-top: 24px !important; }
        }
        @media (max-width: 767px) {
          main { padding-top: 72px !important; }
        }
      `}</style>
        </>
    )
}
