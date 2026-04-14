'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import {
    LayoutDashboard, ShoppingBag, BookOpen, Package,
    ClipboardList, Bot, LogOut, Menu, X, CakeSlice, Users, Lock, Store
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { logoutKiosk } from '@/lib/actions/auth'
import { toast } from 'sonner'
import type { Profile } from '@/types/supabase'
import EmployeeModal from '@/components/equipe/EmployeeModal'
import type { EmployeeData } from '@/components/equipe/EmployeeCard'

interface Props {
    profile: Profile
    adminProfile?: Profile | null
    organization: { name: string; currency_symbol: string } | null
    isKiosk: boolean
    onNetworkStatus?: (status: 'online' | 'unstable' | 'offline') => void
}

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'gerant', 'vendeur', 'patissier'] },
    { href: '/caisse', label: 'Caisse', icon: Store, roles: ['super_admin', 'gerant', 'vendeur'] },
    { href: '/commandes', label: 'Commandes', icon: ShoppingBag, roles: ['super_admin', 'gerant', 'vendeur'] },
    { href: '/catalogue', label: 'Catalogue Produits', icon: BookOpen, roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/ingredients', label: 'Ingrédients', icon: Package, roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/inventaire', label: 'Inventaire', icon: ClipboardList, roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/ai-assistant', label: 'Comptable IA', icon: Bot, roles: ['super_admin', 'gerant'] },
    { href: '/equipe', label: 'Mon Équipe', icon: Users, roles: ['super_admin', 'gerant'] },
    // Section Admin réservée au Super Admin SaaS
    { href: '/admin', label: 'Admin', icon: LayoutDashboard, roles: ['super_admin'] },
]

