'use client'

import { useSession } from '@/components/layout/SessionMaster'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logoutKiosk } from '@/lib/actions/auth'
import { toast } from 'sonner'
import { Store, Eye, LogOut, Lock, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function CaisseStatutPage() {
    const { isOpen, doToggle, loading, role, setConsultationMode } = useSession()
    const router = useRouter()
    const [loggingOut, setLoggingOut] = useState(false)

    // Rediriger vers la caisse si elle s'avère ouverte
    if (isOpen) {
        router.replace('/caisse')
        return null
    }

    const isManagerOrAdmin = role === 'gerant' || role === 'super_admin'
    const canOpenSession = role === 'gerant' || role === 'super_admin' || role === 'vendeur'

    const handleEnterConsultation = () => {
        setConsultationMode(true)
        localStorage.setItem('isConsultationMode', 'true')
        toast.info('Mode consultation activé. Navigation en lecture seule.')
        router.push('/dashboard')
    }

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
            await logoutKiosk()
            const supabase = createClient()
            await supabase.auth.signOut()
            toast.success('Déconnexion réussie')
            router.push('/login')
            router.refresh()
        } catch (err: unknown) {
            toast.error('Erreur lors de la déconnexion')
            setLoggingOut(false)
        }
    }

    return (
        <div className="min-h-[70vh] flex items-center justify-center p-6 animate-fadeIn">
            
            {/* Carte épurée, plate et apaisée */}
            <div 
                className="w-full max-w-md bg-white rounded-lg p-8 md:p-10 border border-outline/10"
                style={{
                    boxShadow: '0 4px 20px rgba(129, 84, 49, 0.02), 0 1px 3px rgba(0, 0, 0, 0.02)'
                }}
            >
                <div className="text-center">
                    
                    {/* Icône Cadenas Muted */}
                    <div className="text-muted/60 mb-6 flex justify-center">
                        <Lock size={28} className="stroke-[1.5]" />
                    </div>

                    <h1 className="font-display font-extrabold text-xl md:text-2xl text-on-background tracking-tight mb-2">
                        Caisse clôturée
                    </h1>
                    
                    <p className="text-muted text-xs md:text-sm leading-relaxed mb-8 max-w-[280px] mx-auto">
                        La caisse est actuellement fermée. Vous devez l&apos;ouvrir pour pouvoir réaliser des ventes et enregistrer des commandes.
                    </p>

                    {/* Actions épurées avec contrastes de survol clairs */}
                    <div className="space-y-3">
                        
                        {/* 1. Ouvrir la caisse (si autorisé) */}
                        {canOpenSession ? (
                            <button
                                onClick={doToggle}
                                disabled={loading || loggingOut}
                                className="btn-primary w-full flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Ouverture...
                                    </>
                                ) : (
                                    <>
                                        <Store size={16} />
                                        Ouvrir la caisse
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="bg-error-container text-on-error-container text-xs font-semibold rounded-md p-4 border border-error/10">
                                Seul un gérant ou un vendeur peut ouvrir la caisse.
                            </div>
                        )}

                        {/* 2. Mode Consultation (Bouton neutre, devient vert au survol) */}
                        {isManagerOrAdmin && (
                            <button
                                onClick={handleEnterConsultation}
                                disabled={loading || loggingOut}
                                className="w-full flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full border border-outline/25 bg-white text-on-background font-bold text-sm hover:bg-secondary-container hover:text-on-secondary-container hover:border-secondary hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/50"
                            >
                                <Eye size={16} />
                                Accéder au Back-Office (Mode Consultation)
                            </button>
                        )}

                        {/* 3. Se déconnecter (Bouton textuel, devient rouge au survol) */}
                        <button
                            onClick={handleLogout}
                            disabled={loading || loggingOut}
                            className="w-full flex items-center justify-center gap-1.5 py-3 px-4 rounded-full text-muted hover:text-on-error-container hover:bg-error-container active:scale-[0.99] transition-all text-xs font-bold mt-2 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-error/50"
                        >
                            {loggingOut ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" />
                                    Déconnexion...
                                </>
                            ) : (
                                <>
                                    <LogOut size={12} />
                                    Se déconnecter
                                </>
                            )}
                        </button>
                        
                    </div>
                </div>
            </div>
        </div>
    )
}
