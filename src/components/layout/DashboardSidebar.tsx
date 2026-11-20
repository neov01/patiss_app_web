'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import {
    LayoutDashboard, ShoppingBag, BookOpen, Wheat, Contact, ShieldCheck,
    ClipboardList, Bot, LogOut, Menu, X, Users, Lock, Store, Wallet
} from 'lucide-react'
import PastryMotifs from './PastryMotifs'
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
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, group: null, roles: ['super_admin', 'gerant', 'vendeur', 'patissier'] },
    { href: '/caisse', label: 'Caisse', icon: Store, group: 'Vente', roles: ['super_admin', 'gerant', 'vendeur'] },
    { href: '/commandes', label: 'Commandes', icon: ShoppingBag, group: 'Vente', roles: ['super_admin', 'gerant', 'vendeur'] },
    { href: '/dashboard/clients', label: 'Clients', icon: Contact, group: 'Vente', roles: ['super_admin', 'gerant', 'vendeur'] },
    { href: '/catalogue', label: 'Catalogue Produits', icon: BookOpen, group: 'Atelier', roles: ['super_admin', 'gerant', 'patissier', 'vendeur'] },
    { href: '/ingredients', label: 'Ingrédients', icon: Wheat, group: 'Atelier', roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/inventaire', label: 'Inventaire', icon: ClipboardList, group: 'Atelier', roles: ['super_admin', 'gerant', 'patissier'] },
    { href: '/depenses', label: 'Dépenses', icon: Wallet, group: 'Gestion', roles: ['super_admin', 'gerant', 'vendeur'] },
    { href: '/ai-assistant', label: 'Comptable IA', icon: Bot, group: 'Gestion', roles: ['super_admin', 'gerant'] },
    { href: '/equipe', label: 'Mon Équipe', icon: Users, group: 'Gestion', roles: ['super_admin', 'gerant'] },
    // Section Admin réservée au Super Admin SaaS
    { href: '/admin', label: 'Admin', icon: ShieldCheck, group: 'Gestion', roles: ['super_admin'] },
]

