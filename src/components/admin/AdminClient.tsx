'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
    Building2, Users, AlertTriangle, ChevronRight, X,
    Check, RefreshCw, Calendar, Loader2, KeyRound, ShieldAlert,
    ShieldCheck, Crown, Plus, ChevronDown, LayoutDashboard
} from 'lucide-react'
import {
    updateOrganization,
    updateUserRole,
    suspendOrganization,
    reactivateOrganization,
    resetEmployeePin,
    createOrganizationWithGerant,
    generateKioskCode,
    deleteOrganization
} from '@/lib/actions/admin'
import TouchInput from '@/components/ui/TouchInput'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Org {
    id: string
    name: string
    currency_symbol: string
    kiosk_code: string | null
    subscription_end_date: string | null
    member_count: number
}

interface OrgProfile {
    id: string
    full_name: string
    role_slug: string
    is_active: boolean
    organization_id: string | null
    avatar_url: string | null
    theme_color: string | null
}

interface RoleOption { slug: string; name: string }

interface Props {
    orgs: Org[]
    allProfiles: OrgProfile[]
    roles: RoleOption[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function subscriptionStatus(date: string | null) {
    if (!date) return { label: 'Illimité', color: '#4C9E6A', bg: '#E8F5EE' }
    const d = new Date(date)
    const now = new Date()
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return { label: 'Expiré', color: '#D94F38', bg: '#FEE8E5' }
    if (diff < 7) return { label: `Expire dans ${diff}j`, color: '#D97757', bg: '#FEF3EC' }
    return { label: 'Actif', color: '#4C9E6A', bg: '#E8F5EE' }
}

function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function addMonths(date: string | null, months: number) {
    const base = date ? new Date(date) : new Date()
    if (base < new Date()) base.setTime(new Date().getTime())
    base.setMonth(base.getMonth() + months)
    return base.toISOString().split('T')[0]
}

const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

const ROLE_PRIORITY: Record<string, number> = { super_admin: 0, gerant: 1, vendeur: 2, patissier: 3 }
const ROLE_BADGE: Record<string, { icon: string; color: string; bg: string }> = {
    super_admin: { icon: '🛡️', color: '#9333EA', bg: '#F3E8FF' },
    gerant: { icon: '👔', color: '#D97757', bg: '#FEF3EC' },
    vendeur: { icon: '🛒', color: '#6A9CC4', bg: '#EEF4FA' },
    patissier: { icon: '👨‍🍳', color: '#4C9E6A', bg: '#E8F5EE' },
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminClient({ orgs: initialOrgs, allProfiles, roles }: Props) {
    const [orgs, setOrgs] = useState<Org[]>(initialOrgs)
    const [profiles, setProfiles] = useState<OrgProfile[]>(allProfiles)
    const [selectedOrgId, setSelectedOrgId] = useState<string>('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [tab, setTab] = useState<'info' | 'team' | 'danger'>('info')
    const [isPending, startTransition] = useTransition()
    const [pinResetTarget, setPinResetTarget] = useState<string | null>(null)
    const [newPin, setNewPin] = useState('')
    const [confirmSuspend, setConfirmSuspend] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    // Creation Form State
    const [newOrgForm, setNewOrgForm] = useState({
        org_name: '',
        currency_symbol: 'FCFA',
        subscription_end_date: '',
        gerant_full_name: '',
        gerant_email: '',
        gerant_pin: '',
    })

    // Selected Org Detail State
    const selectedOrg = orgs.find(o => o.id === selectedOrgId)
    const [subForm, setSubForm] = useState({ name: '', currency_symbol: '', subscription_end_date: '' })

    const handleOrgSelect = (id: string) => {
        setSelectedOrgId(id)
        const org = orgs.find(o => o.id === id)
        if (org) {
            setSubForm({
                name: org.name,
                currency_symbol: org.currency_symbol,
                subscription_end_date: org.subscription_end_date ?? ''
            })
        }
        setTab('info')
    }

    // KPIs
    const totalActive = orgs.filter(o => subscriptionStatus(o.subscription_end_date).label !== 'Expiré').length
    const atRisk = orgs.filter(o => subscriptionStatus(o.subscription_end_date).label.startsWith('Expire')).length
    const totalUsers = profiles.length

    const handleCreateOrg = () => {
        if (!newOrgForm.org_name || !newOrgForm.gerant_full_name || !newOrgForm.gerant_email.trim() || newOrgForm.gerant_pin.length !== 4) {
            return toast.error('Veuillez remplir tous les champs (Email valide, PIN 4 chiffres)')
        }
        startTransition(async () => {
            const res = await createOrganizationWithGerant({
                ...newOrgForm,
                gerant_email: newOrgForm.gerant_email.trim(),
                subscription_end_date: newOrgForm.subscription_end_date || null
            })
            if (res.error) { toast.error(res.error); return }
            toast.success('Pâtisserie et Gérant créés avec succès !')
            setIsCreateModalOpen(false)
            setNewOrgForm({
                org_name: '',
                currency_symbol: 'FCFA',
                subscription_end_date: '',
                gerant_full_name: '',
                gerant_email: '',
                gerant_pin: '',
            })
            window.location.reload() // Simple way to refresh all data for now
        })
    }

    const handleSaveSubscription = () => {
        if (!selectedOrg) return
        startTransition(async () => {
            const res = await updateOrganization(selectedOrg.id, {
                name: subForm.name,
                currency_symbol: subForm.currency_symbol,
                subscription_end_date: subForm.subscription_end_date || null,
            })
            if (res.error) { toast.error(res.error); return }
            setOrgs(prev => prev.map(o => o.id === selectedOrg.id ? {
                ...o,
                name: subForm.name,
                currency_symbol: subForm.currency_symbol,
                subscription_end_date: subForm.subscription_end_date || null
            } : o))
            toast.success('Pâtisserie mise à jour ✓')
        })
    }

    const handleGenerateKioskCode = (orgId: string) => {
        startTransition(async () => {
            const res = await generateKioskCode(orgId)
            if (res.error) { toast.error(res.error); return }
            setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, kiosk_code: res.code || null } : o))
            toast.success('Code Boutique généré avec succès 🎉')
        })
    }

    const handleQuickRenew = (months: number) => {
        setSubForm(f => ({ ...f, subscription_end_date: addMonths(f.subscription_end_date, months) }))
    }

    const handleRoleChange = (profileId: string, role_slug: string) => {
        startTransition(async () => {
            const p = profiles.find(p => p.id === profileId)
            const res = await updateUserRole({ userId: profileId, role_slug, is_active: p?.is_active ?? true })
            if (res.error) { toast.error(res.error); return }
            setProfiles(prev => prev.map(pr => pr.id === profileId ? { ...pr, role_slug } : pr))
            toast.success('Rôle mis à jour ✓')
        })
    }

    const handleToggleActive = (profileId: string) => {
        const p = profiles.find(pr => pr.id === profileId)
        if (!p) return
        startTransition(async () => {
            const res = await updateUserRole({ userId: profileId, role_slug: p.role_slug, is_active: !p.is_active })
            if (res.error) { toast.error(res.error); return }
            setProfiles(prev => prev.map(pr => pr.id === profileId ? { ...pr, is_active: !p.is_active } : pr))
            toast.success(p.is_active ? 'Accès désactivé' : 'Accès activé')
        })
    }

    const handleResetPin = (profileId: string) => {
        if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
            return toast.error('PIN doit être 4 chiffres')
        }
        startTransition(async () => {
            const res = await resetEmployeePin(profileId, newPin)
            if (res.error) { toast.error(res.error); return }
            setPinResetTarget(null)
            setNewPin('')
            toast.success('Code PIN réinitialisé ✓')
        })
    }

