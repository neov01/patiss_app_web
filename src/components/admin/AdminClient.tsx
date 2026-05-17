'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import {
    Building2, Users, AlertTriangle, ChevronRight, X,
    Check, RefreshCw, Calendar, Loader2, KeyRound, ShieldAlert,
    ShieldCheck, Crown, Plus, ChevronDown, LayoutDashboard, ArrowLeft,
    Download, Filter, BarChart2, Mail, TrendingUp, Clock, CheckSquare,
    Square
} from 'lucide-react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import {
    updateOrganization,
    updateUserRole,
    suspendOrganization,
    reactivateOrganization,
    resetEmployeePin,
    createOrganizationWithGerant,
    generateKioskCode,
    deleteOrganization,
    impersonateUser,
    createClientUser
} from '@/lib/actions/admin'

import TouchInput from '@/components/ui/TouchInput'
import DatePicker from '@/components/ui/DatePicker'
import TouchSelect from '@/components/ui/TouchSelect'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Org {
    id: string
    name: string
    currency_symbol: string
    kiosk_code: string | null
    subscription_end_date: string | null
    member_count: number
    tier: string
    max_users: number
    contact_email: string | null
    contact_phone: string | null
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

const CURRENCY_OPTIONS = [
    { value: 'FCFA', label: 'Franc CFA (FCFA)', icon: '🌍' },
    { value: '€', label: 'Euro (€)', icon: '🇪🇺' },
    { value: '$', label: 'Dollar US ($)', icon: '🇺🇸' },
    { value: '£', label: 'Livre Sterling (£)', icon: '🇬🇧' },
    { value: 'GNF', label: 'Franc Guinéen (GNF)', icon: '🇬🇳' },
    { value: 'GHS', label: 'Cedi Ghanéen (GHS)', icon: '🇬🇭' }
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminClient({ orgs: initialOrgs, allProfiles, roles }: Props) {
    const [orgs, setOrgs] = useState<Org[]>(initialOrgs)
    const [profiles, setProfiles] = useState<OrgProfile[]>(allProfiles)
    const [selectedOrgId, setSelectedOrgId] = useState<string>('')
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [tab, setTab] = useState<'info' | 'team' | 'support' | 'danger'>('info')
    const [isPending, startTransition] = useTransition()
    const [pinResetTarget, setPinResetTarget] = useState<string | null>(null)
    const [newPin, setNewPin] = useState('')
    const [confirmSuspend, setConfirmSuspend] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    // B — Filtres + tri
    const [filterStatus, setFilterStatus] = useState<'all' | 'actif' | 'expire' | 'risk'>('all')
    const [filterTier, setFilterTier] = useState<string>('all')
    const [sortBy, setSortBy] = useState<'name' | 'expiration' | 'usage'>('name')
    const [showFilters, setShowFilters] = useState(false)

    // D — Vue analytique
    const [viewMode, setViewMode] = useState<'list' | 'analytics'>('list')

    // G — Sélection en masse
    const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set())
    const [isBulkRenewing, setIsBulkRenewing] = useState(false)

    // E — Activité réelle (Support tab)
    const [realActivity, setRealActivity] = useState<Array<{ type: string; msg: string; date: string }>>([])
    const [loadingActivity, setLoadingActivity] = useState(false)


    // Creation Form State
    const [newOrgForm, setNewOrgForm] = useState({
        org_name: '',
        currency_symbol: '',
        subscription_end_date: '',
        gerant_full_name: '',
        gerant_email: '',
        gerant_pin: '',
    })

    const [newUserForm, setNewUserForm] = useState({
        full_name: '',
        role_slug: 'vendeur',
        pin_code: '',
        email: ''
    })
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)


    // Selected Org Detail State
    const selectedOrg = orgs.find(o => o.id === selectedOrgId)
    const [subForm, setSubForm] = useState({ 
        name: '', 
        currency_symbol: '', 
        subscription_end_date: '',
        tier: 'Basic',
        max_users: 5,
        contact_email: '',
        contact_phone: ''
    })

    const [impersonationLoading, setImpersonationLoading] = useState(false)
    const [resetPinResult, setResetPinResult] = useState<{ pin: string; name: string } | null>(null)


    const handleOrgSelect = (id: string) => {
        setSelectedOrgId(id)
        const org = orgs.find(o => o.id === id)
        if (org) {
            setSubForm({
                name: org.name,
                currency_symbol: org.currency_symbol,
                subscription_end_date: org.subscription_end_date ?? '',
                tier: org.tier || 'Basic',
                max_users: org.max_users || 5,
                contact_email: org.contact_email ?? '',
                contact_phone: org.contact_phone ?? ''
            })
        }
        setTab('info')
    }


    // A — KPIs enrichis
    const totalActive = orgs.filter(o => {
        const s = subscriptionStatus(o.subscription_end_date).label
        return s !== 'Expiré'
    }).length
    const atRisk = orgs.filter(o => subscriptionStatus(o.subscription_end_date).label.startsWith('Expire')).length
    const totalUsers = profiles.length
    const expiringSoon30 = orgs.filter(o => {
        if (!o.subscription_end_date) return false
        const diff = Math.ceil((new Date(o.subscription_end_date).getTime() - Date.now()) / 86400000)
        return diff >= 0 && diff <= 30
    }).length
    const avgUsagePct = orgs.length > 0
        ? Math.round(orgs.reduce((acc, o) => acc + (o.member_count / (o.max_users || 1)), 0) / orgs.length * 100)
        : 0

    // B — filteredOrgs (filtre + tri)
    const filteredOrgs = useMemo(() => {
        const result = orgs.filter(o => {
            const matchSearch = o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (o.contact_email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
            const s = subscriptionStatus(o.subscription_end_date).label
            let matchStatus = true
            if (filterStatus === 'actif') matchStatus = s === 'Actif' || s === 'Illimité'
            else if (filterStatus === 'expire') matchStatus = s === 'Expiré'
            else if (filterStatus === 'risk') matchStatus = s.startsWith('Expire')
            const matchTier = filterTier === 'all' || (o.tier || 'Basic') === filterTier
            return matchSearch && matchStatus && matchTier
        })
        result.sort((a, b) => {
            if (sortBy === 'expiration') {
                if (!a.subscription_end_date && !b.subscription_end_date) return 0
                if (!a.subscription_end_date) return -1
                if (!b.subscription_end_date) return 1
                return new Date(a.subscription_end_date).getTime() - new Date(b.subscription_end_date).getTime()
            }
            if (sortBy === 'usage') {
                return (b.member_count / (b.max_users || 1)) - (a.member_count / (a.max_users || 1))
            }
            return a.name.localeCompare(b.name)
        })
        return result
    }, [orgs, searchQuery, filterStatus, filterTier, sortBy])

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
                tier: subForm.tier,
                max_users: subForm.max_users,
                contact_email: subForm.contact_email || null,
                contact_phone: subForm.contact_phone || null
            })
            if (res.error) { toast.error(res.error); return }
            setOrgs(prev => prev.map(o => o.id === selectedOrg.id ? {
                ...o,
                name: subForm.name,
                currency_symbol: subForm.currency_symbol,
                subscription_end_date: subForm.subscription_end_date || null,
                tier: subForm.tier,
                max_users: subForm.max_users,
                contact_email: subForm.contact_email || null,
                contact_phone: subForm.contact_phone || null
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
            const res = await resetEmployeePin(profileId, newPin || undefined)
            if (res.error) { toast.error(res.error); return }
            setPinResetTarget(null)
            setNewPin('')
            
            const p = profiles.find(pr => pr.id === profileId)
            setResetPinResult({ pin: res.newPin!, name: p?.full_name || 'utilisateur' })
            toast.success('Code PIN réinitialisé ✓')
        })
    }

    const handleImpersonate = async () => {
        if (!selectedOrg) return
        setImpersonationLoading(true)
        try {
            const res = await impersonateUser(selectedOrg.id)
            if (res.error) { toast.error(res.error); return }
            toast.success(`Session générée pour ${res.targetName}. Ouverture...`)
            window.open(res.link, '_blank')
        } catch (err) {
            toast.error("Erreur lors de l'impersonation")
        } finally {
            setImpersonationLoading(false)
        }
    }

    const handleAddUser = () => {
        if (!selectedOrg || !newUserForm.full_name || newUserForm.pin_code.length !== 4) {
            return toast.error('Veuillez remplir le nom et un PIN de 4 chiffres')
        }
        startTransition(async () => {
            const res = await createClientUser({
                ...newUserForm,
                organization_id: selectedOrg.id
            })
            if (res.error) { toast.error(res.error); return }
            toast.success('Utilisateur créé avec succès !')
            setIsAddUserModalOpen(false)
            setNewUserForm({ full_name: '', role_slug: 'vendeur', pin_code: '', email: '' })
            window.location.reload()
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

    // F — Export CSV
    const handleExportCSV = () => {
        const headers = ['Nom', 'Email Contact', 'Tier', 'Statut', 'Membres', 'Max', 'Expiration']
        const rows = filteredOrgs.map(o => [
            `"${o.name}"`,
            o.contact_email || '',
            o.tier || 'Basic',
            subscriptionStatus(o.subscription_end_date).label,
            o.member_count,
            o.max_users || 5,
            formatDate(o.subscription_end_date),
        ])
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
        const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
        const a = document.createElement('a')
        a.href = url; a.download = `patisseries_${new Date().toISOString().split('T')[0]}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    // G — Renouvellement en masse
    const toggleSelectOrg = (id: string) => {
        setSelectedOrgIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }
    const toggleSelectAll = () => {
        if (selectedOrgIds.size === filteredOrgs.length) {
            setSelectedOrgIds(new Set())
        } else {
            setSelectedOrgIds(new Set(filteredOrgs.map(o => o.id)))
        }
    }
    const handleBulkRenew = async (months: number) => {
        if (selectedOrgIds.size === 0) return
        setIsBulkRenewing(true)
        for (const orgId of Array.from(selectedOrgIds)) {
            const org = orgs.find(o => o.id === orgId)
            if (!org) continue
            const newDate = addMonths(org.subscription_end_date, months)
            await updateOrganization(orgId, {
                name: org.name,
                currency_symbol: org.currency_symbol,
                subscription_end_date: newDate,
                tier: org.tier || 'Basic',
                max_users: org.max_users || 5,
                contact_email: org.contact_email || null,
                contact_phone: org.contact_phone || null,
            })
            setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, subscription_end_date: newDate } : o))
        }
        setIsBulkRenewing(false)
        setSelectedOrgIds(new Set())
        toast.success(`${selectedOrgIds.size} pâtisseries renouvelées (+${months} mois) ✓`)
    }

    // H — Email de rappel
    const handleSendReminder = (org: Org) => {
        if (!org.contact_email) { toast.error('Aucun email de contact défini'); return }
        const days = org.subscription_end_date
            ? Math.ceil((new Date(org.subscription_end_date).getTime() - Date.now()) / 86400000)
            : null
        const subject = encodeURIComponent(`Rappel : Votre abonnement Pâtiss'App expire bientôt`)
        const body = encodeURIComponent(
            `Bonjour,\n\nNous vous contactons pour vous rappeler que votre abonnement Pâtiss'App pour « ${org.name} » ${days !== null ? `expire dans ${days} jour(s) (${formatDate(org.subscription_end_date)})` : 'arrive à échéance prochainement'}.\n\nPour renouveler votre licence et continuer à bénéficier de tous vos outils, contactez-nous dès maintenant.\n\nCordialement,\nL'équipe Pâtiss'App`
        )
        window.open(`mailto:${org.contact_email}?subject=${subject}&body=${body}`, '_blank')
    }

    // E — Charger l'activité réelle (Support tab)
    useEffect(() => {
        if (tab !== 'support' || !selectedOrg) return
        setLoadingActivity(true)
        const supabase = createSupabaseClient()
        Promise.all([
            supabase.from('orders').select('id, order_number, created_at').eq('organization_id', selectedOrg.id).order('created_at', { ascending: false }).limit(3),
            supabase.from('transactions').select('id, amount, created_at').eq('organization_id', selectedOrg.id).order('created_at', { ascending: false }).limit(3),
        ]).then(([ordersRes, txRes]) => {
            const items: Array<{ type: string; msg: string; date: string; ts: number }> = []
            for (const o of ordersRes.data ?? []) {
                items.push({ type: 'Order', msg: `Commande ${o.order_number || '#' + o.id.slice(0, 6)}`, date: o.created_at!, ts: new Date(o.created_at!).getTime() })
            }
            for (const t of txRes.data ?? []) {
                items.push({ type: 'Vente', msg: `Encaissement ${Number(t.amount).toLocaleString('fr-FR')} FCFA`, date: t.created_at!, ts: new Date(t.created_at!).getTime() })
            }
            items.sort((a, b) => b.ts - a.ts)
            setRealActivity(items.slice(0, 6).map(i => ({
                type: i.type,
                msg: i.msg,
                date: new Date(i.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            })))
        }).finally(() => setLoadingActivity(false))
    }, [tab, selectedOrg?.id])

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
        <div style={{ paddingBottom: '64px' }}>
            {/* A — Header avec KPIs enrichis */}
            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0, color: '#2D1B0E', letterSpacing: '-0.02em' }}>Super Admin</h1>
                        <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.9rem', fontWeight: 500 }}>Gestion des pâtisseries et licences SaaS</p>
                    </div>
                    <button onClick={() => setViewMode(v => v === 'list' ? 'analytics' : 'list')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '14px', border: '1.5px solid var(--color-border)', background: viewMode === 'analytics' ? '#FEF3EC' : 'white', color: viewMode === 'analytics' ? '#D97757' : 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}>
                        <BarChart2 size={16} /> {viewMode === 'analytics' ? 'Vue liste' : 'Analytique'}
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                    {[
                        { icon: '🏢', label: 'Actives', value: totalActive, color: '#4C9E6A', bg: '#E8F5EE' },
                        { icon: '⚠️', label: 'Expire < 7j', value: atRisk, color: '#D97757', bg: '#FEF3EC' },
                        { icon: '📅', label: 'Expire < 30j', value: expiringSoon30, color: '#C08A63', bg: '#FDF5EC' },
                        { icon: '👥', label: 'Utilisateurs', value: totalUsers, color: '#6A9CC4', bg: '#EEF4FA' },
                        { icon: '📊', label: 'Usage moyen', value: `${avgUsagePct}%`, color: '#815431', bg: '#F5EEE4' },
                    ].map(k => (
                        <div key={k.label} style={{ background: k.bg, borderRadius: '16px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.2rem' }}>{k.icon}</span>
                            <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: k.color }}>{k.value}</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: k.color, opacity: 0.7, textTransform: 'uppercase' }}>{k.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* B — Barre de recherche + filtres */}
            <div style={{ background: 'white', padding: '16px 20px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(45,27,14,0.05)', marginBottom: '24px', border: '1px solid rgba(217,119,87,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input type="text" placeholder="Rechercher une pâtisserie (nom, contact...)"
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="input" style={{ paddingLeft: '44px', height: '48px', border: '2px solid #FEF3EC', fontWeight: 600 }} />
                        <LayoutDashboard size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#d97757' }} />
                    </div>
                    <button onClick={() => setShowFilters(v => !v)}
                        style={{ height: '48px', padding: '0 16px', borderRadius: '14px', border: `1.5px solid ${showFilters ? '#D97757' : 'var(--color-border)'}`, background: showFilters ? '#FEF3EC' : 'white', color: showFilters ? '#D97757' : 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
                        <Filter size={15} /> Filtres
                    </button>
                    <button onClick={handleExportCSV}
                        style={{ height: '48px', padding: '0 16px', borderRadius: '14px', border: '1.5px solid var(--color-border)', background: 'white', color: 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem' }}>
                        <Download size={15} /> CSV
                    </button>
                    <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary" style={{ padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} /> Nouvelle Pâtisserie
                    </button>
                </div>

                {showFilters && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Statut :</span>
                        {(['all', 'actif', 'risk', 'expire'] as const).map(s => (
                            <button key={s} onClick={() => setFilterStatus(s)}
                                style={{ padding: '4px 12px', borderRadius: '99px', border: '1.5px solid', borderColor: filterStatus === s ? '#D97757' : 'var(--color-border)', background: filterStatus === s ? '#FEF3EC' : 'white', color: filterStatus === s ? '#D97757' : 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                                {s === 'all' ? 'Tous' : s === 'actif' ? 'Actif' : s === 'risk' ? '⚠️ À risque' : 'Expiré'}
                            </button>
                        ))}
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', marginLeft: '8px' }}>Plan :</span>
                        {(['all', 'Basic', 'Premium', 'Premium + IA'] as const).map(t => (
                            <button key={t} onClick={() => setFilterTier(t)}
                                style={{ padding: '4px 12px', borderRadius: '99px', border: '1.5px solid', borderColor: filterTier === t ? '#6A9CC4' : 'var(--color-border)', background: filterTier === t ? '#EEF4FA' : 'white', color: filterTier === t ? '#6A9CC4' : 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                                {t === 'all' ? 'Tous' : t}
                            </button>
                        ))}
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', marginLeft: '8px' }}>Trier par :</span>
                        {([['name', 'Nom'], ['expiration', 'Expiration'], ['usage', 'Usage']] as const).map(([val, lbl]) => (
                            <button key={val} onClick={() => setSortBy(val)}
                                style={{ padding: '4px 12px', borderRadius: '99px', border: '1.5px solid', borderColor: sortBy === val ? '#815431' : 'var(--color-border)', background: sortBy === val ? '#F5EEE4' : 'white', color: sortBy === val ? '#815431' : 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>
                                {lbl}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            {!selectedOrg ? (
                <div className="animate-fadeIn">
                    {/* D — Vue analytique */}
                    {viewMode === 'analytics' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {/* Répartition par tier */}
                            <div style={{ background: 'white', borderRadius: '20px', padding: '24px', border: '1px solid #EEE' }}>
                                <h4 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: '0.95rem' }}>Répartition par Plan</h4>
                                {['Basic', 'Premium', 'Premium + IA'].map(tier => {
                                    const count = orgs.filter(o => (o.tier || 'Basic') === tier).length
                                    const pct = orgs.length > 0 ? Math.round(count / orgs.length * 100) : 0
                                    const colors: Record<string, string> = { 'Basic': '#6A9CC4', 'Premium': '#D97757', 'Premium + IA': '#4C9E6A' }
                                    return (
                                        <div key={tier} style={{ marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{tier}</span>
                                                <span style={{ fontSize: '0.82rem', color: 'var(--color-muted)', fontWeight: 600 }}>{count} org · {pct}%</span>
                                            </div>
                                            <div style={{ height: '8px', background: '#F5F5F5', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: colors[tier], borderRadius: '4px', transition: 'width 0.5s' }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {/* Expirations par mois (prochains 6 mois) */}
                            <div style={{ background: 'white', borderRadius: '20px', padding: '24px', border: '1px solid #EEE' }}>
                                <h4 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: '0.95rem' }}>Expirations à venir (6 mois)</h4>
                                {Array.from({ length: 6 }, (_, i) => {
                                    const d = new Date(); d.setMonth(d.getMonth() + i)
                                    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                                    const count = orgs.filter(o => o.subscription_end_date?.startsWith(ym)).length
                                    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
                                    const maxCount = Math.max(...Array.from({ length: 6 }, (_, j) => {
                                        const dd = new Date(); dd.setMonth(dd.getMonth() + j)
                                        const yym = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`
                                        return orgs.filter(o => o.subscription_end_date?.startsWith(yym)).length
                                    }), 1)
                                    return (
                                        <div key={ym} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', width: '42px', textAlign: 'right' }}>{label}</span>
                                            <div style={{ flex: 1, height: '20px', background: '#F5F5F5', borderRadius: '6px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: count > 2 ? '#D94F38' : '#D97757', borderRadius: '6px', transition: 'width 0.5s', display: 'flex', alignItems: 'center', paddingLeft: count > 0 ? '6px' : 0 }}>
                                                    {count > 0 && <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'white' }}>{count}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {/* Stats usage */}
                            <div style={{ background: 'white', borderRadius: '20px', padding: '24px', border: '1px solid #EEE' }}>
                                <h4 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: '0.95rem' }}>Taux d'occupation des licences</h4>
                                {orgs.slice(0, 8).map(o => {
                                    const pct = Math.round((o.member_count / (o.max_users || 1)) * 100)
                                    const color = pct >= 90 ? '#D94F38' : pct >= 60 ? '#D97757' : '#4C9E6A'
                                    return (
                                        <div key={o.id} style={{ marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{o.member_count}/{o.max_users || 5}</span>
                                            </div>
                                            <div style={{ height: '6px', background: '#F5F5F5', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: '3px' }} />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {/* Résumé statut */}
                            <div style={{ background: 'white', borderRadius: '20px', padding: '24px', border: '1px solid #EEE' }}>
                                <h4 style={{ margin: '0 0 16px', fontWeight: 800, fontSize: '0.95rem' }}>Résumé des Statuts</h4>
                                {[
                                    { label: 'Actives', count: orgs.filter(o => subscriptionStatus(o.subscription_end_date).label === 'Actif').length, color: '#4C9E6A' },
                                    { label: 'Illimitées', count: orgs.filter(o => !o.subscription_end_date).length, color: '#6A9CC4' },
                                    { label: 'À risque (< 7j)', count: atRisk, color: '#D97757' },
                                    { label: 'Expirées', count: orgs.filter(o => subscriptionStatus(o.subscription_end_date).label === 'Expiré').length, color: '#D94F38' },
                                ].map(s => (
                                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
                                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{s.label}</span>
                                        <span style={{ fontSize: '1rem', fontWeight: 900, color: s.color }}>{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                    <>
                    {/* C — Header liste + sélection en masse */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                            Toutes les Pâtisseries
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-muted)', marginLeft: '10px' }}>{filteredOrgs.length} / {orgs.length}</span>
                        </h3>
                        {/* G — Actions en masse */}
                        {selectedOrgIds.size > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEF3EC', padding: '8px 14px', borderRadius: '14px' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#D97757' }}>{selectedOrgIds.size} sélectionnée{selectedOrgIds.size > 1 ? 's' : ''}</span>
                                {[1, 3, 6, 12].map(m => (
                                    <button key={m} onClick={() => handleBulkRenew(m)} disabled={isBulkRenewing}
                                        style={{ padding: '5px 12px', borderRadius: '10px', border: 'none', background: '#D97757', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}>
                                        {isBulkRenewing ? '…' : `+${m}M`}
                                    </button>
                                ))}
                                <button onClick={() => setSelectedOrgIds(new Set())}
                                    style={{ padding: '4px 8px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#D97757', cursor: 'pointer' }}>
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div style={{ background: 'white', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', overflow: 'hidden', border: '1px solid #EEE' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#FDFCFB', borderBottom: '1px solid #EEE' }}>
                                    <th style={{ padding: '14px 16px', width: '40px' }}>
                                        <button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97757', display: 'flex' }}>
                                            {selectedOrgIds.size === filteredOrgs.length && filteredOrgs.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </button>
                                    </th>
                                    {['Pâtisserie', 'Statut / Plan', 'Usage', 'Expiration', ''].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '14px 16px', fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredOrgs.map(o => {
                                    const status = subscriptionStatus(o.subscription_end_date)
                                    const daysLeft = o.subscription_end_date
                                        ? Math.ceil((new Date(o.subscription_end_date).getTime() - Date.now()) / 86400000)
                                        : null
                                    const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30
                                    const isSelected = selectedOrgIds.has(o.id)
                                    return (
                                        <tr key={o.id}
                                            style={{ borderBottom: '1px solid #F5F5F5', transition: 'background 0.15s', background: isSelected ? '#FEF3EC' : isExpiringSoon ? '#FFFBF5' : 'white' }}
                                            className="table-row-hover">
                                            <td style={{ padding: '14px 16px' }} onClick={e => { e.stopPropagation(); toggleSelectOrg(o.id) }}>
                                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97757', display: 'flex' }}>
                                                    {isSelected ? <CheckSquare size={17} /> : <Square size={17} style={{ color: '#CCC' }} />}
                                                </button>
                                            </td>
                                            <td style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => handleOrgSelect(o.id)}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#FEF3EC', color: '#d97757', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem', flexShrink: 0 }}>
                                                        {initials(o.name)}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: '#2D1B0E', fontSize: '0.875rem' }}>{o.name}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{o.contact_email || 'Pas d\'email contact'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => handleOrgSelect(o.id)}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: status.bg, color: status.color, padding: '2px 10px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 700, marginBottom: '4px' }}>
                                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: status.color }} />
                                                    {status.label.toUpperCase()}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6A9CC4' }}>{o.tier || 'Basic'}</div>
                                            </td>
                                            <td style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => handleOrgSelect(o.id)}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{o.member_count} / {o.max_users || 5}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--color-muted)' }}>Utilisateurs</div>
                                            </td>
                                            {/* C — Alerte expiration visible */}
                                            <td style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => handleOrgSelect(o.id)}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isExpiringSoon ? '#D97757' : 'inherit' }}>
                                                    {formatDate(o.subscription_end_date)}
                                                </div>
                                                {isExpiringSoon && (
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: daysLeft! <= 7 ? '#D94F38' : '#D97757' }}>
                                                        ⚠️ {daysLeft}j restants
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                                    {/* H — Email de rappel */}
                                                    {o.contact_email && isExpiringSoon && (
                                                        <button onClick={e => { e.stopPropagation(); handleSendReminder(o) }}
                                                            title="Envoyer un rappel par email"
                                                            style={{ padding: '5px', borderRadius: '8px', border: 'none', background: '#EEF4FA', color: '#6A9CC4', cursor: 'pointer', display: 'flex' }}>
                                                            <Mail size={14} />
                                                        </button>
                                                    )}
                                                    <ChevronRight size={18} color="#D97757" style={{ cursor: 'pointer' }} onClick={() => handleOrgSelect(o.id)} />
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    </>
                    )}
                </div>
            ) : (
                <div className="animate-fadeIn">
                    <button 
                        onClick={() => setSelectedOrgId('')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', padding: '10px 16px', borderRadius: '16px', background: '#FEF3EC', color: '#D97757', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem' }}
                    >
                        <ArrowLeft size={20} />
                        RETOUR À TOUTES LES PÂTISSERIES
                    </button>
                    {/* Detail Navigation Tabs */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                        {[
                            { id: 'info', label: 'Configuration & Licence', icon: <Building2 size={18} /> },
                            { id: 'team', label: 'Équipe & Utilisateurs', icon: <Users size={18} /> },
                            { id: 'support', label: 'Support & Activité', icon: <AlertTriangle size={18} /> },
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
                                        <TouchSelect 
                                            value={subForm.currency_symbol} 
                                            onChange={val => setSubForm(f => ({ ...f, currency_symbol: val }))}
                                            options={CURRENCY_OPTIONS}
                                            placeholder="Choisir une devise"
                                            title="Devises"
                                        />
                                    </Field>
                                    <Field label="Expiration de la Licence">
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <DatePicker 
                                                value={subForm.subscription_end_date ? new Date(subForm.subscription_end_date) : null}
                                                onChange={(date: Date) => setSubForm(f => ({ ...f, subscription_end_date: date ? date.toISOString().split('T')[0] : '' }))}
                                                placeholder="Sélectionner une date"
                                                direction="up"
                                            />
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

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <Field label="Plan Tarifaire (Tier)">
                                            <select className="input" value={subForm.tier} onChange={e => setSubForm(f => ({ ...f, tier: e.target.value }))}>
                                                <option value="Basic">Basic</option>
                                                <option value="Premium">Premium</option>
                                                <option value="Premium + IA">Premium + IA</option>
                                            </select>
                                        </Field>
                                        <Field label="Limite Utilisateurs">
                                            <TouchInput
                                                value={subForm.max_users.toString()}
                                                onChange={val => setSubForm(f => ({ ...f, max_users: parseInt(val) || 1 }))}
                                                allowDecimal={false}
                                                title="Limite utilisateurs"
                                                style={{ fontSize: '0.9rem', minHeight: '32px' }}
                                            />
                                        </Field>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <Field label="Email Contact Propriétaire">
                                            <input className="input" placeholder="exemple@mail.com" value={subForm.contact_email} onChange={e => setSubForm(f => ({ ...f, contact_email: e.target.value }))} />
                                        </Field>
                                        <Field label="Tél Contact Propriétaire">
                                            <TouchInput 
                                                value={subForm.contact_phone || ''} 
                                                onChange={val => setSubForm(f => ({ ...f, contact_phone: val }))}
                                                isPhone={true}
                                                placeholder="+225 ..."
                                                title="Téléphone Propriétaire"
                                            />
                                        </Field>
                                    </div>


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
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button onClick={() => setIsAddUserModalOpen(true)} className="btn-secondary" style={{ height: '40px', fontSize: '0.8rem' }}>
                                            <Plus size={16} /> Créer un utilisateur
                                        </button>
                                        <div style={{ background: '#FEF3EC', color: '#d97757', padding: '6px 16px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700 }}>
                                            {orgTeam.length} utilisateurs
                                        </div>
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

                        {/* Tab Content: Support */}
                        {tab === 'support' && (
                            <div style={{ maxWidth: '800px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                                    <div style={{ padding: '24px', borderRadius: '24px', background: 'linear-gradient(135deg, #FF6B6B, #D94F38)', color: 'white' }}>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <ShieldAlert size={24} /> Prise de main (Impersonation)
                                        </h3>
                                        <p style={{ fontSize: '0.9rem', opacity: 0.9, lineHeight: 1.5, marginBottom: '20px' }}>
                                            Connectez-vous à l'interface POS comme si vous étiez le gérant de cet établissement. 
                                            Utile pour débugger ou configurer le compte client en direct.
                                        </p>
                                        <button 
                                            onClick={handleImpersonate}
                                            disabled={impersonationLoading}
                                            style={{ 
                                                width: '100%', height: '52px', borderRadius: '14px', border: 'none', 
                                                background: 'white', color: '#D94F38', fontWeight: 800, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                                            }}
                                        >
                                            {impersonationLoading ? <Loader2 size={20} className="animate-spin" /> : <LayoutDashboard size={20} />}
                                            SE CONNECTER EN TANT QUE CLIENT
                                        </button>
                                    </div>

                                    <div style={{ padding: '24px', borderRadius: '24px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', marginBottom: '16px' }}>Infos Support</h3>
                                        <div style={{ display: 'grid', gap: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: '#64748B' }}>Dernière Synchro :</span>
                                                <span style={{ fontWeight: 700 }}>Aujourd'hui, 14:22</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: '#64748B' }}>Version Client :</span>
                                                <span style={{ fontWeight: 700 }}>v2.4.0 (Vercel)</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: '#64748B' }}>Contact Facturation :</span>
                                                <span style={{ fontWeight: 700, color: '#D97757' }}>{selectedOrg.contact_email || 'Non défini'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* E — Activité réelle */}
                                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={16} /> Activité Récente
                                    {loadingActivity && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-muted)' }} />}
                                </h4>
                                <div style={{ border: '1px solid #EEE', borderRadius: '16px', overflow: 'hidden' }}>
                                    {realActivity.length === 0 && !loadingActivity ? (
                                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                                            Aucune activité récente enregistrée.
                                        </div>
                                    ) : realActivity.map((l, i) => (
                                        <div key={i} style={{ padding: '12px 20px', borderBottom: i < realActivity.length - 1 ? '1px solid #F5F5F5' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.type === 'Vente' ? '#4C9E6A' : '#6A9CC4', flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{l.msg}</span>
                                                <span style={{ fontSize: '0.7rem', background: l.type === 'Vente' ? '#E8F5EE' : '#EEF4FA', color: l.type === 'Vente' ? '#4C9E6A' : '#6A9CC4', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>{l.type}</span>
                                            </div>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{l.date}</span>
                                        </div>
                                    ))}
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
                                <Field label="Devise (Symbol)">
                                    <TouchSelect 
                                        value={newOrgForm.currency_symbol} 
                                        onChange={val => setNewOrgForm(f => ({ ...f, currency_symbol: val }))}
                                        options={CURRENCY_OPTIONS}
                                        placeholder="Choisir une devise"
                                        title="Devises"
                                    />
                                </Field>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <Field label="Fin d'abonnement (Optionnel)">
                                        <DatePicker 
                                            value={newOrgForm.subscription_end_date ? new Date(newOrgForm.subscription_end_date) : null}
                                            onChange={(date: Date) => setNewOrgForm(f => ({ ...f, subscription_end_date: date ? date.toISOString().split('T')[0] : '' }))}
                                            placeholder="Sélectionner une date"
                                            direction="up"
                                        />
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

            {/* ─── Add User Modal ───────────────────────────────────────────── */}
            {isAddUserModalOpen && (
                <div className="modal-overlay" onClick={() => setIsAddUserModalOpen(false)}>
                    <div className="modal-content animate-scaleIn" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Nouvel utilisateur</h2>
                            <button onClick={() => setIsAddUserModalOpen(false)} className="btn-ghost"><X size={24} /></button>
                        </div>
                        <div style={{ display: 'grid', gap: '16px' }}>
                            <Field label="Nom Complet">
                                <input className="input" value={newUserForm.full_name} onChange={e => setNewUserForm(f => ({ ...f, full_name: e.target.value }))} placeholder="ex: Jean Dupont" />
                            </Field>
                            <Field label="Rôle">
                                <select className="input" value={newUserForm.role_slug} onChange={e => setNewUserForm(f => ({ ...f, role_slug: e.target.value }))}>
                                    {roles.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                                </select>
                            </Field>
                            <Field label="Email (Optionnel)">
                                <input className="input" type="email" value={newUserForm.email} onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))} placeholder="laisser vide pour auto-généré" />
                            </Field>
                            <Field label="Code PIN (4 chiffres)">
                                <TouchInput value={newUserForm.pin_code} onChange={val => setNewUserForm(f => ({ ...f, pin_code: val }))} maxLength={4} title="Définir le PIN" />
                            </Field>
                            <button onClick={handleAddUser} disabled={isPending} className="btn-primary" style={{ height: '52px', marginTop: '10px' }}>
                                {isPending ? <Loader2 size={20} className="animate-spin" /> : 'CRÉER L\'UTILISATEUR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── PIN Reset Result Modal ────────────────────────────────────── */}
            {resetPinResult && (
                <div className="modal-overlay">
                    <div className="modal-content animate-scaleIn" style={{ maxWidth: '400px', textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#E8F5EE', color: '#4C9E6A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <KeyRound size={32} />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '10px' }}>Nouveau Code PIN</h2>
                        <p style={{ color: 'var(--color-muted)', marginBottom: '24px' }}>
                            Le code PIN pour <strong>{resetPinResult.name}</strong> a été réinitialisé. Communiquez-lui ce code :
                        </p>
                        <div style={{ fontSize: '3rem', fontWeight: 900, color: '#D97757', letterSpacing: '0.2em', marginBottom: '32px' }}>
                            {resetPinResult.pin}
                        </div>
                        <button onClick={() => setResetPinResult(null)} className="btn-primary" style={{ width: '100%' }}>J&apos;ai pris note</button>
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
                .table-row-hover:hover {
                    background: #FDFCFB !important;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(217, 119, 87, 0.2);
                    border-radius: 99px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(217, 119, 87, 0.4);
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
