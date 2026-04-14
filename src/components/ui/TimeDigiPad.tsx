'use client'

import { useState, useRef, useEffect } from 'react'
import { Clock, Delete } from 'lucide-react'

interface TimeDigiPadProps {
    value: string // 'HH:MM' format
    onChange: (time: string) => void
    placeholder?: string
}

export default function TimeDigiPad({ value, onChange, placeholder = 'Heure de retrait' }: TimeDigiPadProps) {
    const [open, setOpen] = useState(false)
    const [digits, setDigits] = useState<string[]>([])
    const containerRef = useRef<HTMLDivElement>(null)

    // Parse value on open
    useEffect(() => {
        if (open && value) {
            const clean = value.replace(':', '')
            setDigits(clean.split('').slice(0, 4))
        } else if (open) {
            setDigits([])
        }
    }, [open])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const displayTime = () => {
        if (digits.length === 0) return ['--', '--']
        const padded = [...digits, '_', '_', '_', '_'].slice(0, 4)
        return [`${padded[0]}${padded[1]}`, `${padded[2]}${padded[3]}`]
    }

    const handleDigit = (d: string) => {
        if (digits.length >= 4) return

        const newDigits = [...digits, d]
        
        // Validate as we type
        if (newDigits.length === 1 && parseInt(d) > 2) return
        if (newDigits.length === 2) {
            const hour = parseInt(newDigits.slice(0, 2).join(''))
            if (hour > 23) return
        }
        if (newDigits.length === 3 && parseInt(d) > 5) return
        if (newDigits.length === 4) {
            const min = parseInt(newDigits.slice(2, 4).join(''))
            if (min > 59) return
        }

        setDigits(newDigits)

        // Auto-confirm when 4 digits entered
        if (newDigits.length === 4) {
            const timeStr = `${newDigits[0]}${newDigits[1]}:${newDigits[2]}${newDigits[3]}`
            onChange(timeStr)
            setTimeout(() => setOpen(false), 300)
        }
    }

    const handleDelete = () => {
        setDigits(prev => prev.slice(0, -1))
    }

    const handleClear = () => {
        setDigits([])
        onChange('')
    }

    const [hh, mm] = displayTime()
    const isComplete = digits.length === 4

    const quickTimes = ['08:00', '09:00', '10:00', '12:00', '14:00', '16:00']

    const handleQuickTime = (t: string) => {
        onChange(t)
        setDigits(t.replace(':', '').split(''))
        setTimeout(() => setOpen(false), 200)
    }

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    background: 'var(--color-cream)',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    fontWeight: value ? 600 : 500,
                    color: value ? 'var(--color-text)' : 'var(--color-muted)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                    textAlign: 'left',
                    minHeight: '44px',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-rose-dark)'; e.currentTarget.style.background = '#fff'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-cream)'; }}
            >
                <Clock size={16} color="#C4836A" />
                <span>{value || placeholder}</span>
            </button>

            {/* Digipad Popover */}
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 100,
                        background: '#fff',
                        borderRadius: '16px',
                        border: '1px solid var(--color-border)',
                        boxShadow: '0 12px 40px rgba(45, 27, 14, 0.12), 0 4px 12px rgba(45, 27, 14, 0.06)',
                        padding: '20px',
                        width: '280px',
                        animation: 'timepadIn 0.2s ease-out',
                    }}
                >
                    {/* Time Display */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginBottom: '20px',
                        padding: '14px',
                        background: isComplete ? 'linear-gradient(135deg, rgba(196,131,106,0.1), rgba(192,138,99,0.08))' : 'var(--color-cream)',
                        borderRadius: '14px',
                        transition: 'all 0.3s',
                        border: isComplete ? '1.5px solid rgba(196,131,106,0.3)' : '1.5px solid transparent',
                    }}>
                        <span style={{
                            fontSize: '2.2rem',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            letterSpacing: '2px',
                            color: digits.length >= 2 ? 'var(--color-text)' : 'var(--color-muted)',
                            transition: 'color 0.2s',
                        }}>
                            {hh}
                        </span>
                        <span style={{
                            fontSize: '2.2rem',
                            fontWeight: 800,
                            color: '#C4836A',
                            animation: !isComplete ? 'colonBlink 1s infinite' : 'none',
                        }}>
                            :
                        </span>
                        <span style={{
                            fontSize: '2.2rem',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            letterSpacing: '2px',
                            color: digits.length >= 4 ? 'var(--color-text)' : 'var(--color-muted)',
                            transition: 'color 0.2s',
                        }}>
                            {mm}
                        </span>
                    </div>

                    {/* Quick Times */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px', justifyContent: 'center' }}>
                        {quickTimes.map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => handleQuickTime(t)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: value === t ? '#C4836A' : 'var(--color-cream)',
                                    color: value === t ? '#fff' : 'var(--color-muted)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => {
                                    if (value !== t) e.currentTarget.style.background = 'var(--color-blush)'
                                }}
                                onMouseLeave={e => {
                                    if (value !== t) e.currentTarget.style.background = 'var(--color-cream)'
                                }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* NumPad Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(key => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => {
                                    if (key === '⌫') handleDelete()
                                    else if (key === 'C') handleClear()
                                    else handleDigit(key)
                                }}
                                style={{
                                    height: '48px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    fontSize: key === '⌫' || key === 'C' ? '0.85rem' : '1.15rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.12s',
                                    background: key === 'C'
                                        ? 'var(--color-cream)'
                                        : key === '⌫'
                                            ? 'var(--color-cream)'
                                            : '#FAFAFA',
                                    color: key === 'C'
                                        ? '#D94F38'
                                        : key === '⌫'
                                            ? 'var(--color-muted)'
                                            : 'var(--color-text)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = key === 'C' ? '#FDE8E0' : 'var(--color-cream)'
                                    e.currentTarget.style.transform = 'scale(1.04)'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = key === 'C' || key === '⌫' ? 'var(--color-cream)' : '#FAFAFA'
                                    e.currentTarget.style.transform = 'scale(1)'
                                }}
                                onMouseDown={e => {
                                    e.currentTarget.style.transform = 'scale(0.95)'
                                }}
                                onMouseUp={e => {
                                    e.currentTarget.style.transform = 'scale(1.04)'
                                }}
                            >
                                {key === '⌫' ? <Delete size={18} /> : key}
                            </button>
                        ))}
                    </div>

                    {isComplete && (
                        <div style={{ marginTop: '12px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#4C9E6A', fontWeight: 600 }}>
                                ✓ Heure enregistrée
                            </span>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes timepadIn {
                    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes colonBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
            `}</style>
        </div>
    )
}
