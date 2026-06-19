'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronRight } from 'lucide-react'

interface Option {
    value: string
    label: string
    icon?: string
}

interface TouchSelectProps {
    value: string
    onChange: (value: string) => void
    options: Option[]
    placeholder?: string
    title?: string
    style?: React.CSSProperties
    hasError?: boolean
    direction?: 'modal' | 'up'
}

export default function TouchSelect({
    value,
    onChange,
    options,
    placeholder = 'Sélectionner...',
    title = 'Sélection',
    style,
    hasError = false,
    direction = 'modal'
}: TouchSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
    const triggerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const timer = window.setTimeout(() => setIsMounted(true), 0)
        return () => window.clearTimeout(timer)
    }, [])

    const selectedOption = options.find(opt => opt.value === value)

    const handleSelect = (val: string) => {
        onChange(val)
        setIsOpen(false)
    }

    const handleTriggerClick = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setCoords({
                top: rect.top,
                left: rect.left,
                width: rect.width
            })
        }
        setIsOpen(true)
    }

    if (!isMounted) return null

    return (
        <>
            <div
                ref={triggerRef}
                onClick={handleTriggerClick}
                className={`input ${hasError ? 'has-error' : ''}`}
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '44px',
                    userSelect: 'none',
                    background: hasError ? '#FFF5F5' : '#fff',
                    border: hasError ? '1.5px solid var(--color-error)' : '1.5px solid transparent',
                    ...style
                }}
            >
                <span style={{ 
                    color: selectedOption ? 'var(--color-text)' : 'var(--color-muted)', 
                    fontWeight: selectedOption ? 700 : 500,
                    fontSize: '0.95rem'
                }}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronRight size={18} style={{ color: 'var(--color-muted)', opacity: 0.5 }} />
            </div>

            {/* Upward Popover Variant */}
            {isOpen && direction === 'up' && coords && createPortal(
                <>
                    <div 
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 1999,
                            background: 'transparent'
                        }} 
                        onClick={() => setIsOpen(false)} 
                    />

                    <div style={{
                        position: 'fixed',
                        bottom: `${window.innerHeight - coords.top + 8}px`,
                        left: `${coords.left}px`,
                        width: `${coords.width}px`,
                        maxHeight: '260px',
                        overflowY: 'auto',
                        background: 'white',
                        border: '1.5px solid var(--color-border)',
                        borderRadius: '16px',
                        boxShadow: 'var(--shadow-md)',
                        zIndex: 2000,
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        animation: 'popoverFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        scrollbarWidth: 'thin'
                    }}>
                        {options.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleSelect(opt.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    fontSize: '0.9rem',
                                    fontWeight: 700,
                                    background: value === opt.value ? 'var(--color-well)' : 'transparent',
                                    color: value === opt.value ? 'var(--color-primary)' : 'var(--color-text)',
                                    borderRadius: '10px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    textAlign: 'left'
                                }}
                                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                className="hover:bg-[rgba(129,84,49,0.05)]"
                            >
                                {opt.icon && <span style={{ fontSize: '1.1rem' }}>{opt.icon}</span>}
                                <span style={{ flex: 1 }}>{opt.label}</span>
                                {value === opt.value && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }} />}
                            </button>
                        ))}
                    </div>

                    <style>{`
                        @keyframes popoverFadeIn {
                            from { transform: scale(0.95) translateY(5px); opacity: 0; }
                            to { transform: scale(1) translateY(0); opacity: 1; }
                        }
                    `}</style>
                </>,
                document.body
            )}

            {/* Modal Dialog Variant */}
            {isOpen && direction === 'modal' && createPortal(
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 2000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    background: 'rgba(45, 27, 14, 0.4)',
                    backdropFilter: 'blur(8px)'
                }} onClick={() => setIsOpen(false)}>
                    <div style={{
                        background: 'white',
                        borderRadius: '28px',
                        padding: '24px',
                        width: '100%',
                        maxWidth: '400px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>{title}</h3>
                            <button onClick={() => setIsOpen(false)} style={{ background: '#FDF8F3', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {options.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleSelect(opt.value)}
                                    style={{
                                        width: '100%',
                                        padding: '16px 20px',
                                        fontSize: '1.1rem',
                                        fontWeight: 700,
                                        background: value === opt.value ? 'var(--color-well)' : 'white',
                                        color: value === opt.value ? '#D97757' : 'var(--color-text)',
                                        borderRadius: '16px',
                                        border: `2px solid ${value === opt.value ? '#D97757' : '#F3F0EE'}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        textAlign: 'left'
                                    }}
                                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    {opt.icon && <span style={{ fontSize: '1.4rem' }}>{opt.icon}</span>}
                                    <span style={{ flex: 1 }}>{opt.label}</span>
                                    {value === opt.value && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97757' }} />}
                                </button>
                            ))}
                        </div>

                        <button 
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="btn-ghost"
                            style={{ 
                                width: '100%', 
                                padding: '14px', 
                                borderRadius: '16px', 
                                fontWeight: 700,
                                color: 'var(--color-muted)'
                            }}
                        >
                            Fermer
                        </button>
                    </div>

                    <style>{`
                        @keyframes scaleIn {
                            from { transform: scale(0.95); opacity: 0; }
                            to { transform: scale(1); opacity: 1; }
                        }
                    `}</style>
                </div>,
                document.body
            )}
        </>
    )
}
