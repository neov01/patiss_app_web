'use client'

import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { Calculator } from 'lucide-react'
import NumPad from './NumPad'

interface TouchInputProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    title?: string
    isPassword?: boolean
    allowDecimal?: boolean
    maxLength?: number
    className?: string
    style?: React.CSSProperties
    icon?: React.ReactNode
    isPhone?: boolean
    hideIcon?: boolean
    hasError?: boolean
}

export default function TouchInput({
    value,
    onChange,
    placeholder = 'Appuyer pour saisir...',
    title,
    isPassword = false,
    allowDecimal = false,
    maxLength,
    className = 'input',
    style,
    icon,
    isPhone = false,
    hideIcon = false,
    hasError = false
}: TouchInputProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [fontSize, setFontSize] = useState<number | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const textRef = useRef<HTMLSpanElement>(null)

    const baseFontSize = parseFloat(style?.fontSize as string) || 1
    const MIN_FONT_SIZE = 0.55

    const adjustFontSize = useCallback(() => {
        const container = containerRef.current
        const text = textRef.current
        if (!container || !text || !value) {
            setFontSize(null)
            return
        }
        text.style.fontSize = `${baseFontSize}rem`
        const cs = getComputedStyle(container)
        const available = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        const textWidth = text.scrollWidth
        if (textWidth > available && available > 0) {
            setFontSize(Math.max(MIN_FONT_SIZE, baseFontSize * (available / textWidth)))
        } else {
            setFontSize(null)
        }
    }, [value, baseFontSize])

    useLayoutEffect(() => {
        adjustFontSize()
    }, [adjustFontSize])

    return (
        <>
            <div
                className={`${className} ${hasError ? 'has-error' : ''}`}
                onClick={() => setIsOpen(true)}
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '48px',
                    userSelect: 'none',
                    background: hasError ? '#FFF5F5' : 'var(--color-well)',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 'var(--radius-md)',
                    border: hasError ? '1.5px solid var(--color-error)' : '1.5px solid transparent',
                    ...style
                }}
                onMouseDown={e => {
                    e.currentTarget.style.transform = 'scale(0.98)'
                    e.currentTarget.style.backgroundColor = hasError ? '#FFEAEA' : 'var(--color-surface-variant)'
                }}
                onMouseUp={e => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.backgroundColor = hasError ? '#FFF5F5' : 'var(--color-well)'
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.backgroundColor = hasError ? '#FFF5F5' : 'var(--color-well)'
                }}
            >
                <div ref={containerRef} style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden', padding: '0 6px' }}>
                    {value ? (
                        <span ref={textRef} style={{
                            color: 'var(--color-text)',
                            fontWeight: 700,
                            fontSize: fontSize !== null ? `${fontSize}rem` : `${baseFontSize}rem`,
                            letterSpacing: isPassword ? '0.2rem' : 'normal',
                            whiteSpace: 'nowrap',
                        }}>
                            {isPassword ? '•'.repeat(value.length) : value}
                        </span>
                    ) : (
                        <span style={{ color: 'var(--color-muted)', opacity: 0.5, fontStyle: 'italic' }}>{placeholder}</span>
                    )}
                </div>
                {!hideIcon && (
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'var(--color-primary-container)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: '8px'
                    }}>
                        {icon || <Calculator size={18} style={{ color: 'var(--color-primary)' }} />}
                    </div>
                )}
            </div>

            {isOpen && (
                <NumPad
                    initialValue={value}
                    title={title}
                    isPassword={isPassword}
                    allowDecimal={allowDecimal}
                    maxLength={maxLength}
                    isPhone={isPhone}
                    onConfirm={(val) => {
                        onChange(val)
                        setIsOpen(false)
                    }}
                    onCancel={() => setIsOpen(false)}
                />
            )}
        </>
    )
}
