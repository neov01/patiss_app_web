'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addDays,
    addMonths,
    subMonths,
    isSameMonth,
    isSameDay,
    isToday,
    isBefore,
    startOfDay
} from 'date-fns'
import { fr } from 'date-fns/locale'

interface DatePickerProps {
    value: Date | null
    onChange: (date: Date) => void
    placeholder?: string
    minDate?: Date
}

export default function DatePicker({ value, onChange, placeholder = 'Sélectionner une date', minDate }: DatePickerProps) {
    const [open, setOpen] = useState(false)
    const [currentMonth, setCurrentMonth] = useState(value || new Date())
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Generate calendar days
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

    const days: Date[] = []
    let day = calendarStart
    while (day <= calendarEnd) {
        days.push(day)
        day = addDays(day, 1)
    }

    const weekDays = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

    const handleSelect = (d: Date) => {
        if (minDate && isBefore(d, startOfDay(minDate))) return
        onChange(d)
        setOpen(false)
    }

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            {/* Trigger Button */}
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
                    fontWeight: 500,
                    color: value ? 'var(--color-text)' : 'var(--color-muted)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                    textAlign: 'left',
                    minHeight: '44px',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-rose-dark)'; e.currentTarget.style.background = '#fff'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-cream)'; }}
            >
                <Calendar size={16} color="#C4836A" />
                <span style={{ flex: 1 }}>
                    {value ? format(value, 'EEEE d MMMM yyyy', { locale: fr }) : placeholder}
                </span>
            </button>

            {/* Calendar Popover */}
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
                        padding: '16px',
                        width: '300px',
                        animation: 'datePickerIn 0.2s ease-out',
                    }}
                >
                    {/* Month Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <button
                            type="button"
                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                            style={{
                                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer',
                                color: 'var(--color-muted)', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', textTransform: 'capitalize' }}>
                            {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                            style={{
                                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer',
                                color: 'var(--color-muted)', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* Weekday Headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                        {weekDays.map(wd => (
                            <div key={wd} style={{
                                textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-muted)',
                                textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 0',
                            }}>
                                {wd}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                        {days.map((d, i) => {
                            const inMonth = isSameMonth(d, currentMonth)
                            const selected = value ? isSameDay(d, value) : false
                            const today = isToday(d)
                            const disabled = minDate ? isBefore(d, startOfDay(minDate)) : false

                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => !disabled && handleSelect(d)}
                                    disabled={disabled}
                                    style={{
                                        width: '36px', height: '36px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        borderRadius: '10px',
                                        border: 'none',
                                        fontSize: '0.85rem',
                                        fontWeight: selected ? 700 : today ? 600 : 400,
                                        cursor: disabled ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.15s',
                                        background: selected
                                            ? 'linear-gradient(135deg, #C4836A, #C08A63)'
                                            : 'transparent',
                                        color: selected
                                            ? '#fff'
                                            : disabled
                                                ? '#D5CCC5'
                                                : !inMonth
                                                    ? '#D5CCC5'
                                                    : today
                                                        ? '#C4836A'
                                                        : 'var(--color-text)',
                                        boxShadow: selected ? '0 2px 8px rgba(196, 131, 106, 0.35)' : 'none',
                                        margin: '0 auto',
                                        outline: today && !selected ? '2px solid var(--color-border)' : 'none',
                                        outlineOffset: '-2px',
                                    }}
                                    onMouseEnter={e => {
                                        if (!selected && !disabled) {
                                            e.currentTarget.style.background = 'var(--color-cream)'
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (!selected && !disabled) {
                                            e.currentTarget.style.background = 'transparent'
                                        }
                                    }}
                                >
                                    {format(d, 'd')}
                                </button>
                            )
                        })}
                    </div>

                    {/* Today shortcut */}
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'center' }}>
                        <button
                            type="button"
                            onClick={() => { setCurrentMonth(new Date()); handleSelect(new Date()) }}
                            style={{
                                padding: '6px 16px', borderRadius: '8px', border: 'none',
                                background: 'var(--color-cream)', color: '#C4836A', fontSize: '0.8rem',
                                fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-blush)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--color-cream)'}
                        >
                            Aujourd&apos;hui
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes datePickerIn {
                    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    )
}
