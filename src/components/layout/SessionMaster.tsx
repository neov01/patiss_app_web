'use client'

import { createContext, useContext, useState } from 'react'
import { toggleSession } from '@/lib/actions/sessions'
import { toast } from 'sonner'
import { Loader2, DoorOpen, DoorClosed } from 'lucide-react'
import { usePathname } from 'next/navigation'

type SessionContextType = {
    isOpen: boolean;
    sessionId: string | null;
}

const SessionContext = createContext<SessionContextType>({ isOpen: false, sessionId: null })

export function useSession() {
    return useContext(SessionContext)
}

export default function SessionMaster({ 
    children, 
    initialSession, 
    orgId, 
    userId,
    role
}: { 
    children: React.ReactNode, 
    initialSession: any, 
    orgId: string, 
    userId: string,
    role: string
}) {
    const [loading, setLoading] = useState(false)
    const pathname = usePathname()
    const isOpen = !!initialSession
    const sessionId = initialSession?.id || null

    const handleToggle = async () => {
        setLoading(true)
        const res = await toggleSession(orgId, userId, sessionId)
        if (res.success) {
            toast.success(isOpen ? 'Caisse clôturée avec succès' : 'Caisse ouverte, bonne journée !')
        } else {
            toast.error(res.error || "Erreur lors du changement d'état")
        }
        setLoading(false)
    }

    // List of pages that should be locked when the session is closed
    const isRestrictedPage = pathname === '/dashboard' || pathname.startsWith('/commandes')
    
    // We apply the lock only if the boutique is closed AND we are on a restricted page
    const shouldLock = !isOpen && isRestrictedPage

    return (
        <SessionContext.Provider value={{ isOpen, sessionId }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* We only show the status banner on restricted pages to keep other pages clean */}
                {isRestrictedPage && (
                    <div style={{ 
                        padding: '16px 24px', 
                        marginBottom: '24px', 
                        background: isOpen ? '#e6f4ea' : '#fce8e6', 
                        borderRadius: '16px',
                        border: isOpen ? '2px solid #34a853' : '2px solid #ea4335',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        flexWrap: 'wrap',
                        gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: isOpen ? '#ceead6' : '#fad2cf',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {isOpen ? <DoorOpen color="#1e8e3e" size={28} /> : <DoorClosed color="#d93025" size={28} />}
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', color: isOpen ? '#137333' : '#b31412', fontWeight: 800 }}>
                                    {isOpen ? 'Boutique Ouverte' : 'Boutique Fermée'}
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: isOpen ? '#1e8e3e' : '#d93025', fontWeight: 500 }}>
                                    {isOpen ? 'Les ventes et opérations sont autorisées.' : 'La caisse est fermée. Aucune opération possible.'}
                                </p>
                            </div>
                        </div>
                        
                        <button 
                            onClick={handleToggle} 
                            disabled={loading}
                            style={{
                                background: isOpen ? '#ea4335' : '#34a853',
                                color: 'white',
                                border: 'none',
                                padding: '14px 28px',
                                borderRadius: '12px',
                                fontSize: '1rem',
                                fontWeight: 800,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                transition: 'transform 0.1s, opacity 0.2s',
                                opacity: loading ? 0.7 : 1,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                            onMouseDown={e => { if(!loading) e.currentTarget.style.transform = 'scale(0.96)' }}
                            onMouseUp={e => { if(!loading) e.currentTarget.style.transform = 'scale(1)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                        >
                            {loading && <Loader2 size={20} className="animate-spin" />}
                            {isOpen ? 'CLÔTURER LA JOURNÉE' : 'OUVRIR LA CAISSE'}
                        </button>
                    </div>
                )}
                
                {/* Content wrapper with disabled visual state ONLY if shouldLock is true */}
                <div style={{ 
                    flex: 1, 
                    transition: 'opacity 0.3s, filter 0.3s',
                    opacity: shouldLock ? 0.5 : 1, 
                    pointerEvents: shouldLock ? 'none' : 'auto',
                    filter: shouldLock ? 'grayscale(0.8)' : 'none'
                }}>
                    {children}
                </div>
            </div>
        </SessionContext.Provider>
    )
}