    const handleSuspendOrg = () => {
        if (!selectedOrg) return
        startTransition(async () => {
            const res = await suspendOrganization(selectedOrg.id)
            if (res.error) { toast.error(res.error); return }
            setProfiles(prev => prev.map(p => p.organization_id === selectedOrg.id ? { ...p, is_active: false } : p))
            setConfirmSuspend(false)
            toast.success('Pâtisserie suspendue')
        })
    }

    const handleReactivateOrg = () => {
        if (!selectedOrg) return
        startTransition(async () => {
            const res = await reactivateOrganization(selectedOrg.id)
            if (res.error) { toast.error(res.error); return }
            setProfiles(prev => prev.map(p => p.organization_id === selectedOrg.id ? { ...p, is_active: true } : p))
            toast.success('Pâtisserie réactivée ✓')
        })
    }

    const handleDeleteOrg = () => {
        if (!selectedOrg) return
        startTransition(async () => {
            const res = await deleteOrganization(selectedOrg.id)
            if (res.error) { toast.error(res.error); return }
            toast.success('Pâtisserie supprimée définitivement.')
            setSelectedOrgId('')
            setOrgs(prev => prev.filter(o => o.id !== selectedOrg.id))
            setConfirmDelete(false)
        })
    }

    const orgTeam = selectedOrg
        ? [...profiles.filter(p => p.organization_id === selectedOrg.id)].sort((a, b) => (ROLE_PRIORITY[a.role_slug] ?? 99) - (ROLE_PRIORITY[b.role_slug] ?? 99))
        : []