export default function DashboardSidebar({ profile, adminProfile, organization, isKiosk, onNetworkStatus }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const { status: networkStatus } = useNetworkStatus()
    const [open, setOpen] = useState(false)
    const [isSwitchingToKiosk, setIsSwitchingToKiosk] = useState(false)
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

    useEffect(() => {
        onNetworkStatus?.(networkStatus)
    }, [networkStatus, onNetworkStatus])

    async function handleSwitchToKiosk() {
        if (!profile.organization_id) return
        
        setIsSwitchingToKiosk(true)
        const toastId = toast.loading('Passage en mode Kiosque...')
        
        try {
            // 1. Nettoyer les cookies de session kiosque (par précaution)
            await logoutKiosk()
            
            // 2. Déconnecter la session Supabase admin/gérant
            const supabase = createClient()
            const { error } = await supabase.auth.signOut()
            
            if (error) throw error

            toast.success('Prêt pour le Kiosque.', { id: toastId })
            
            // 3. Redirection sécurisée
            router.replace(`/kiosk?orgId=${profile.organization_id}`)
        } catch (err: any) {
            console.error('Kiosk switch error:', err)
            toast.error('Erreur lors du passage au mode kiosque. Votre session est toujours active par sécurité.', { id: toastId })
        } finally {
            setIsSwitchingToKiosk(false)
        }
    }

    const filtered = navItems.filter(n => n.roles.includes(profile.role_slug))

    async function handleLogout() {
        if (isKiosk) {
            // If it's a Kiosk user, only clear the kiosk session and go back to the kiosk selection screen for THIS org.
            await logoutKiosk();
            toast.info("Session kiosque terminée.");
            router.push(`/kiosk?orgId=${profile.organization_id}`);
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ 
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: networkStatus === 'online' ? '#22C55E' : networkStatus === 'unstable' ? '#F59E0B' : '#EF4444',
                            boxShadow: `0 0 6px ${networkStatus === 'online' ? '#22C55E' : networkStatus === 'unstable' ? '#F59E0B' : '#EF4444'}`,
                            flexShrink: 0
                        }} />
                        <span style={{ fontSize: '0.7rem', color: '#9C8070', lineHeight: 1.2 }}>{organization?.name ?? ''}</span>
                    </div>
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
                        <button
                            onClick={handleSwitchToKiosk}
                            disabled={isSwitchingToKiosk}
                            className="sidebar-link"
                            style={{ 
                                width: '100%',
                                background: '#FEF3EC', 
                                color: '#D97757', 
                                fontWeight: 800,
                                border: 'none',
                                cursor: isSwitchingToKiosk ? 'not-allowed' : 'pointer',
                                textAlign: 'left',
                                opacity: isSwitchingToKiosk ? 0.7 : 1
                            }}
                        >
                            <Store size={18} strokeWidth={2} />
                            {isSwitchingToKiosk ? 'Déconnexion...' : 'Ouvrir le Kiosque'}
                        </button>
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
                <button
                    onClick={() => setIsProfileModalOpen(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', 
                        borderRadius: 'var(--radius-md)', marginBottom: '8px', width: '100%',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        transition: 'background 0.15s', textAlign: 'left',
                        outline: 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    title="Modifier mon profil"
                >
                    <div style={{ position: 'relative' }}>
                        {profile.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img 
                                src={profile.avatar_url} 
                                alt="Avatar" 
                                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${profile.theme_color ?? '#E8B4A0'}` }} 
                            />
                        ) : (
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '50%',
                                background: profile.theme_color ?? '#E8B4A0', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: '#fff', flexShrink: 0,
                            }}>
                                {initials(profile.full_name)}
                            </div>
                        )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2D1B0E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {profile.full_name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9C8070', textTransform: 'capitalize' }}>
                            {profile.role_slug}
                        </div>
                    </div>
                </button>
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

            {/* Mobile Bottom Navigation Bar */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
                background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)',
                borderTop: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                height: '70px', paddingBottom: 'env(safe-area-inset-bottom)'
            }} className="sidebar-mobile-bar">
                <Link href="/dashboard" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: pathname === '/dashboard' ? 'var(--color-rose-dark)' : '#9C8070' }}>
                    <LayoutDashboard size={24} strokeWidth={pathname === '/dashboard' ? 2.5 : 2} />
                    <span style={{ fontSize: '0.65rem', fontWeight: pathname === '/dashboard' ? 700 : 500 }}>Dashboard</span>
                </Link>
                {filtered.some(i => i.href === '/caisse') && (
                  <Link href="/caisse" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: pathname === '/caisse' ? 'var(--color-rose-dark)' : '#9C8070' }}>
                      <Store size={24} strokeWidth={pathname === '/caisse' ? 2.5 : 2} />
                      <span style={{ fontSize: '0.65rem', fontWeight: pathname === '/caisse' ? 700 : 500 }}>Caisse</span>
                  </Link>
                )}
                {filtered.some(i => i.href === '/commandes') && (
                  <Link href="/commandes" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: pathname === '/commandes' ? 'var(--color-rose-dark)' : '#9C8070' }}>
                      <ShoppingBag size={24} strokeWidth={pathname === '/commandes' ? 2.5 : 2} />
                      <span style={{ fontSize: '0.65rem', fontWeight: pathname === '/commandes' ? 700 : 500 }}>Commandes</span>
                  </Link>
                )}
                <button onClick={() => setOpen(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: open ? 'var(--color-rose-dark)' : '#9C8070', cursor: 'pointer', padding: 0 }}>
                    <Menu size={24} strokeWidth={open ? 2.5 : 2} color={open ? 'var(--color-rose-dark)' : '#9C8070'} />
                    <span style={{ fontSize: '0.65rem', fontWeight: open ? 700 : 500, color: open ? 'var(--color-rose-dark)' : '#9C8070' }}>Plus</span>
                </button>
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
          main { padding-top: 24px !important; margin-left: 0; }
        }
        @media (max-width: 767px) {
          main { 
            padding-top: 24px !important; 
            padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important; 
          }
        }
      `}</style>

            <EmployeeModal 
                open={isProfileModalOpen} 
                onClose={() => setIsProfileModalOpen(false)} 
                onSuccess={() => { router.refresh() }}
                mode="edit"
                employee={profile as unknown as EmployeeData}
                organizationId={profile.organization_id || ''}
                currency={organization?.currency_symbol || 'FCFA'}
            />
        </>
    )
}
