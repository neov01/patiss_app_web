'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard, ShoppingBag, BookOpen, Package,
    ClipboardList, Bot, LogOut, Menu, X, CakeSlice, Users, Lock, Store
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logoutKiosk } from '@/lib/actions/auth'
import { toast } from 'sonner'
import type { Profile } from '@/types/supabase'

interface Props {
    profile: Profile
    adminProfile?: Profile | null
    organization: { name: string; currency_symbol: string } | null
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

export default function DashboardSidebar({ profile, adminProfile, organization }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)

    const filtered = navItems.filter(n => n.roles.includes(profile.role_slug))

    async function handleLogout() {
        // Check client-side if we are in a Kiosk session
        const isKioskSession = document.cookie.includes('kiosk_user_id=');

        if (isKioskSession) {
            // If it's a Kiosk user, only clear the kiosk session and go back to the kiosk screen.
            await logoutKiosk();
            toast.info("Session kiosque terminée.");
            router.push('/kiosk');
        } else {
            // If it's a manager/admin, perform a full sign out.
            const supabase = createClient();
            // CRITICAL: Also ensure the kiosk cookie is manually cleared as a safeguard.
            await logoutKiosk();
            await supabase.auth.signOut();
            toast.success('Déconnexion réussie.');
            router.push('/login');
        }
        router.refresh();
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

                {profile.role_slug === 'gerant' && profile.organization_id && (
                    <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                        <Link href={`/kiosk?orgId=${profile.organization_id}`}
                            className="sidebar-link"
                            style={{ background: '#FEF3EC', color: '#D97757', fontWeight: 800 }}
                            onClick={() => setOpen(false)}
                        >
                            <Store size={18} strokeWidth={2} />
                            Ouvrir le Kiosque
                        </Link>
                    </div>
                )}
            </div>

            {/* Escape Hatch Banner if Impersonating */}
            {adminProfile && adminProfile.id !== profile.id && (
                <div style={{
                    margin: '12px 8px', padding: '12px', background: '#FEF3EC',
                    border: '1.5px solid #FDE8DB', borderRadius: '16px',
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#D97757', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={12} /> MODE KIOSQUE
                    </div>
                    <button
                        onClick={handleLogout}
                        style={{
                            width: '100%', padding: '8px', background: 'white', border: '1.5px solid #FDE8DB',
                            borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700, color: '#2D1B0E',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                        }}
                    >
                        Retour Admin
                    </button>
                </div>
            )}

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