    const allSuspended = orgTeam.length > 0 && orgTeam.every(p => !p.is_active)

    return (
        <div style={{ paddingBottom: '100px' }}>
            {/* Header with Stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0, color: '#2D1B0E', letterSpacing: '-0.02em' }}>Super Admin</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.9rem', fontWeight: 500 }}>
                        Gestion des pâtisseries et licences SaaS
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="stat-pill">🏢 {totalActive} Actives</div>
                    <div className="stat-pill" style={{ color: '#D97757', background: '#FEF3EC' }}>⚠️ {atRisk} Alertes</div>
                </div>
            </div>

            {/* Selection Bar */}
            <div style={{
                background: 'white',
                padding: '20px',
                borderRadius: '24px',
                boxShadow: '0 10px 30px rgba(45,27,14,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '32px',
                border: '1px solid rgba(217,119,87,0.1)'
            }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <label style={{ position: 'absolute', top: '-10px', left: '16px', background: 'white', padding: '0 8px', fontSize: '0.7rem', fontWeight: 800, color: '#d97757', textTransform: 'uppercase' }}>
                        Choisir une pâtisserie
                    </label>
                    <div style={{ position: 'relative' }}>
                        <select
                            value={selectedOrgId}
                            onChange={(e) => handleOrgSelect(e.target.value)}
                            className="input"
                            style={{ paddingRight: '40px', appearance: 'none', fontWeight: 600, fontSize: '1rem', border: '2px solid #FEF3EC' }}
                        >
                            <option value="">Sélectionner dans la liste...</option>
                            {orgs.map(o => (
                                <option key={o.id} value={o.id}>{o.name} ({subscriptionStatus(o.subscription_end_date).label})</option>
                            ))}
                        </select>
                        <ChevronDown size={20} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#d97757' }} />
                    </div>
                </div>

                <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary" style={{ padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Plus size={20} />
                    <span style={{ fontWeight: 700 }}>Nouvelle Pâtisserie</span>
                </button>
            </div>

            {/* Main Detail View */}
            {!selectedOrg ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: '#FDFCFB', borderRadius: '32px', border: '2px dashed #EEE' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#FEF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <LayoutDashboard size={40} color="#d97757" />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2D1B0E', margin: '0 0 10px' }}>Aucune organisation sélectionnée</h3>
                    <p style={{ color: 'var(--color-muted)', maxWidth: '400px', margin: '0 auto', fontSize: '0.95rem' }}>
                        Utilisez le menu déroulant ci-dessus pour gérer une pâtisserie existante ou créez-en une nouvelle pour commencer.
                    </p>
                </div>
            ) : (
                <div className="animate-fadeIn">
                    {/* Detail Navigation Tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                        {[
                            { id: 'info', label: 'Configuration & Licence', icon: <Building2 size={18} /> },
                            { id: 'team', label: 'Équipe & Utilisateurs', icon: <Users size={18} /> },
                            { id: 'danger', label: 'Zone de Danger', icon: <ShieldAlert size={18} /> },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id as any)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '12px 20px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                                    fontWeight: 700, fontSize: '0.875rem', transition: 'all 0.2s',
                                    background: tab === t.id ? '#D97757' : 'white',
                                    color: tab === t.id ? 'white' : 'var(--color-muted)',
                                    boxShadow: tab === t.id ? '0 8px 20px rgba(217,119,87,0.3)' : '0 2px 8px rgba(0,0,0,0.05)'
                                }}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ background: 'white', padding: '32px', borderRadius: '32px', boxShadow: '0 10px 40px rgba(45,27,14,0.06)' }}>
                        {/* Tab Content: Info */}
                        {tab === 'info' && (
                            <div style={{ maxWidth: '600px' }}>
                                <div style={{ marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #D97757, #C4836A)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.25rem', fontWeight: 900 }}>
                                        {initials(selectedOrg.name)}
                                    </div>
                                    <div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{selectedOrg.name}</h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                                            <span style={{ fontSize: '0.8rem', background: subscriptionStatus(selectedOrg.subscription_end_date).bg, color: subscriptionStatus(selectedOrg.subscription_end_date).color, padding: '4px 12px', borderRadius: '20px', fontWeight: 700 }}>
                                                {subscriptionStatus(selectedOrg.subscription_end_date).label.toUpperCase()}
                                            </span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', fontWeight: 600 }}>ID: {selectedOrg.id.slice(0, 8)}...</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gap: '24px' }}>
                                    <Field label="Nom de l'enseigne">
                                        <input className="input" value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} />
                                    </Field>
                                    <Field label="Symbole Monétaire">
                                        <input className="input" value={subForm.currency_symbol} onChange={e => setSubForm(f => ({ ...f, currency_symbol: e.target.value }))} maxLength={10} />
                                    </Field>
                                    <Field label="Expiration de la Licence">
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <input type="date" className="input" value={subForm.subscription_end_date} onChange={e => setSubForm(f => ({ ...f, subscription_end_date: e.target.value }))} />
                                            {subForm.subscription_end_date && <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4C9E6A' }}>{formatDate(subForm.subscription_end_date)}</span>}
                                        </div>
                                    </Field>

                                    <Field label="Code Boutique (Accès Kiosque)">
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <div style={{
                                                flex: 1, height: '44px', background: '#FDFCFB', border: '1.5px solid #EAEAEA',
                                                borderRadius: '12px', display: 'flex', alignItems: 'center', padding: '0 14px',
                                                fontSize: '1.1rem', fontWeight: 800, color: selectedOrg.kiosk_code ? '#D97757' : 'var(--color-muted)',
                                                letterSpacing: '0.1em'
                                            }}>
                                                {selectedOrg.kiosk_code || 'NON DÉFINI'}
                                            </div>
                                            <button 
                                                onClick={() => handleGenerateKioskCode(selectedOrg.id)}
                                                disabled={isPending}
                                                className="btn-secondary"
                                            >
                                                <RefreshCw size={16} /> Regénérer
                                            </button>
                                        </div>
                                    </Field>

                                    <div style={{ background: '#FDFCFB', padding: '20px', borderRadius: '20px', border: '1px solid #FEF3EC' }}>
                                        <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d97757', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prolonger l&apos;abonnement</p>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {[{ l: '+1 Mois', m: 1 }, { l: '+3 Mois', m: 3 }, { l: '+6 Mois', m: 6 }, { l: '+1 An', m: 12 }].map(b => (
                                                <button key={b.m} onClick={() => handleQuickRenew(b.m)} className="btn-ghost" style={{ background: 'white', fontSize: '0.8rem', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <RefreshCw size={14} /> {b.l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button onClick={handleSaveSubscription} disabled={isPending} className="btn-primary" style={{ padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '1rem' }}>
                                        {isPending ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
                                        Mettre à jour la base de données
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Tab Content: Team */}
                        {tab === 'team' && (
                            <div>
                                <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Membres de la pâtisserie</h3>
                                    <div style={{ background: '#FEF3EC', color: '#d97757', padding: '6px 16px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700 }}>
                                        {orgTeam.length} utilisateurs enregistrés
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                    {orgTeam.map(p => {
                                        const badge = ROLE_BADGE[p.role_slug] ?? ROLE_BADGE.vendeur
                                        const isGerant = p.role_slug === 'gerant' || p.role_slug === 'super_admin'
                                        return (
                                            <div key={p.id} style={{
                                                padding: '20px', borderRadius: '24px',
                                                border: isGerant ? `2px solid ${badge.color}40` : '1.5px solid #EEE',
                                                background: p.is_active ? (isGerant ? badge.bg : 'white') : '#f5f5f5',
                                                opacity: p.is_active ? 1 : 0.6
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                                    <div style={{
                                                        width: '50px', height: '50px', borderRadius: '18px', background: p.theme_color ?? '#E8B4A0',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 800, color: 'white', position: 'relative'
                                                    }}>
                                                        {initials(p.full_name)}
                                                        {isGerant && <Crown size={12} style={{ position: 'absolute', top: '-6px', right: '-6px', padding: '4px', background: badge.color, borderRadius: '50%', color: 'white' }} />}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>{p.full_name}</p>
                                                        <select value={p.role_slug} onChange={e => handleRoleChange(p.id, e.target.value)} disabled={isPending}
                                                            style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '0.8rem', color: badge.color, fontWeight: 700, cursor: 'pointer' }}>
                                                            {roles.map(r => <option key={r.slug} value={r.slug}>{r.name.toUpperCase()}</option>)}
                                                        </select>
                                                    </div>
                                                    <button onClick={() => handleToggleActive(p.id)} style={{ width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: p.is_active ? '#4C9E6A' : '#CCC', position: 'relative' }}>
                                                        <span style={{ position: 'absolute', top: '3px', left: p.is_active ? '25px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                                                    </button>
                                                </div>

                                                <button onClick={() => { setPinResetTarget(pinResetTarget === p.id ? null : p.id); setNewPin('') }} className="btn-ghost" style={{ width: '100%', fontSize: '0.8rem', fontWeight: 700, gap: '8px' }}>
                                                    <KeyRound size={14} /> Réinitialiser le code PIN
                                                </button>

                                                {pinResetTarget === p.id && (
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <TouchInput
                                                            value={newPin}
                                                            onChange={setNewPin}
                                                            maxLength={4}
                                                            placeholder="PIN (4 chif.)"
                                                            title="Réinitialiser le PIN"
                                                            style={{ fontSize: '0.85rem', flex: 1 }}
                                                        />
                                                        <button onClick={() => handleResetPin(p.id)} disabled={isPending || newPin.length !== 4} className="btn-primary" style={{ padding: '0 16px' }}>OK</button>
                                                        <button onClick={() => setPinResetTarget(null)} className="btn-ghost" style={{ padding: '0 10px' }}><X size={16} /></button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Tab Content: Danger */}
                        {tab === 'danger' && (
                            <div style={{ maxWidth: '600px' }}>
                                <div style={{ padding: '24px', borderRadius: '24px', border: '2px solid #D94F3840', background: '#FEF7F5' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.25rem', fontWeight: 800, color: '#D94F38', margin: '0 0 12px' }}>
                                        <ShieldAlert size={24} /> Suspension de Licence
                                    </h3>
                                    <p style={{ fontSize: '0.95rem', color: '#2D1B0E', opacity: 0.8, lineHeight: 1.6, marginBottom: '24px' }}>
                                        La suspension de <strong>{selectedOrg.name}</strong> coupera immédiatement l&apos;accès à tous les membres de cette pâtisserie. Les données (ventes, stocks, profils) resteront intactes mais inaccessibles.
                                    </p>

                                    {allSuspended ? (
                                        <button onClick={handleReactivateOrg} disabled={isPending} className="btn-primary" style={{ background: '#4C9E6A', padding: '0 24px', height: '52px', fontWeight: 800, gap: '10px' }}>
                                            <ShieldCheck size={20} /> Réactiver tous les accès (Remise en service)
                                        </button>
                                    ) : !confirmSuspend ? (
                                        <button onClick={() => setConfirmSuspend(true)} className="btn-ghost" style={{ color: '#D94F38', border: '2px solid #D94F3840', fontWeight: 800, padding: '0 24px', height: '52px', gap: '10px' }}>
                                            <ShieldAlert size={20} /> Suspendre les activités de {selectedOrg.name}
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <p style={{ fontWeight: 800, color: '#D94F38', fontSize: '1rem' }}>⚠️ Confirmez-vous la suspension immédiate ?</p>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button onClick={() => setConfirmSuspend(false)} className="btn-ghost" style={{ flex: 1 }}>Annuler</button>
                                                <button onClick={handleSuspendOrg} disabled={isPending} className="btn-primary" style={{ flex: 2, background: '#D94F38', color: 'white', fontWeight: 800 }}>
                                                    {isPending ? <Loader2 size={18} className="animate-spin" /> : 'OUI, SUSPENDRE MAINTENANT'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginTop: '32px', padding: '24px', borderRadius: '24px', border: '2px solid #D94F3840', background: 'white' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.25rem', fontWeight: 800, color: '#D94F38', margin: '0 0 12px' }}>
                                        <ShieldAlert size={24} /> Suppression Définitive
                                    </h3>
                                    <p style={{ fontSize: '0.95rem', color: '#2D1B0E', opacity: 0.8, lineHeight: 1.6, marginBottom: '24px' }}>
                                        Cette action est <strong>IRRÉVERSIBLE</strong>. Elle supprimera l&apos;organisation <strong>{selectedOrg.name}</strong>, tous ses profils utilisateurs, ses ventes, ses produits et ses stocks.
                                    </p>

                                    {!confirmDelete ? (
                                        <button onClick={() => setConfirmDelete(true)} className="btn-ghost" style={{ width: '100%', color: '#D94F38', border: '2px solid #D94F3840', fontWeight: 800, height: '52px' }}>
                                            SUPPRIMER DÉFINITIVEMENT CETTE PÂTISSERIE
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <p style={{ fontWeight: 800, color: '#D94F38', textAlign: 'center' }}>⚠️ Êtes-vous ABSOLUMENT sûr ? Cette action ne peut pas être annulée.</p>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button onClick={() => setConfirmDelete(false)} className="btn-ghost" style={{ flex: 1 }}>Annuler</button>
                                                <button onClick={handleDeleteOrg} disabled={isPending} className="btn-primary" style={{ flex: 2, background: '#D94F38', color: 'white', fontWeight: 800 }}>
                                                    {isPending ? <Loader2 size={18} className="animate-spin" /> : 'CONFIRMER LA SUPPRESSION'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div style={{ height: '100px' }} /> {/* Extra scroll room */}
                    </div>
                </div>
            )}

            {/* ─── Create Organization Modal ─────────────────────────────────── */}
            {isCreateModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="modal-content animate-scaleIn" onClick={e => e.stopPropagation()} 
                         style={{ maxWidth: '600px', padding: 0, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        
                        <div style={{ padding: '32px', borderBottom: '1px solid #EEE' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: '#2D1B0E' }}>Nouvelle Pâtisserie</h2>
                                <button onClick={() => setIsCreateModalOpen(false)} className="btn-ghost" style={{ padding: '8px' }}><X size={24} /></button>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--color-muted)', margin: 0 }}>L&apos;organisation et son premier Gérant seront créés simultanément.</p>
                        </div>

                        <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 900, color: '#d97757', textTransform: 'uppercase', marginBottom: '12px' }}>1. Informations Pâtisserie</p>
                                </div>
                                <Field label="Nom de l'enseigne">
                                    <input className="input" placeholder="ex: Boulangerie Moderne" value={newOrgForm.org_name} onChange={e => setNewOrgForm(f => ({ ...f, org_name: e.target.value }))} />
                                </Field>
                                <Field label="Devise">
                                    <input className="input" value={newOrgForm.currency_symbol} onChange={e => setNewOrgForm(f => ({ ...f, currency_symbol: e.target.value }))} />
                                </Field>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <Field label="Fin d'abonnement (Optionnel)">
                                        <input type="date" className="input" value={newOrgForm.subscription_end_date} onChange={e => setNewOrgForm(f => ({ ...f, subscription_end_date: e.target.value }))} />
                                    </Field>
                                </div>

                                <div style={{ gridColumn: 'span 2', marginTop: '10px' }}>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 900, color: '#d97757', textTransform: 'uppercase', marginBottom: '12px' }}>2. Compte Gérant</p>
                                </div>
                                <Field label="Nom Complet du Gérant">
                                    <input className="input" placeholder="Prénom Nom" value={newOrgForm.gerant_full_name} onChange={e => setNewOrgForm(f => ({ ...f, gerant_full_name: e.target.value }))} />
                                </Field>
                                <Field label="Email de Connexion">
                                    <input className="input" type="email" placeholder="gerant@patisserie.com" value={newOrgForm.gerant_email} onChange={e => setNewOrgForm(f => ({ ...f, gerant_email: e.target.value }))} />
                                </Field>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <Field label="Code PIN (4 chiffres)">
                                        <TouchInput
                                            value={newOrgForm.gerant_pin}
                                            onChange={val => setNewOrgForm(f => ({ ...f, gerant_pin: val }))}
                                            maxLength={4}
                                            placeholder="ex: 1234"
                                            title="Définir le PIN Gérant"
                                        />
                                    </Field>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '32px', background: '#FDFCFB', borderTop: '1px solid #EEE', display: 'flex', gap: '16px' }}>
                            <button onClick={() => setIsCreateModalOpen(false)} className="btn-ghost" style={{ flex: 1, padding: '16px', fontWeight: 700 }}>Annuler</button>
                            <button onClick={handleCreateOrg} disabled={isPending} className="btn-primary" style={{ flex: 2, padding: '16px', fontWeight: 800, fontSize: '1rem', gap: '10px' }}>
                                {isPending ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
                                CRÉER LA PÂTISSERIE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .stat-pill {
                    padding: 8px 16px;
                    border-radius: 14px;
                    background: #EEF4FA;
                    color: #6A9CC4;
                    font-size: 0.85rem;
                    font-weight: 800;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.03);
                }
                .animate-fadeIn {
                    animation: fadeIn 0.3s ease-out;
                }
                .animate-scaleIn {
                    animation: scaleIn 0.3s cubic-bezier(.22, .68, 0, 1.2);
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
            {children}
        </div>
    )
}
