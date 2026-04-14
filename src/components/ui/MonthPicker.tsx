'use client'

import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, parseISO, addYears, subYears, setMonth } from 'date-fns'
import { fr } from 'date-fns/locale'

interface MonthPickerProps {
    value: string // 'yyyy-MM'
    onChange: (value: string) => void
    placeholder?: string
    direction?: 'up' | 'down'
}

const MONTHS = [
    'janv.', 'févr.', 'mars', 'avr.',
    'mai', 'juin', 'juil.', 'août',
    'sept.', 'oct.', 'nov.', 'déc.'
]

export default function MonthPicker({ 
    value, 
    onChange, 
    placeholder = 'Sélectionner un mois',
    direction = 'down'
}: MonthPickerProps) {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    
    // Parse current value or use today for the view
    const dateValue = value ? parseISO(value + '-01') : new Date()
    const [viewDate, setViewDate] = useState(dateValue)

    // Sync viewDate when modal or value changes (optional but good for UX)
    useEffect(() => {
        if (value) setViewDate(parseISO(value + '-01'))
    }, [value])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleMonthSelect = (monthIndex: number) => {
        const newDate = setMonth(viewDate, monthIndex)
        onChange(format(newDate, 'yyyy-MM'))
        setOpen(false)
    }

    const currentYear = format(viewDate, 'yyyy')

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
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
                    fontWeight: 600,
                    color: value ? 'var(--color-text)' : 'var(--color-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                    minHeight: '44px',
                    textTransform: 'capitalize'
                }}
            >
                <Calendar size={18} color="var(--color-rose-dark)" />
                <span style={{ flex: 1 }}>
                    {value ? format(dateValue, 'MMMM yyyy', { locale: fr }) : placeholder}
                </span>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', 
                    [direction === 'up' ? 'bottom' : 'top']: 'calc(100% + 8px)', 
                    left: 0, 
                    zIndex: 100,
                    background: '#fff', 
                    borderRadius: '20px', 
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 12px 40px rgba(45, 27, 14, 0.15)', 
                    padding: '20px', 
                    width: '280px',
                    animation: `${direction === 'up' ? 'monthPickerUpIn' : 'monthPickerIn'} 0.25s cubic-bezier(0.16, 1, 0.3, 1)`,
                    transformOrigin: direction === 'up' ? 'bottom left' : 'top left'
                }}>
                    {/* Header Year Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <button 
                            type="button" 
                            onClick={() => setViewDate(subYears(viewDate, 1))} 
                            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: '#fff', cursor: 'pointer' }}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#2D1B0E' }}>{currentYear}</span>
                        <button 
                            type="button" 
                            onClick={() => setViewDate(addYears(viewDate, 1))} 
                            style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: '#fff', cursor: 'pointer' }}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* Months Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        {MONTHS.map((m, idx) => {
                            const isSelected = value && dateValue.getMonth() === idx && dateValue.getFullYear() === viewDate.getFullYear()
                            return (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => handleMonthSelect(idx)}
                                    style={{
                                        padding: '14px 0',
                                        borderRadius: '14px',
                                        border: 'none',
                                        background: isSelected ? 'var(--color-rose-dark)' : 'transparent',
                                        color: isSelected ? '#fff' : 'var(--color-text)',
                                        fontWeight: isSelected ? 800 : 500,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'var(--color-cream)')}
                                    onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                                >
                                    {m}
                                </button>
                            )
                        })}
                    </div>

                    {/* Footer Actions */}
                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid var(--color-border)', paddingTop: '16px' }}>
                        <button 
                            type="button" 
                            onClick={() => { onChange(''); setOpen(false) }} 
                            style={{ border: 'none', background: 'none', fontSize: '0.8rem', color: 'var(--color-muted)', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Effacer
                        </button>
                        <button 
                            type="button" 
                            onClick={() => { onChange(format(new Date(), 'yyyy-MM')); setOpen(false) }} 
                            style={{ border: 'none', background: 'none', fontSize: '0.8rem', color: 'var(--color-rose-dark)', fontWeight: 800, cursor: 'pointer' }}
                        >
                            Ce mois
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes monthPickerIn {
                    from { transform: translateY(-8px) scale(0.95); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes monthPickerUpIn {
                    from { transform: translateY(8px) scale(0.95); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    )
}
