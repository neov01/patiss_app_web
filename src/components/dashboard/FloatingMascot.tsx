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
                    boxShadow: 'var(--shadow-md)',
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
                        height: 'min(500px, calc(100dvh - 174px))',
                        zIndex: 45,
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        boxShadow: 'var(--shadow-lg)',
                    }}
                >
                    <AIAssistant currency={currency} organizationId={organizationId} userRole={userRole} />
                </div>
            )}

            <style jsx>{`
                .floating-mascot-button {
                    bottom: 90px;
                }
                .floating-mascot-panel {
                    bottom: 154px;
                }
                @media (max-width: 767px) {
                    .floating-mascot-button {
                        bottom: 90px;
                    }
                    .floating-mascot-panel {
                        bottom: 154px;
                    }
                }
                .floating-mascot-panel :global(.card) {
                    height: 100% !important;
                }
            `}</style>
        </>
    )
}