const NETWORK_LABEL = { online: 'En ligne', unstable: 'Connexion instable', offline: 'Hors ligne' } as const

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
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('Kiosk switch error:', msg)
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

    const statusColor = networkStatus === 'online' ? 'var(--sidebar-success)' : networkStatus === 'unstable' ? 'var(--sidebar-warning)' : 'var(--sidebar-danger)'

    // Regroupe les liens visibles par section, en conservant l'ordre déclaré
    const groups: { title: string | null; items: typeof filtered }[] = []
    for (const item of filtered) {
        const last = groups[groups.length - 1]
        if (last && last.title === item.group) last.items.push(item)
        else groups.push({ title: item.group, items: [item] })
    }

    const SidebarContent = () => (
        <nav aria-label="Navigation principale" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100%', padding: '20px 12px' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 12px 20px', marginBottom: '8px', borderBottom: '1px solid var(--sidebar-line)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/brand/logo.png"
                    alt=""
                    width={44}
                    height={44}
                    style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', flexShrink: 0 }}
                />
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--sidebar-cream)', lineHeight: 1.15, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>Pâtiss&apos;App</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--sidebar-muted)', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {organization?.name || 'Artisanat Digital'}
                    </div>
                </div>
            </div>

            {/* Nav links */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {groups.map((group, gi) => (
                    <div key={group.title ?? `g${gi}`} role="group" aria-label={group.title ?? undefined} style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: gi === 0 ? '8px' : '0' }}>
                        {group.title && <div className="sidebar-section">{group.title}</div>}
                        {group.items.map(item => {
                            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                            return (
                                <Link key={item.href} href={item.href} prefetch={true}
                                    className={`sidebar-link${active ? ' active' : ''}`}
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => setOpen(false)}
                                >
                                    <item.icon size={20} strokeWidth={active ? 2.2 : 1.75} className="sidebar-icon" />
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                    </div>
                ))}

                {profile.role_slug === 'gerant' && profile.organization_id && (
                    <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                        <button
                            onClick={handleSwitchToKiosk}
                            disabled={isSwitchingToKiosk}
                            className="sidebar-kiosk"
                        >
                            <Store size={20} strokeWidth={2} />
                            <span>{isSwitchingToKiosk ? 'Mode Kiosque...' : 'Ouvrir le Kiosque'}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Escape Hatch Banner if Impersonating */}
            {adminProfile && adminProfile.id !== profile.id && (
                <div style={{
                    margin: '12px 0 0', padding: '12px', background: 'var(--sidebar-raised)',
                    border: '1px solid var(--sidebar-line)', borderRadius: 'var(--radius-lg)',
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--sidebar-cream)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={12} /> MODE KIOSQUE
                    </div>
                    <button onClick={handleLogout} className="sidebar-ghost" style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--sidebar-line)', borderRadius: 'var(--radius-sm)' }}>
                        Retour Admin
                    </button>
                </div>
            )}

            {/* Profile + Logout */}
            <div style={{ borderTop: '1px solid var(--sidebar-line)', paddingTop: '16px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                    onClick={() => setIsProfileModalOpen(true)}
                    className="sidebar-profile"
                    title="Modifier mon profil"
                >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        {profile.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={profile.avatar_url}
                                alt=""
                                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${profile.theme_color ?? 'var(--color-primary-container)'}` }}
                            />
                        ) : (
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '50%',
                                background: profile.theme_color ?? 'var(--color-primary-container)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontWeight: 700, fontSize: '0.875rem', color: '#fff',
                            }}>
                                {initials(profile.full_name)}
                            </div>
                        )}
                        <span
                            role="img"
                            aria-label={`Réseau : ${NETWORK_LABEL[networkStatus]}`}
                            title={`Réseau : ${NETWORK_LABEL[networkStatus]}`}
                            style={{
                                position: 'absolute', bottom: '-2px', right: '-2px',
                                width: '12px', height: '12px', borderRadius: '50%',
                                background: statusColor,
                                border: '2.5px solid var(--sidebar-raised)',
                            }}
                        />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--sidebar-cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {profile.full_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--sidebar-muted)', fontWeight: 600, marginTop: '1px' }}>
                            {profile.role_slug === 'gerant' ? 'Gérant' : profile.role_slug}
                            {networkStatus !== 'online' && <span style={{ color: statusColor }}> · {NETWORK_LABEL[networkStatus]}</span>}
                        </div>
                    </div>
                </button>
                <button onClick={handleLogout} className="sidebar-ghost sidebar-logout">
                    <LogOut size={16} className="logout-icon" />
                    <span>Déconnexion</span>
                </button>
            </div>
        </nav>
    )

    return (
        <>
            {/* Desktop sidebar */}
            <aside style={{
                width: '260px', flexShrink: 0,
                background: 'var(--sidebar-bg)',
                color: 'var(--sidebar-cream)',
                position: 'sticky', top: 0, height: '100dvh', overflow: 'hidden',
                display: 'none',
            }} className="sidebar-desktop sidebar-ganache">
                <PastryMotifs color="var(--sidebar-motif)" />
                <div className="sidebar-scroll" style={{ position: 'relative', height: '100%', overflowY: 'auto', padding: '12px' }}>
                    <SidebarContent />
                </div>
            </aside>

            {/* Mobile Bottom Navigation Bar */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
                background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(12px)',
                borderTop: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                height: '70px', paddingBottom: 'env(safe-area-inset-bottom)'
            }} className="sidebar-mobile-bar">
                <Link href="/dashboard" prefetch={true} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: pathname === '/dashboard' ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                    <LayoutDashboard size={24} strokeWidth={pathname === '/dashboard' ? 2.5 : 2} />
                    <span style={{ fontSize: '0.65rem', fontWeight: pathname === '/dashboard' ? 700 : 500 }}>Dashboard</span>
                </Link>
                {filtered.some(i => i.href === '/caisse') && (
                  <Link href="/caisse" prefetch={true} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: pathname === '/caisse' ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                      <Store size={24} strokeWidth={pathname === '/caisse' ? 2.5 : 2} />
                      <span style={{ fontSize: '0.65rem', fontWeight: pathname === '/caisse' ? 700 : 500 }}>Caisse</span>
                  </Link>
                )}
                {filtered.some(i => i.href === '/commandes') && (
                  <Link href="/commandes" prefetch={true} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', textDecoration: 'none', color: pathname === '/commandes' ? 'var(--color-primary)' : 'var(--color-muted)' }}>
                      <ShoppingBag size={24} strokeWidth={pathname === '/commandes' ? 2.5 : 2} />
                      <span style={{ fontSize: '0.65rem', fontWeight: pathname === '/commandes' ? 700 : 500 }}>Commandes</span>
                  </Link>
                )}
                <button onClick={() => setOpen(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: open ? 'var(--color-primary)' : 'var(--color-muted)', cursor: 'pointer', padding: 0 }}>
                    <Menu size={24} strokeWidth={open ? 2.5 : 2} color={open ? 'var(--color-primary)' : 'var(--color-muted)'} />
                    <span style={{ fontSize: '0.65rem', fontWeight: open ? 700 : 500, color: open ? 'var(--color-primary)' : 'var(--color-muted)' }}>Plus</span>
                </button>
            </div>

            {/* Mobile drawer */}
            {open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
                    <div onClick={() => setOpen(false)}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.4)', backdropFilter: 'blur(4px)' }} />
                    <div className="sidebar-ganache" style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0, width: '260px',
                        background: 'var(--sidebar-bg)', color: 'var(--sidebar-cream)',
                        overflow: 'hidden', animation: 'slideUp 0.25s ease',
                    }}>
                        <PastryMotifs color="var(--sidebar-motif)" />
                        <button onClick={() => setOpen(false)}
                            aria-label="Fermer le menu"
                            className="sidebar-ghost"
                            style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2, width: '44px', height: '44px', minHeight: '44px', padding: 0, justifyContent: 'center' }}>
                            <X size={20} />
                        </button>
                        <div className="sidebar-scroll" style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
                            <SidebarContent />
                        </div>
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
