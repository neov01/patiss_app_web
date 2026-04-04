'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CakeSlice, Delete, Loader2, Store } from 'lucide-react'
import type { Profile } from '@/types/supabase'
import { loginWithPin, verifyKioskCode, getKioskProfiles, logoutKiosk } from '@/lib/actions/auth'

import { createClient } from '@/lib/supabase/client'

function KioskContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    async function handleGerantLogin() {
        const supabase = createClient();
        await logoutKiosk();
        await supabase.auth.signOut();
        router.push('/login');
    }

    const [kioskOrgId, setKioskOrgId] = useState<string | null>(null)
    const [boutiqueCode, setBoutiqueCode] = useState('')
    const [verifyingCode, setVerifyingCode] = useState(false)
    
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [selected, setSelected] = useState<Profile | null>(null)
    const [pin, setPin] = useState('')
    const [loading, setLoading] = useState(false)
    const [checking, setChecking] = useState(false)

    // 1. Initialisation de l'organisation
    useEffect(() => {
        const orgId = searchParams.get('orgId')
        if (orgId) {
            setKioskOrgId(orgId)
        }
    }, [searchParams])

    // 2. Récupération des employés si organisation connue
    useEffect(() => {
        if (!kioskOrgId) return
        
        async function fetchProfiles() {
            setLoading(true)
            const res = await getKioskProfiles(kioskOrgId!)
            if (res.success && res.profiles) {
                setProfiles(res.profiles)
            } else {
                toast.error(res.error || 'Erreur lors du chargement des profils')
            }
            setLoading(false)
        }
        fetchProfiles()
    }, [kioskOrgId])

    const handleVerifyBoutiqueCode = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!boutiqueCode.trim()) return
        
        setVerifyingCode(true)
        const res = await verifyKioskCode(boutiqueCode.trim())
        if (res.success && res.orgId) {
            toast.success(`Kiosque configuré pour : ${res.orgName}`)
            setKioskOrgId(res.orgId)
        } else {
            toast.error(res.error)
        }
        setVerifyingCode(false)
    }

    const handlePIN = useCallback(async (finalPin: string) => {
        if (!selected) return
        setChecking(true)

        const res = await loginWithPin(selected.id, finalPin)

        if (res.success) {
            toast.success(`Bienvenue ${selected.full_name} !`)
            router.push('/dashboard')
        } else {
            toast.error(res.error || 'Erreur de connexion')
            setPin('')
        }
        setChecking(false)
    }, [selected, router])

    function pressDigit(d: string) {
        if (pin.length >= 4) return
        const next = pin + d
        setPin(next)
        if (next.length === 4) handlePIN(next)
    }

    function deleteLast() { setPin(p => p.slice(0, -1)) }

    const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    const COLORS = ['#E8B4A0', '#9CB8A0', '#A0B8E8', '#E8D4A0', '#C4A0E8', '#E8A0C4']

    return (
        <div style={{
            minHeight: '100dvh',
            background: 'linear-gradient(145deg, #FDF8F3 0%, #FDE8E0 100%)',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '44px', height: '44px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #C4836A, #C78A4A)',
                }}>
                    <CakeSlice size={22} color="white" strokeWidth={1.5} />
                </div>
                <div>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#2D1B0E' }}>Mode Kiosque</h1>
                    <p style={{ fontSize: '0.8rem', color: '#9C8070', margin: 0 }}>
                        {!kioskOrgId ? 'Configuration' : !selected ? 'Sélectionnez votre profil' : 'Identification'}
                    </p>
                </div>
                <button 
                    onClick={handleGerantLogin}
                    style={{ 
                        marginLeft: 'auto', 
                        color: '#9C8070', 
                        fontSize: '0.8rem', 
                        textDecoration: 'none',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0
                    }}
                >
                    Connexion Gérant →
                </button>
            </div>

            {/* ÉTAPE 1: Code Boutique */}
            {!kioskOrgId ? (
                <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: '10vh' }}>
                    <div style={{ background: 'white', padding: '40px', borderRadius: '32px', boxShadow: '0 10px 40px rgba(45,27,14,0.06)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#FEF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                            <Store size={32} color="#D97757" />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2D1B0E', margin: '0 0 12px' }}>Code Boutique</h2>
                        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: '32px' }}>
                            Entrez le code d'accès de votre pâtisserie fourni par l'administrateur.
                        </p>

                        <form onSubmit={handleVerifyBoutiqueCode} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <input
                                type="text"
                                value={boutiqueCode}
                                onChange={e => setBoutiqueCode(e.target.value.toUpperCase())}
                                placeholder="ex: ABCDEF"
                                className="input"
                                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.2em', fontWeight: 800, textTransform: 'uppercase', height: '56px' }}
                                maxLength={8}
                            />
                            <button type="submit" disabled={verifyingCode || boutiqueCode.length < 3} className="btn-primary" style={{ height: '56px', fontSize: '1.05rem', gap: '10px' }}>
                                {verifyingCode ? <Loader2 size={20} className="animate-spin" /> : 'Accéder au kiosque'}
                            </button>
                        </form>
                    </div>
                </div>
            ) : !selected ? (
                /* ÉTAPE 2: Avatar grid */
                <div className="animate-fade-in">
                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: '16px' }}>
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="skeleton" style={{ height: '160px', borderRadius: 'var(--radius-lg)' }} />
                            ))}
                        </div>
                    ) : profiles.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#9C8070', paddingTop: '60px' }}>
                            <p>Aucun employé actif trouvé pour cette boutique.</p>
                            <button onClick={() => setKioskOrgId(null)} className="btn-ghost" style={{ marginTop: '16px' }}>
                                Retour
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: '16px' }}>
                                {profiles.map((p, i) => (
                                    <button key={p.id} onClick={() => { setSelected(p); setPin('') }}
                                        style={{
                                            background: 'white', border: '2px solid var(--color-border)',
                                            borderRadius: 'var(--radius-lg)', padding: '20px 12px',
                                            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                            minHeight: '44px',
                                        }}
                                        className="card-clickable"
                                    >
                                        <div style={{
                                            width: '64px', height: '64px', borderRadius: '50%',
                                            background: p.avatar_url ? `url(${p.avatar_url}) center/cover` : COLORS[i % COLORS.length],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1.4rem', fontWeight: 700, color: '#fff',
                                        }}>
                                            {!p.avatar_url && initials(p.full_name)}
                                        </div>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#2D1B0E', textAlign: 'center' }}>
                                            {p.full_name}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#9C8070' }}>
                                            {p.role_slug === 'vendeur' ? '🛒 Vendeur' : '👨‍🍳 Pâtissier'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            
                            {/* Option pour le gérant de "déconnecter" la boutique */}
                            {!searchParams.get('orgId') && (
                                <div style={{ marginTop: '40px', textAlign: 'center' }}>
                                    <button onClick={() => setKioskOrgId(null)} className="btn-ghost" style={{ fontSize: '0.8rem' }}>
                                        Changer de Code Boutique
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                /* ÉTAPE 3: PIN Pad */
                <div className="animate-scale-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', paddingTop: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 12px',
                            background: COLORS[profiles.indexOf(selected) % COLORS.length],
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.6rem', fontWeight: 700, color: '#fff',
                        }}>
                            {initials(selected.full_name)}
                        </div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{selected.full_name}</h2>
                        <p style={{ color: '#9C8070', fontSize: '0.875rem', margin: '4px 0 0' }}>Entrez votre code PIN</p>
                    </div>

                    {/* Dots */}
                    <div style={{ display: 'flex', gap: '16px' }}>
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} style={{
                                width: '16px', height: '16px', borderRadius: '50%',
                                background: i < pin.length ? '#C4836A' : 'var(--color-border)',
                                transition: 'background 0.2s',
                            }} />
                        ))}
                    </div>

                    {/* Pad */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: '12px' }}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
                            <button key={i} onClick={() => d === '⌫' ? deleteLast() : d ? pressDigit(d) : undefined}
                                disabled={!d || checking}
                                style={{
                                    width: '72px', height: '72px', borderRadius: '50%',
                                    border: '2px solid var(--color-border)',
                                    background: d === '⌫' ? 'var(--color-blush)' : 'white',
                                    fontSize: d === '⌫' ? '1.1rem' : '1.5rem',
                                    fontWeight: 600, cursor: d ? 'pointer' : 'default',
                                    color: d === '⌫' ? '#C4836A' : '#2D1B0E',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.15s, transform 0.1s',
                                    visibility: d === '' ? 'hidden' : 'visible',
                                    minHeight: '44px',
                                }}
                                onMouseDown={e => { if (d) (e.currentTarget.style.transform = 'scale(0.92)') }}
                                onMouseUp={e => { (e.currentTarget.style.transform = 'scale(1)') }}
                            >
                                {d === '⌫' ? <Delete size={20} /> : d}
                            </button>
                        ))}
                    </div>

                    {checking && <Loader2 size={24} className="animate-spin" style={{ color: '#C4836A' }} />}

                    <button onClick={() => { setSelected(null); setPin('') }} className="btn-ghost">
                        ← Changer de profil
                    </button>
                </div>
            )}
        </div>
    )
}

export default function KioskPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FDF8F3' }}>
                <Loader2 size={32} className="animate-spin" color="#C4836A" />
            </div>
        }>
            <KioskContent />
        </Suspense>
    )
}
