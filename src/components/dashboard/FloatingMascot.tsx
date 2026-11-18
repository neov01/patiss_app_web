'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
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
    // Sur la caisse, Croustik reste accessible mais quitte la zone d'encaissement
    // (montant « À encaisser » et bouton Encaisser) et ne pulse pas.
    const onCaisse = usePathname() === '/caisse'

    return (
        <>
            <button
                onClick={() => setOpen(v => !v)}
                aria-label="Ouvrir Croustik, l'assistant comptable IA"
                className={`floating-mascot-button${onCaisse ? ' is-caisse' : ''}`}
                style={{
                    position: 'fixed',
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
                    animation: open || onCaisse ? 'none' : 'floating-mascot-pulse 2s ease-in-out infinite',
                }}
            >
                <Image src={getMascotImagePath('greeting')} alt="" width={44} height={44} />
            </button>

            {open && (
                <div
                    className={`floating-mascot-panel${onCaisse ? ' is-caisse' : ''}`}
                    style={{
                        position: 'fixed',
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
                    right: 20px;
                    bottom: 90px;
                }
                .floating-mascot-panel {
                    right: 20px;
                    bottom: 154px;
                }
                /* Caisse desktop : coin bas-droit de la colonne produits,
                   à gauche du panier (380px) et du padding de main (16px). */
                @media (min-width: 901px) {
                    .floating-mascot-button.is-caisse {
                        right: 412px;
                        bottom: 32px;
                    }
                    .floating-mascot-panel.is-caisse {
                        right: 412px;
                        bottom: 96px;
                    }
                }
                /* Caisse mobile : à gauche, à l'opposé du bouton « Nouvelle commande ». */
                @media (max-width: 900px) {
                    .floating-mascot-button.is-caisse {
                        right: auto;
                        left: 16px;
                    }
                    .floating-mascot-panel.is-caisse {
                        right: auto;
                        left: 16px;
                    }
                }
                .floating-mascot-panel :global(.card) {
                    height: 100% !important;
                }
            `}</style>
        </>
    )
}
