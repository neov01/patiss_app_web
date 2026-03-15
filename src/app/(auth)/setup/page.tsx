'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Mail, Lock, CakeSlice, Loader2, ShieldCheck, Building2 } from 'lucide-react'
import { setupSuperAdmin } from '@/lib/actions/setup'

export default function SetupPage() {
    const router = useRouter()
    const [step, setStep] = useState<'auth' | 'org' | 'done'>('auth')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [orgName, setOrgName] = useState('')
    const [loading, setLoading] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)

    async function handleAuth(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        const supabase = createClient()

        // Essayer de se connecter d'abord
        let { data, error } = await supabase.auth.signInWithPassword({ email, password })

        if (error) {
            // Si échec, essayer de créer le compte
            const signUpResult = await supabase.auth.signUp({ email, password })
            if (signUpResult.error || !signUpResult.data.user) {
                toast.error(`Erreur : ${signUpResult.error?.message || 'Impossible de créer le compte.'}`)
                setLoading(false)
                return
            }
            setUserId(signUpResult.data.user.id)
            toast.success('Compte créé et authentifié !')
            setStep('org')
            setLoading(false)
            return
        }

        if (!data.user) {
            toast.error("Impossible de récupérer l'utilisateur.")
            setLoading(false)
            return
        }

        setUserId(data.user.id)
        toast.success('Authentification réussie !')
        setStep('org')
        setLoading(false)
    }

    async function handleSetup(e: React.FormEvent) {
        e.preventDefault()
        if (!userId) return
        setLoading(true)

        const result = await setupSuperAdmin({
            fullName,
            orgName,
        })

        if ('error' in result && result.error) {
            toast.error(result.error)
            setLoading(false)
            return
        }

        toast.success('Super Admin configuré avec succès ! 🎉')
        setStep('done')
        setLoading(false)

        // Redirection après 2 secondes
        setTimeout(() => {
            router.push('/dashboard')
            router.refresh()
        }, 2000)
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
                    background: 'linear-gradient(135deg, #1E40AF, #4C9E6A)',
                    marginBottom: '16px',
                    boxShadow: '0 8px 32px rgba(30,64,175,0.35)',
                }}>
                    <ShieldCheck size={36} color="white" strokeWidth={1.5} />
                </div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2D1B0E', margin: 0 }}>
                    Configuration Initiale
                </h1>
                <p style={{ color: '#9C8070', marginTop: '4px', fontSize: '0.9rem' }}>
                    Créez votre compte Super Admin
                </p>
            </div>

            {/* Indicateur d'étape */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', alignItems: 'center' }}>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: step === 'auth' ? 'linear-gradient(135deg, #C4836A, #C78A4A)' : '#4C9E6A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '0.8rem', fontWeight: 700,
                }}>{step !== 'auth' ? '✓' : '1'}</div>
                <div style={{ width: '40px', height: '2px', background: step === 'auth' ? 'var(--color-border)' : '#4C9E6A' }} />
                <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: step === 'org' ? 'linear-gradient(135deg, #C4836A, #C78A4A)' : step === 'done' ? '#4C9E6A' : 'var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: step === 'auth' ? 'var(--color-muted)' : 'white', fontSize: '0.8rem', fontWeight: 700,
                }}>{step === 'done' ? '✓' : '2'}</div>
            </div>

            {/* Security notice */}
            <div style={{
                background: '#EFF6FF', border: '1.5px solid #BFDBFE',
                borderRadius: 'var(--radius-md)', padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '20px', maxWidth: '420px', width: '100%',
            }}>
                <ShieldCheck size={16} color="#1E40AF" />
                <span style={{ fontSize: '0.8rem', color: '#1E40AF', fontWeight: 500 }}>
                    🔒 Vos identifiants sont envoyés directement à Supabase (chiffrés). Rien n&apos;est stocké localement.
                </span>
            </div>

            {/* Step 1 : Auth */}
            {step === 'auth' && (
                <div className="card animate-slide-up" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px', color: '#2D1B0E' }}>
                        Étape 1 — Authentification
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '20px' }}>
                        Entrez l&apos;email et le mot de passe de votre compte Supabase. Si le compte n&apos;existe pas encore, il sera créé automatiquement.
                    </p>
                    <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                                    placeholder="admin@patisserie.fr"
                                    style={{ paddingLeft: '40px' }}
                                    required
                                    autoComplete="email"
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
                                    minLength={6}
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>
                        <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '8px' }}>
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                            {loading ? 'Vérification…' : 'Vérifier et continuer'}
                        </button>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                        <a href="/login" style={{ color: 'var(--color-rose-dark)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}>
                            ← Retour à la connexion
                        </a>
                    </div>
                </div>
            )}

            {/* Step 2 : Organisation + Profil */}
            {step === 'org' && (
                <div className="card animate-slide-up" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px', color: '#2D1B0E' }}>
                        Étape 2 — Votre profil
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '20px' }}>
                        Configurez votre nom et le nom de votre pâtisserie.
                    </p>
                    <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label className="label" htmlFor="fullName">Votre nom complet</label>
                            <div style={{ position: 'relative' }}>
                                <ShieldCheck size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9C8070' }} />
                                <input
                                    id="fullName"
                                    type="text"
                                    className="input"
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    placeholder="Jean Dupont"
                                    style={{ paddingLeft: '40px' }}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="label" htmlFor="orgName">Nom de la pâtisserie</label>
                            <div style={{ position: 'relative' }}>
                                <Building2 size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9C8070' }} />
                                <input
                                    id="orgName"
                                    type="text"
                                    className="input"
                                    value={orgName}
                                    onChange={e => setOrgName(e.target.value)}
                                    placeholder="Pâtisserie du Bonheur"
                                    style={{ paddingLeft: '40px' }}
                                    required
                                />
                            </div>
                        </div>
                        <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '8px' }}>
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <CakeSlice size={18} />}
                            {loading ? 'Configuration…' : 'Créer le Super Admin'}
                        </button>
                    </form>
                </div>
            )}

            {/* Step 3 : Confirmation */}
            {step === 'done' && (
                <div className="card animate-scale-in" style={{ width: '100%', maxWidth: '420px', padding: '32px', textAlign: 'center' }}>
                    <div style={{
                        width: '72px', height: '72px', borderRadius: '50%',
                        background: '#D1FAE5', display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center', marginBottom: '16px',
                    }}>
                        <ShieldCheck size={36} color="#065F46" />
                    </div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 8px', color: '#065F46' }}>
                        Super Admin configuré ! 🎉
                    </h2>
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', margin: 0 }}>
                        Redirection vers le dashboard…
                    </p>
                    <div style={{ marginTop: '16px' }}>
                        <Loader2 size={24} className="animate-spin" style={{ color: '#4C9E6A' }} />
                    </div>
                </div>
            )}
        </div>
    )
}
