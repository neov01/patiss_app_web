'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function ImpersonatePage() {
    const router = useRouter()
    const [status, setStatus] = useState<'loading' | 'error'>('loading')
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        const hash = window.location.hash.slice(1) // remove leading #
        const params = new URLSearchParams(hash)

        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (!accessToken || !refreshToken) {
            const timer = window.setTimeout(() => {
                setErrorMsg('Lien invalide ou expiré. Tokens manquants.')
                setStatus('error')
            }, 0)
            return () => window.clearTimeout(timer)
        }

        const supabase = createClient()
        const accessTokenValue = accessToken
        const refreshTokenValue = refreshToken
        let cancelled = false

        async function establishSession() {
            const { error } = await supabase.auth.setSession({ access_token: accessTokenValue, refresh_token: refreshTokenValue })
            if (cancelled) return
            if (error) {
                setErrorMsg(`Erreur de session : ${error.message}`)
                setStatus('error')
                return
            }
            // Session établie — rediriger vers le dashboard du client
            router.replace('/dashboard')
        }

        void establishSession()
        return () => {
            cancelled = true
        }
    }, [router])

    if (status === 'error') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: '#FDF8F3' }}>
                <div style={{ fontSize: '2rem' }}>❌</div>
                <h2 style={{ fontWeight: 800, color: '#D94F38', margin: 0 }}>Impersonation échouée</h2>
                <p style={{ color: 'var(--color-muted)', textAlign: 'center', maxWidth: '400px' }}>{errorMsg}</p>
                <button onClick={() => router.push('/admin')}
                    style={{ padding: '12px 24px', borderRadius: '12px', background: '#815431', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                    Retour Super Admin
                </button>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: '#FDF8F3' }}>
            <Loader2 size={36} style={{ color: '#815431', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontWeight: 700, color: 'var(--color-muted)' }}>Connexion au compte client en cours…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}
