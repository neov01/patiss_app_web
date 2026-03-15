'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CakeSlice, Delete, Loader2 } from 'lucide-react'
import type { Profile } from '@/types/supabase'
import { loginWithPin } from '@/lib/actions/auth'

export default function KioskPage() {
    const router = useRouter()
    const [profiles, setProfiles] = useState<Profile[]>([])
    const [selected, setSelected] = useState<Profile | null>(null)
    const [pin, setPin] = useState('')
    const [loading, setLoading] = useState(true)
    const [checking, setChecking] = useState(false)

    useEffect(() => {
        async function fetchProfiles() {
            const supabase = createClient()
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('is_active', true)
                .in('role_slug', ['vendeur', 'patissier'])
            setProfiles(data ?? [])
            setLoading(false)
        }
        fetchProfiles()
    }, [])

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
                    <p style={{ fontSize: '0.8rem', color: '#9C8070', margin: 0 }}>Sélectionnez votre profil</p>
                </div>
                <a href="/login" style={{ marginLeft: 'auto', color: '#9C8070', fontSize: '0.8rem', textDecoration: 'none' }}>
                    Connexion Gérant →
                </a>
            </div>

            {/* Avatar grid */}
            {!selected ? (
                <div className="animate-fade-in">
                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: '16px' }}>
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="skeleton" style={{ height: '160px', borderRadius: 'var(--radius-lg)' }} />
                            ))}
                        </div>
                    ) : profiles.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#9C8070', paddingTop: '60px' }}>
                            <p>Aucun employé actif trouvé.</p>
                        </div>
                    ) : (
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
                    )}
                </div>
            ) : (
                /* PIN Pad */
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
