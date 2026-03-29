'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Mail, Lock, CakeSlice, Loader2 } from 'lucide-react'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        const supabase = createClient()
        // If password is 4 digits PIN, pad it to 6 to match Auth storage
        const authPassword = password.length === 4 && /^\d+$/.test(password)
            ? password.padEnd(6, '0')
            : password

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: authPassword
        })

        if (error) {
            toast.error("Identifiants incorrects. Vérifiez votre email et mot de passe.")
            setLoading(false)
            return
        }

        toast.success('Connexion réussie !')
        // Use a hard redirect to the home page so the layout correctly refetches roles and clears any old client-side layout states
        window.location.href = '/'
    }

    return (
        <div style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(145deg, #FDF8F3 0%, #FDE8E0 100%)',
            padding: '24px',
        }}>
            {/* Logo */}
            <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '72px',
                    height: '72px',
                    borderRadius: '24px',
                    background: 'linear-gradient(135deg, #C4836A, #C78A4A)',
                    marginBottom: '16px',
                    boxShadow: '0 8px 32px rgba(196,131,106,0.35)',
                }}>
                    <CakeSlice size={36} color="white" strokeWidth={1.5} />
                </div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2D1B0E', margin: 0 }}>
                    Pâtiss&apos;App
                </h1>
                <p style={{ color: '#9C8070', marginTop: '4px', fontSize: '0.9rem' }}>
                    Espace Gérant
                </p>
            </div>

            {/* Card connexion */}
            <div className="card animate-slide-up" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '24px', color: '#2D1B0E' }}>
                    Connexion
                </h2>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label className="label" htmlFor="email">Email</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9C8070' }} />
                            <input
                                id="email"
                                type="email"
                                className="input"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="gerant@patisserie.fr"
                                style={{ paddingLeft: '40px' }}
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="label" htmlFor="password">Mot de passe</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9C8070' }} />
                            <input
                                id="password"
                                type="password"
                                className="input"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                style={{ paddingLeft: '40px' }}
                                required
                            />
                        </div>
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '8px' }}>
                        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                        {loading ? 'Connexion…' : 'Se connecter'}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}>
                    <a href="/kiosk" style={{ color: 'var(--color-rose-dark)', fontSize: '0.875rem', textDecoration: 'none', fontWeight: 500 }}>
                        → Mode Kiosque (Employés)
                    </a>
                </div>
            </div>
        </div>
    )
}
