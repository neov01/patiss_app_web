'use client'

import { useState, useEffect, useCallback } from 'react'
import { Delete, Check, X } from 'lucide-react'

interface NumPadProps {
    initialValue: string
    onConfirm: (value: string) => void
    onCancel: () => void
    title?: string
    isPassword?: boolean
    allowDecimal?: boolean
    maxLength?: number
    isPhone?: boolean
}

export default function NumPad({
    initialValue,
    onConfirm,
    onCancel,
    title = 'Saisie numérique',
    isPassword = false,
    allowDecimal = false,
    maxLength,
    isPhone = false
}: NumPadProps) {
    const [value, setValue] = useState(initialValue)

    const handleNumber = useCallback((num: string) => {
        if (maxLength && value.length >= maxLength) return

        // Prevent multiple decimals
        if (num === '.' && value.includes('.')) return

        // Handle leading zeros for standard numeric values (prevents 00123 -> 123)
        // But ALLOW leading zeros for Phone numbers, Passwords (PINs) or when a specific length is expected
        let newVal = value + num
        const isSpecialInput = isPhone || isPassword || !!maxLength
        if (!isSpecialInput && newVal.startsWith('0') && newVal.length > 1 && num !== '.') {
            newVal = newVal.replace(/^0+/, '')
        }

        setValue(newVal)
    }, [value, maxLength])

    const handleDelete = useCallback(() => {
        setValue(prev => prev.slice(0, -1))
    }, [])

    const handleClear = useCallback(() => {
        setValue('')
    }, [])

    // Support physical keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') handleNumber(e.key)
            if (e.key === '.' || e.key === ',') handleNumber('.')
            if (e.key === '+' && isPhone) handleNumber('+')
            if (e.key === 'Backspace') handleDelete()
            if (e.key === 'Enter') onConfirm(value)
            if (e.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleNumber, handleDelete, onConfirm, onCancel, value])

    const displayValue = isPassword
        ? '•'.repeat(value.length)
        : value || '0'

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: 'rgba(26, 28, 26, 0.3)',
            backdropFilter: 'blur(20px)'
        }}>
            <div style={{
                background: 'var(--color-lift)',
                borderRadius: 'var(--radius-lg)',
                padding: '32px',
                width: '100%',
                maxWidth: '400px',
                boxShadow: 'var(--shadow-lg)',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                animation: 'scaleIn 0.3s cubic-bezier(.22, .68, 0, 1.2)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)', margin: 0, fontFamily: 'var(--font-display)' }}>{title}</h3>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Main Display */}
                <div style={{
                    background: 'var(--color-well)',
                    borderRadius: 'var(--radius-md)',
                    padding: '24px',
                    textAlign: 'center',
                    fontSize: '2.5rem',
                    fontWeight: 900,
                    color: 'var(--color-text)',
                    border: 'none',
                    minHeight: '100px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    wordBreak: 'break-all'
                }}>
                    {displayValue}
                </div>

                {/* Keypad Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                        <PadButton key={n} onClick={() => handleNumber(n.toString())}>{n}</PadButton>
                    ))}

                    {isPhone ? (
                        <PadButton onClick={() => handleNumber('+')}>+</PadButton>
                    ) : allowDecimal ? (
                        <PadButton onClick={() => handleNumber('.')}>.</PadButton>
                    ) : (
                        <PadButton onClick={handleClear} style={{ background: 'var(--color-well)', color: 'var(--color-primary)', fontSize: '1rem' }}>Effacer</PadButton>
                    )}

                    <PadButton onClick={() => handleNumber('0')}>0</PadButton>

                    <PadButton onClick={handleDelete} style={{ background: 'var(--color-well)', color: 'var(--color-error)' }}>
                        <Delete size={24} />
                    </PadButton>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <button onClick={onCancel} className="btn-ghost" style={{ flex: 1, height: '60px', borderRadius: 'var(--radius-md)', fontWeight: 700 }}>
                        Annuler
                    </button>
                    <button onClick={() => onConfirm(value)} className="btn-primary" style={{ flex: 2, height: '60px', borderRadius: '9999px', fontWeight: 800, fontSize: '1.1rem', gap: '10px' }}>
                        <Check size={24} /> Valider
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    )
}

function PadButton({ children, onClick, style }: { children: React.ReactNode, onClick: () => void, style?: React.CSSProperties }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                height: '72px',
                fontSize: '1.5rem',
                fontWeight: 700,
                background: 'var(--color-lift)',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                boxShadow: 'var(--shadow-sm)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                transition: 'all 0.1s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...style
            }}
            onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.95)'
                e.currentTarget.style.background = 'var(--color-well)'
            }}
            onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.background = 'var(--color-lift)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.background = 'var(--color-lift)'
            }}
        >
            {children}
        </button>
    )
}
