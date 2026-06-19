'use client'

import { Loader2, DoorOpen, DoorClosed } from 'lucide-react'
import { useSession } from '@/components/layout/SessionMaster'

/**
 * SessionPill — Capsule compacte d'état de session.
 * Affiche le statut Boutique Ouverte/Fermée + bouton action Ouvrir/Clôturer.
 * S'intègre dans le header de n'importe quelle page restreinte.
 */
export default function SessionPill() {
    const {
        isOpen,
        handleToggle,
        doToggle,
        loading,
        canCloseSession,
        showConfirm,
        setShowConfirm,
    } = useSession()

    return (
        <>
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: isOpen ? '#e6f4ea' : '#fce8e6',
                border: isOpen ? '1.5px solid #34a853' : '1.5px solid #ea4335',
                borderRadius: '99px',
                padding: '5px 6px 5px 10px',
                flexShrink: 0,
            }}>
                {/* Icône + label état */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: isOpen ? '#ceead6' : '#fad2cf',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        {isOpen
                            ? <DoorOpen color="#1e8e3e" size={13} />
                            : <DoorClosed color="#d93025" size={13} />
                        }
                    </div>
                    <span style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: isOpen ? '#137333' : '#b31412',
                        whiteSpace: 'nowrap',
                    }}>
                        {isOpen ? 'Boutique ouverte' : 'Boutique fermée'}
                    </span>
                </div>

                {/* Séparateur */}
                <div style={{ width: '1px', height: '16px', background: isOpen ? '#34a85344' : '#ea433544', margin: '0 2px' }} />

                {/* Bouton action */}
                <button
                    onClick={handleToggle}
                    disabled={loading || (isOpen && !canCloseSession)}
                    style={{
                        background: isOpen ? '#ea4335' : '#34a853',
                        color: 'white',
                        border: 'none',
                        padding: '4px 12px',
                        borderRadius: '99px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: loading || (isOpen && !canCloseSession) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: loading || (isOpen && !canCloseSession) ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                        transition: 'opacity 0.2s, transform 0.1s',
                        lineHeight: 1,
                        height: '26px',
                    }}
                    onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.94)' }}
                    onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                >
                    {loading && <Loader2 size={11} className="animate-spin" />}
                    {isOpen
                        ? (canCloseSession ? 'Clôturer' : 'Réservé')
                        : 'Ouvrir'
                    }
                </button>
            </div>

            {/* Modale de confirmation de clôture */}
            {showConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '24px',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '20px',
                        padding: '32px', maxWidth: '420px', width: '100%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: '#fce8e6', margin: '0 auto 20px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '2rem',
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
                                    fontSize: '1rem', fontWeight: 700, cursor: 'pointer', color: '#444',
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
                                    opacity: loading ? 0.7 : 1,
                                }}
                            >
                                Oui, clôturer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
