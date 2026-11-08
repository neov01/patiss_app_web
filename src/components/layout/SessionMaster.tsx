'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { closeCurrentSession, openSession } from '@/lib/actions/sessions'
import { getWeeklyBilanPreviewAction, weeklyExpenseClosingAction } from '@/lib/actions/expenses'
import type { WeeklyBilanPreview } from '@/lib/schemas/expenses'
import WeeklyBilanSummary from '@/components/depenses/WeeklyBilanSummary'
import { useCurrency } from '@/providers/CurrencyProvider'
import { toast } from 'sonner'
import { usePathname, useRouter } from 'next/navigation'
import { useActionFeedback } from '@/hooks/useActionFeedback'

type SessionContextType = {
    isOpen: boolean;
    sessionId: string | null;
    handleToggle: () => void;
    doToggle: () => Promise<void>;
    loading: boolean;
    canCloseSession: boolean;
    showConfirm: boolean;
    setShowConfirm: (v: boolean) => void;
    isConsultationMode: boolean;
    setConsultationMode: (v: boolean) => void;
    role: string;
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
    isConsultationMode: false,
    setConsultationMode: () => {},
    role: '',
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
    const [isConsultationModeState, setConsultationModeState] = useState(false)
    const { execute, renderFeedback } = useActionFeedback()
    const { currency } = useCurrency()
    // Bilan hebdomadaire de la régie, proposé à la clôture du dernier jour de la semaine
    const [bilanPreview, setBilanPreview] = useState<WeeklyBilanPreview | null>(null)
    const [bilanLoading, setBilanLoading] = useState(false)
    const pathname = usePathname()
    const router = useRouter()
    const isOpen = !!initialSession
    const sessionId = initialSession?.id || null
    const canCloseSession = role === 'gerant' || role === 'super_admin' || role === 'vendeur'

    // Charger le mode consultation depuis localStorage après hydratation
    useEffect(() => {
        const stored = localStorage.getItem('isConsultationMode')
        if (stored === 'true') {
            setTimeout(() => {
                setConsultationModeState(true)
            }, 0)
        }
    }, [])

    const isConsultationMode = !isOpen && isConsultationModeState

    const setConsultationMode = (val: boolean) => {
        setConsultationModeState(val)
        if (val) {
            localStorage.setItem('isConsultationMode', 'true')
        } else {
            localStorage.removeItem('isConsultationMode')
        }
    }

    // Si la session s'ouvre, réinitialiser le localStorage
    useEffect(() => {
        if (isOpen) {
            localStorage.removeItem('isConsultationMode')
        }
    }, [isOpen])

    const handleToggle = () => {
        if (isOpen) {
            if (!canCloseSession) {
                toast.error('Seul un gérant ou un vendeur peut clôturer la caisse')
                return
            }
            setShowConfirm(true)
            loadBilanPreview()
        } else {
            doToggle()
        }
    }

    const loadBilanPreview = async () => {
        setBilanPreview(null)
        setBilanLoading(true)
        try {
            const res = await getWeeklyBilanPreviewAction()
            // Pas de bilan possible (hors dimanche, erreur, caisse fermée) : clôture simple
            if (res.success && res.preview?.isDue && res.preview.hasOpenSalesSession) {
                setBilanPreview(res.preview)
            }
        } finally {
            setBilanLoading(false)
        }
    }

    const doToggle = () => runToggle(false)

    const runToggle = async (withBilan: boolean) => {
        const preview = withBilan ? bilanPreview : null
        setShowConfirm(false)
        setLoading(true)
        if (isOpen) {
            await execute(async () => {
                // 1. Bilan de la semaine d'abord : la sortie de recharge doit figurer
                //    dans les totaux de la journée qu'on clôture ensuite.
                if (preview) {
                    const bilan = await weeklyExpenseClosingAction({ cycle_id: preview.cycleId })
                    if (!bilan.success) {
                        throw new Error(bilan.error || 'Erreur lors du bilan de la semaine')
                    }
                }
                // 2. Clôture de la journée. En cas d'échec, la caisse reste ouverte
                //    et le bilan déjà fait n'est pas rejoué.
                const res = await closeCurrentSession()
                if (!res.success) {
                    throw new Error(res.error || 'Erreur lors de la clôture')
                }
                return res.session
            }, {
                type: 'modal',
                modalTitle: preview ? 'Semaine et journée clôturées' : 'Journée clôturée avec succès',
                modalDescription: preview
                    ? `Recharge de ${new Intl.NumberFormat('fr-FR').format(preview.recharge)} ${currency} enregistrée. La nouvelle semaine démarre à ${new Intl.NumberFormat('fr-FR').format(preview.budget)} ${currency}.`
                    : 'Les ventes du jour ont été enregistrées.',
                onSuccess: () => {
                    localStorage.removeItem('isConsultationMode')
                    setConsultationMode(false)
                    router.refresh()
                    router.push('/caisse/statut')
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
                    localStorage.removeItem('isConsultationMode')
                    setConsultationMode(false)
                    router.refresh()
                    router.push('/caisse')
                    setLoading(false)
                },
                onError: () => {
                    setLoading(false)
                }
            })
        }
    }

    // Zones restreintes lorsque la caisse est fermée (hors statut)
    const isRestrictedPage = 
        (pathname.startsWith('/dashboard') || 
        pathname.startsWith('/caisse') || 
        pathname.startsWith('/commandes') ||
        pathname.startsWith('/inventaire')) &&
        pathname !== '/caisse/statut'
    
    // Si la caisse est fermée, qu'on est sur une page restreinte, et qu'on n'est pas en mode consultation -> redirection
    const shouldRedirect = !isOpen && isRestrictedPage && !isConsultationMode

    useEffect(() => {
        if (shouldRedirect) {
            router.replace('/caisse/statut')
        }
    }, [shouldRedirect, router])

    return (
        <SessionContext.Provider value={{ 
            isOpen, 
            sessionId, 
            handleToggle, 
            doToggle, 
            loading, 
            canCloseSession, 
            showConfirm, 
            setShowConfirm,
            isConsultationMode,
            setConsultationMode,
            role
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

                {/* Bandeau persistant orange en Mode Consultation */}
                {!isOpen && isConsultationMode && (
                    <div style={{
                        background: '#FFFBEB',
                        borderBottom: '1px solid #FDE68A',
                        padding: '12px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'between',
                        gap: '16px',
                        color: '#92400E',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            <span style={{
                                display: 'inline-block',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#F59E0B',
                                boxShadow: '0 0 8px #F59E0B'
                            }} />
                            <span>
                                <strong>Caisse clôturée</strong> — Mode consultation uniquement. Les fonctions d&apos;encaissement sont désactivées.
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setConsultationMode(false)
                                localStorage.removeItem('isConsultationMode')
                                router.push('/caisse/statut')
                            }}
                            style={{
                                background: '#FEF3C7',
                                border: 'none',
                                color: '#78350F',
                                padding: '6px 12px',
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#FDE68A'}
                            onMouseLeave={e => e.currentTarget.style.background = '#FEF3C7'}
                        >
                            Quitter le mode consultation
                        </button>
                    </div>
                )}
                
                {/* Confirmation dialog — clôture only (unique pour toute l'app) */}
                {showConfirm && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '16px'
                    }}>
                        <div style={{
                            background: '#fff', borderRadius: '20px',
                            padding: '28px', maxWidth: bilanPreview ? '520px' : '420px', width: '100%',
                            maxHeight: '92vh', overflowY: 'auto',
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
                                {bilanPreview ? 'Clôturer la journée et la semaine ?' : 'Clôturer la journée ?'}
                            </h2>
                            <p style={{ margin: '0 0 20px', fontSize: '0.95rem', color: '#666', lineHeight: 1.5 }}>
                                La caisse sera fermée et aucune vente ne pourra être enregistrée jusqu&apos;à la prochaine ouverture.
                            </p>

                            {bilanLoading && (
                                <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#83746B' }}>
                                    Vérification du bilan de la semaine…
                                </p>
                            )}

                            {bilanPreview && (
                                <div style={{ marginBottom: '20px' }}>
                                    <WeeklyBilanSummary preview={bilanPreview} currency={currency} />
                                </div>
                            )}

                            {bilanPreview ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <button
                                        onClick={() => runToggle(true)}
                                        disabled={loading}
                                        style={{
                                            minHeight: '52px', padding: '12px', borderRadius: '12px',
                                            border: 'none', background: '#815431',
                                            fontSize: '1rem', fontWeight: 800, cursor: 'pointer', color: '#fff',
                                            opacity: loading ? 0.7 : 1
                                        }}
                                    >
                                        Valider le bilan et clôturer la journée
                                    </button>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            onClick={() => setShowConfirm(false)}
                                            style={{
                                                flex: 1, minHeight: '48px', borderRadius: '12px',
                                                border: '2px solid #e0e0e0', background: '#fff',
                                                fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', color: '#444'
                                            }}
                                        >
                                            Annuler
                                        </button>
                                        <button
                                            onClick={() => runToggle(false)}
                                            disabled={loading}
                                            style={{
                                                flex: 1, minHeight: '48px', borderRadius: '12px',
                                                border: '2px solid #e0e0e0', background: '#fff',
                                                fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', color: '#51443C',
                                                opacity: loading ? 0.7 : 1
                                            }}
                                        >
                                            Clôturer sans bilan
                                        </button>
                                    </div>
                                </div>
                            ) : (
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
                                        onClick={() => runToggle(false)}
                                        disabled={loading || bilanLoading}
                                        style={{
                                            flex: 1, padding: '14px', borderRadius: '12px',
                                            border: 'none', background: '#ea4335',
                                            fontSize: '1rem', fontWeight: 800, cursor: 'pointer', color: '#fff',
                                            opacity: loading || bilanLoading ? 0.7 : 1
                                        }}
                                    >
                                        Oui, clôturer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Action Feedback Modal (e.g. Day Closure summary) */}
                {renderFeedback()}

                {/* Content wrapper with disabled visual state ONLY if redirection is pending */}
                <div style={{ 
                    flex: 1, 
                    transition: 'opacity 0.3s, filter 0.3s',
                    opacity: shouldRedirect ? 0.4 : 1, 
                    pointerEvents: shouldRedirect ? 'none' : 'auto',
                    filter: shouldRedirect ? 'blur(6px) grayscale(0.6)' : 'none'
                }}>
                    {children}
                </div>
            </div>
        </SessionContext.Provider>
    )
}
