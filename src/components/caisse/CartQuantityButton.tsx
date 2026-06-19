'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, Trash2, Calculator } from 'lucide-react'
import NumPad from '@/components/ui/NumPad'

interface CartQuantityButtonProps {
    qty: number
    productName: string
    onChange: (newQty: number) => void
    onRemove: () => void
}

export default function CartQuantityButton({ qty, productName, onChange, onRemove }: CartQuantityButtonProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [showNumPad, setShowNumPad] = useState(false)
    const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setCoords({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
        }
        setIsOpen(true)
    }

    const handleSelect = (e: React.MouseEvent, newQty: number) => {
        e.preventDefault()
        e.stopPropagation()
        setIsOpen(false)
        if (newQty === 0) onRemove()
        else onChange(newQty)
    }

    const openNumPad = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsOpen(false)
        setShowNumPad(true)
    }

    return (
        <>
            <button
                ref={triggerRef}
                onClick={handleTriggerClick}
                aria-label={`Modifier quantité pour ${productName}. Actuellement ${qty}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    minWidth: '64px',
                    minHeight: '40px',
                    borderRadius: '12px',
                    border: '1.5px solid var(--color-caisse-border)',
                    background: 'white',
                    color: '#2D1B0E',
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    justifyContent: 'center'
                }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; e.currentTarget.style.background = '#FEF3EC' }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'white' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'white' }}
            >
                {qty}
                <ChevronUp size={16} style={{ color: '#C4836A' }} />
            </button>

            {/* Popover */}
            {isOpen && coords && (() => {
                const showDownward = coords.top < 380;
                return createPortal(
                    <>
                        <div
                            style={{ position: 'fixed', inset: 0, zIndex: 1999 }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(false) }}
                        />
                        <div style={{
                            position: 'fixed',
                            ...(showDownward
                                ? { top: `${coords.top + coords.height + 8}px` }
                                : { bottom: `${window.innerHeight - coords.top + 8}px` }
                            ),
                            right: `${window.innerWidth - (coords.left + coords.width)}px`, // Align to right
                            minWidth: '140px',
                            background: 'white',
                            border: '1px solid #E5DDD5',
                            borderRadius: '16px',
                            boxShadow: '0 10px 40px rgba(45, 27, 14, 0.12)',
                            zIndex: 2000,
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            animation: showDownward
                                ? 'popoverFadeInDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                                : 'popoverFadeInUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}>
                            {[1, 2, 3, 4, 5, 6].map(num => (
                            <button
                                key={num}
                                onClick={(e) => handleSelect(e, num)}
                                style={{
                                    padding: '12px 16px',
                                    fontSize: '1.1rem',
                                    fontWeight: 700,
                                    background: qty === num ? '#FEF3EC' : 'transparent',
                                    color: qty === num ? '#D97757' : '#2D1B0E',
                                    borderRadius: '10px',
                                    border: 'none',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {num}
                            </button>
                        ))}
                        
                        <div style={{ height: '1px', background: '#E5DDD5', margin: '4px 0' }} />
                        
                        <button
                            onClick={openNumPad}
                            style={{
                                padding: '12px 16px',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                background: 'transparent',
                                color: '#9C8070',
                                borderRadius: '10px',
                                border: 'none',
                                textAlign: 'center',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            <Calculator size={16} /> Autre...
                        </button>
                        
                        <button
                            onClick={(e) => handleSelect(e, 0)}
                            style={{
                                padding: '12px 16px',
                                fontSize: '0.9rem',
                                fontWeight: 700,
                                background: '#FFF5F5',
                                color: '#EF4444',
                                borderRadius: '10px',
                                border: 'none',
                                textAlign: 'center',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            <Trash2 size={16} /> Retirer
                        </button>
                    </div>
                    <style>{`
                        @keyframes popoverFadeInUp {
                            from { transform: scale(0.95) translateY(10px); opacity: 0; }
                            to { transform: scale(1) translateY(0); opacity: 1; }
                        }
                        @keyframes popoverFadeInDown {
                            from { transform: scale(0.95) translateY(-10px); opacity: 0; }
                            to { transform: scale(1) translateY(0); opacity: 1; }
                        }
                    `}</style>
                </>,
                document.body
               );
            })()}

            {showNumPad && (
                <NumPad
                    initialValue={qty.toString()}
                    title={`Quantité : ${productName}`}
                    allowDecimal={false}
                    maxLength={4}
                    onConfirm={(val) => {
                        const newQty = Math.max(1, parseInt(val) || 1)
                        onChange(newQty)
                        setShowNumPad(false)
                    }}
                    onCancel={() => setShowNumPad(false)}
                />
            )}
        </>
    )
}
