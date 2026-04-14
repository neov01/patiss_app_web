'use client'

import { useState, useEffect } from 'react'
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
}

export default function TouchSelect({
    value,
    onChange,
    options,
    placeholder = 'Sélectionner...',
    title = 'Sélection',
    style
}: TouchSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const selectedOption = options.find(opt => opt.value === value)

    const handleSelect = (val: string) => {
        onChange(val)
        setIsOpen(false)
    }

    if (!isMounted) return null

    return (
        <>
            <div
                onClick={() => setIsOpen(true)}
                className="input"
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '44px',
                    userSelect: 'none',
                    background: '#fff',
                    ...style
                }}
            >
                <span style={{ 
                    color: selectedOption ? '#2D1B0E' : '#9C8070', 
                    fontWeight: selectedOption ? 700 : 500,
                    fontSize: '0.95rem'
                }}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronRight size={18} style={{ color: '#9C8070', opacity: 0.5 }} />
            </div>

            {isOpen && createPortal(
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
                        animation: 'scaleIn 0.3s cubic-bezier(.22, .68, 0, 1.2)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2D1B0E', margin: 0 }}>{title}</h3>
                            <button onClick={() => setIsOpen(false)} style={{ background: '#FDF8F3', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C8070' }}>
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
                                        background: value === opt.value ? '#FEF3EC' : 'white',
                                        color: value === opt.value ? '#D97757' : '#2D1B0E',
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
                                color: '#9C8070'
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
