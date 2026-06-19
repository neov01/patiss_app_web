'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CakeSlice, Delete, Loader2, Store } from 'lucide-react'
import type { Profile } from '@/types/supabase'
import { loginWithPin, verifyKioskCode, getKioskProfiles, logoutKiosk } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'

function KioskContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    async function handleGerantLogin() {
        const supabase = createClient();
        await logoutKiosk();
        await supabase.auth.signOut();
        router.push('/login');
    }

    const [kioskOrgId, setKioskOrgId] = useState<string | null>(() => searchParams.get('orgId'))
    const [boutiqueCode, setBoutiqueCode] = useState('')
    const [verifyingCode, setVerifyingCode] = useState(false)
    
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [selected, setSelected] = useState<Profile | null>(null)
    const [pin, setPin] = useState('')
    const [loading, setLoading] = useState(false)
    const [checking, setChecking] = useState(false)

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

    const pressDigit = useCallback((d: string) => {
        if (pin.length >= 4) return
        const next = pin + d
        setPin(next)
        if (next.length === 4) handlePIN(next)
    }, [pin, handlePIN])

    const deleteLast = useCallback(() => {
        setPin(p => p.slice(0, -1))
    }, [])

    const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    const COLORS = ['#E8B4A0', '#9CB8A0', '#A0B8E8', '#E8D4A0', '#C4A0E8', '#E8A0C4']

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(145deg, #FDF8F3 0%, #FDE8E0 100%)',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            overflowX: 'hidden'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', zIndex: 10 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '44px', height: '44px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, var(--color-rose-dark), #C78A4A)',
                }}>
                    <CakeSlice size={22} color="white" strokeWidth={1.5} />
                </div>
                <div>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>Mode Kiosque</h1>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', margin: 0 }}>
                        {!kioskOrgId ? 'Configuration' : !selected ? 'Sélectionnez votre profil' : 'Identification'}
                    </p>
                </div>
                <button 
                    onClick={handleGerantLogin}
                    style={{ 
                        marginLeft: 'auto', 
                        color: 'var(--color-muted)', 
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

            {/* Layout Flex Principal */}
            <div style={{
                display: 'flex',
                width: '100%',
                flex: 1,
                gap: '40px',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: kioskOrgId ? 'row' : 'column',
                flexWrap: 'wrap',
                transition: 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)'
            }}>
                {/* ÉTAPE 1: Code Boutique */}
                <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 80, damping: 15 }}
                    style={{
                        background: 'rgba(255, 255, 255, 0.85)',
                        padding: '40px',
                        borderRadius: '32px',
                        boxShadow: '0 10px 40px rgba(45,27,14,0.06)',
                        width: '100%',
                        maxWidth: kioskOrgId ? '340px' : '400px',
                        textAlign: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        backdropFilter: 'blur(12px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        zIndex: 2
                    }}
                >
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-well)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                        <Store size={32} color="#D97757" />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)', margin: '0 0 12px' }}>Code Boutique</h2>
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: '32px' }}>
                        Entrez le code d&apos;accès de votre pâtisserie fourni par l&apos;administrateur.
                    </p>

                    <form onSubmit={handleVerifyBoutiqueCode} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                        <input
                            type="text"
                            value={boutiqueCode}
                            onChange={e => setBoutiqueCode(e.target.value.toUpperCase())}
                            placeholder="ex: ABCDEF"
                            className="input"
                            disabled={!!kioskOrgId}
                            style={{ 
                                textAlign: 'center', 
                                fontSize: '1.25rem', 
                                letterSpacing: '0.2em', 
                                fontWeight: 800, 
                                textTransform: 'uppercase', 
                                height: '56px',
                                background: kioskOrgId ? 'var(--color-well, #F5EEE4)' : 'white',
                                borderColor: kioskOrgId ? 'transparent' : undefined
                            }}
                            maxLength={8}
                        />
                        {!kioskOrgId && (
                            <button type="submit" disabled={verifyingCode || boutiqueCode.length < 3} className="btn-primary" style={{ height: '56px', fontSize: '1.05rem', gap: '10px', width: '100%' }}>
                                {verifyingCode ? <Loader2 size={20} className="animate-spin" /> : 'Accéder au kiosque'}
                            </button>
                        )}
                    </form>
                </motion.div>

                {/* ÉTAPE 2 & 3: Profils & PIN (Côté Droit) */}
                {kioskOrgId && (
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 80, damping: 15, delay: 0.2 }}
                        style={{
                            flex: 1,
                            minWidth: '320px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            zIndex: 1
                        }}
                    >
                        <AnimatePresence mode="wait">
                            {selected === null ? (
                                <motion.div
                                    key="grid-view"
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -15 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                >
                                    {loading ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px', width: '100%', maxWidth: '520px' }}>
                                            {[1, 2, 3, 4].map(i => (
                                                <div key={i} className="skeleton" style={{ height: '160px', borderRadius: 'var(--radius-lg)' }} />
                                            ))}
                                        </div>
                                    ) : profiles.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: 'var(--color-muted)', paddingTop: '40px' }}>
                                            <p>Aucun employé actif trouvé pour cette boutique.</p>
                                            <button onClick={() => setKioskOrgId(null)} className="btn-ghost" style={{ marginTop: '16px' }}>
                                                Retour
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '24px', textAlign: 'center' }}>
                                                Sélectionnez votre profil
                                            </h2>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                                gap: '16px',
                                                width: '100%',
                                                maxWidth: '520px',
                                            }}>
                                                {profiles.map((p, i) => (
                                                    <motion.button
                                                        key={p.id}
                                                        layoutId={`profile-card-${p.id}`}
                                                        onClick={() => { setSelected(p); setPin('') }}
                                                        whileHover={{ scale: 1.03, y: -2 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        style={{
                                                            background: 'white',
                                                            border: '2px solid var(--color-border)',
                                                            borderRadius: '20px',
                                                            padding: '20px 12px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            gap: '12px',
                                                            boxShadow: '0 4px 12px rgba(45,27,14,0.02)',
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '64px', height: '64px', borderRadius: '50%',
                                                            background: p.avatar_url ? `url(${p.avatar_url}) center/cover` : COLORS[i % COLORS.length],
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '1.4rem', fontWeight: 700, color: '#fff',
                                                        }}>
                                                            {!p.avatar_url && initials(p.full_name)}
                                                        </div>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)', textAlign: 'center' }}>
                                                            {p.full_name}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                                                            {p.role_slug === 'vendeur' ? '🛒 Vendeur' : '👨‍🍳 Pâtissier'}
                                                        </span>
                                                    </motion.button>
                                                ))}
                                            </div>
                                            
                                            {!searchParams.get('orgId') && (
                                                <button onClick={() => setKioskOrgId(null)} className="btn-ghost" style={{ marginTop: '32px', fontSize: '0.85rem', fontWeight: 700 }}>
                                                    ← Changer de Code Boutique
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="pin-view"
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -15 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}
                                >
                                    {/* Profil sélectionné centré */}
                                    <motion.div
                                        layoutId={`profile-card-${selected.id}`}
                                        style={{
                                            background: 'white',
                                            border: '2px solid var(--color-border)',
                                            borderRadius: '24px',
                                            padding: '20px 32px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '20px',
                                            boxShadow: '0 10px 30px rgba(45,27,14,0.04)',
                                            width: '100%',
                                            maxWidth: '360px',
                                        }}
                                    >
                                        <div style={{
                                            width: '64px', height: '64px', borderRadius: '50%',
                                            background: selected.avatar_url ? `url(${selected.avatar_url}) center/cover` : COLORS[profiles.indexOf(selected) % COLORS.length],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1.4rem', fontWeight: 700, color: '#fff',
                                            flexShrink: 0
                                        }}>
                                            {!selected.avatar_url && initials(selected.full_name)}
                                        </div>
                                        <div style={{ textAlign: 'left' }}>
                                            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>{selected.full_name}</h2>
                                            <p style={{ color: 'var(--color-muted)', fontSize: '0.8rem', margin: '4px 0 0', fontWeight: 600 }}>
                                                {selected.role_slug === 'vendeur' ? '🛒 Vendeur' : '👨‍🍳 Pâtissier'}
                                            </p>
                                        </div>
                                    </motion.div>

                                    {/* PIN Pad Block */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.15 }}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}
                                    >
                                        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: 0, fontWeight: 600 }}>Entrez votre code PIN</p>
                                        
                                        {/* Dots */}
                                        <div style={{ display: 'flex', gap: '16px' }}>
                                            {[0, 1, 2, 3].map(i => (
                                                <div key={i} style={{
                                                    width: '16px', height: '16px', borderRadius: '50%',
                                                    background: i < pin.length ? 'var(--color-primary, var(--color-rose-dark))' : 'var(--color-border)',
                                                    transition: 'background 0.2s',
                                                }} />
                                            ))}
                                        </div>

                                        {/* Pad */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: '12px' }}>
                                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
                                                <motion.button 
                                                    key={i} 
                                                    onClick={() => d === '⌫' ? deleteLast() : d ? pressDigit(d) : undefined}
                                                    disabled={!d || checking}
                                                    whileHover={d ? { scale: 1.08 } : {}}
                                                    whileTap={d ? { scale: 0.92 } : {}}
                                                    style={{
                                                        width: '72px', height: '72px', borderRadius: '50%',
                                                        border: '2px solid var(--color-border)',
                                                        background: d === '⌫' ? 'var(--color-well, #F5EEE4)' : 'white',
                                                        fontSize: d === '⌫' ? '1.1rem' : '1.5rem',
                                                        fontWeight: 700, cursor: d ? 'pointer' : 'default',
                                                        color: d === '⌫' ? 'var(--color-rose-dark)' : 'var(--color-text)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: d ? '0 4px 8px rgba(45,27,14,0.02)' : 'none',
                                                        visibility: d === '' ? 'hidden' : 'visible',
                                                        transition: 'border-color 0.15s, background-color 0.15s',
                                                    }}
                                                >
                                                    {d === '⌫' ? <Delete size={20} /> : d}
                                                </motion.button>
                                            ))}
                                        </div>

                                        {checking && <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-rose-dark)' }} />}

                                        <button onClick={() => { setSelected(null); setPin('') }} className="btn-ghost" style={{ marginTop: '12px', fontSize: '0.85rem', fontWeight: 700 }}>
                                            ← Changer de profil
                                        </button>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>
        </div>
    )
}

export default function KioskPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FDF8F3' }}>
                <Loader2 size={32} className="animate-spin" color="var(--color-rose-dark)" />
            </div>
        }>
            <KioskContent />
        </Suspense>
    )
}
