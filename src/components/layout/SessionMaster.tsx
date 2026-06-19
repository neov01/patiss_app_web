'use client'

import { createContext, useContext, useState } from 'react'
import { closeCurrentSession, openSession } from '@/lib/actions/sessions'
import { toast } from 'sonner'
import { usePathname, useRouter } from 'next/navigation'
import { useActionFeedback } from '@/hooks/useActionFeedback'
import { Lock, Loader2 } from 'lucide-react'

type SessionContextType = {
    isOpen: boolean;
    sessionId: string | null;
    handleToggle: () => void;
    doToggle: () => Promise<void>;
    loading: boolean;
    canCloseSession: boolean;
    showConfirm: boolean;
    setShowConfirm: (v: boolean) => void;
}

type InitialSession = {
    id: string
} | null

const SessionContext = createContext<SessionContextType>({
    isOpen: false,
    sessionId: null,
    handleToggle: () => {},
    doToggle: async () => {},
    loading: false,
    canCloseSession: false,
    showConfirm: false,
    setShowConfirm: () => {},
})

export function useSession() {
    return useContext(SessionContext)
}

export default function SessionMaster({ 
    children, 
    initialSession, 
    role
}: { 
    children: React.ReactNode, 
    initialSession: InitialSession, 
    role: string
}) {
    const [loading, setLoading] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const { execute, renderFeedback } = useActionFeedback()
    const pathname = usePathname()
    const router = useRouter()
    const isOpen = !!initialSession
    const sessionId = initialSession?.id || null
    const canCloseSession = role === 'gerant' || role === 'super_admin' || role === 'vendeur'

    const handleToggle = () => {
        if (isOpen) {
            if (!canCloseSession) {
                toast.error('Seul un gérant ou un vendeur peut clôturer la caisse')
                return
            }
            setShowConfirm(true)
        } else {
            doToggle()
        }
    }

    const doToggle = async () => {
        setShowConfirm(false)
        setLoading(true)
        if (isOpen) {
            await execute(async () => {
                const res = await closeCurrentSession()
                if (!res.success) {
                    throw new Error(res.error || 'Erreur lors de la clôture')
                }
                return res.session
            }, {
                type: 'modal',
                modalTitle: 'Journée clôturée avec succès',
                modalDescription: 'Les ventes du jour ont été enregistrées.',
                onSuccess: () => {
                    router.refresh()
                    setLoading(false)
                },
                onError: () => {
                    setLoading(false)
                }
            })
        } else {
            await execute(async () => {
                const res = await openSession()
                if (!res.success) {
                    throw new Error(res.error || 'Erreur lors de l\'ouverture')
                }
                return res
            }, {
                type: 'toast',
                successMessage: 'Caisse ouverte, bonne journée !',
                onSuccess: () => {
                    router.refresh()
                    setLoading(false)
                },
                onError: () => {
                    setLoading(false)
                }
            })
        }
    }

    // Liste des zones sensibles qui doivent être verrouillées si la caisse est fermée
    const isRestrictedPage = 
        pathname.startsWith('/dashboard') || 
        pathname.startsWith('/caisse') || 
        pathname.startsWith('/commandes') ||
        pathname.startsWith('/inventaire')
    
    // Le verrouillage s'applique si la boutique est fermée ET que nous sommes sur une page restreinte
    const shouldLock = !isOpen && isRestrictedPage

    return (
        <SessionContext.Provider value={{ isOpen, sessionId, handleToggle, doToggle, loading, canCloseSession, showConfirm, setShowConfirm }}>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

                
                {/* Confirmation dialog — clôture only */}
                {showConfirm && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '24px'
                    }}>
                        <div style={{
                            background: '#fff', borderRadius: '20px',
                            padding: '32px', maxWidth: '420px', width: '100%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                            textAlign: 'center'
                        }}>
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: '#fce8e6', margin: '0 auto 20px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '2rem'
                            }}>🔒</div>
                            <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 800, color: '#1a1a2e' }}>
                                Clôturer la journée ?
                            </h2>
                            <p style={{ margin: '0 0 28px', fontSize: '0.95rem', color: '#666', lineHeight: 1.5 }}>
                                La caisse sera fermée et aucune vente ne pourra être enregistrée jusqu&apos;à la prochaine ouverture.
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    style={{
                                        flex: 1, padding: '14px', borderRadius: '12px',
                                        border: '2px solid #e0e0e0', background: '#fff',
                                        fontSize: '1rem', fontWeight: 700, cursor: 'pointer', color: '#444'
                                    }}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={doToggle}
                                    disabled={loading}
                                    style={{
                                        flex: 1, padding: '14px', borderRadius: '12px',
                                        border: 'none', background: '#ea4335',
                                        fontSize: '1rem', fontWeight: 800, cursor: 'pointer', color: '#fff',
                                        opacity: loading ? 0.7 : 1
                                    }}
                                >
                                    Oui, clôturer
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Feedback Modal (e.g. Day Closure summary) */}
                {renderFeedback()}

                {/* Overlay de verrouillage premium si shouldLock est true */}
                {shouldLock && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(26, 28, 26, 0.3)',
                        backdropFilter: 'blur(12px)',
                        padding: '24px',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <div style={{
                            background: '#ffffff',
                            borderRadius: '24px',
                            padding: '40px 32px',
                            maxWidth: '460px',
                            width: '100%',
                            boxShadow: 'var(--shadow-lg)',
                            textAlign: 'center',
                            border: '1px solid var(--color-border)',
                        }}>
                            <div style={{
                                width: '72px',
                                height: '72px',
                                borderRadius: '50%',
                                background: 'rgba(129, 84, 49, 0.1)',
                                margin: '0 auto 24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Lock color="var(--color-primary)" size={32} />
                            </div>

                            <h2 style={{
                                margin: '0 0 12px',
                                fontSize: '1.5rem',
                                fontWeight: 800,
                                color: 'var(--color-text)',
                                fontFamily: 'var(--font-display)',
                                letterSpacing: '-0.02em',
                            }}>
                                Boutique fermée
                            </h2>

                            <p style={{
                                margin: '0 0 32px',
                                fontSize: '0.95rem',
                                color: 'var(--color-muted)',
                                lineHeight: 1.6,
                                fontWeight: 500,
                            }}>
                                La caisse est actuellement fermée. Vous devez l&apos;ouvrir pour accéder aux fonctionnalités opérationnelles (ventes, commandes, inventaire et statistiques).
                            </p>

                            {canCloseSession ? (
                                <button
                                    onClick={doToggle}
                                    disabled={loading}
                                    style={{
                                        width: '100%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        minHeight: '48px',
                                        padding: '0 28px',
                                        background: 'var(--color-primary)',
                                        color: '#fff',
                                        fontWeight: 700,
                                        fontSize: '1rem',
                                        borderRadius: '9999px',
                                        border: 'none',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        boxShadow: 'var(--shadow-sm)',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        opacity: loading ? 0.7 : 1,
                                    }}
                                    onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)' }}
                                    onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            Ouverture de la caisse...
                                        </>
                                    ) : (
                                        'Ouvrir la caisse'
                                    )}
                                </button>
                            ) : (
                                <div style={{
                                    background: '#FEE2E2',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    border: '1px solid #FECACA',
                                    textAlign: 'center',
                                }}>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '0.875rem',
                                        color: '#991B1B',
                                        fontWeight: 600,
                                    }}>
                                        Seul un gérant ou un vendeur peut ouvrir la caisse et démarrer la journée.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Content wrapper with disabled visual state ONLY if shouldLock is true */}
                <div style={{ 
                    flex: 1, 
                    transition: 'opacity 0.3s, filter 0.3s',
                    opacity: shouldLock ? 0.6 : 1, 
                    pointerEvents: shouldLock ? 'none' : 'auto',
                    filter: shouldLock ? 'blur(5px) grayscale(0.5)' : 'none'
                }}>
                    {children}
                </div>
            </div>
        </SessionContext.Provider>
    )
}
