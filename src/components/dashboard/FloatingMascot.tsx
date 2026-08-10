'use client'

import { useState } from 'react'
import Image from 'next/image'
import AIAssistant from './AIAssistant'
import { getMascotImagePath } from '@/lib/domain/mascot'

interface Props {
    currency: string
    organizationId: string
    userRole?: string
}

export default function FloatingMascot({ currency, organizationId, userRole }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setOpen(v => !v)}
                aria-label="Ouvrir Croustik, l'assistant comptable IA"
                className="floating-mascot-button"
                style={{
                    position: 'fixed',
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 45,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    padding: 0,
                    animation: open ? 'none' : 'floating-mascot-pulse 2s ease-in-out infinite',
                }}
            >
                <Image src={getMascotImagePath('greeting')} alt="" width={44} height={44} />
            </button>

            {open && (
                <div
                    className="floating-mascot-panel"
                    style={{
                        position: 'fixed',
                        right: '20px',
                        width: 'min(360px, calc(100vw - 40px))',
                        zIndex: 45,
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
                    }}
                >
                    <AIAssistant currency={currency} organizationId={organizationId} userRole={userRole} />
                </div>
            )}

            <style jsx>{`
                .floating-mascot-button {
                    bottom: 20px;
                }
                .floating-mascot-panel {
                    bottom: 84px;
                }
                @keyframes floating-mascot-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                @media (max-width: 767px) {
                    .floating-mascot-button {
                        bottom: 90px;
                    }
                    .floating-mascot-panel {
                        bottom: 154px;
                    }
                }
            `}</style>
        </>
    )
}
