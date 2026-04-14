'use client'

import { useState } from 'react'
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
    hideIcon = false
}: TouchInputProps) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <div
                className={className}
                onClick={() => setIsOpen(true)}
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '44px',
                    userSelect: 'none',
                    background: 'white',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid #E5E7EB',
                    ...style
                }}
                onMouseDown={e => {
                    e.currentTarget.style.transform = 'scale(0.98)'
                    e.currentTarget.style.backgroundColor = '#FAF9F6'
                }}
                onMouseUp={e => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.backgroundColor = 'white'
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.backgroundColor = 'white'
                }}
            >
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                    {value ? (
                        <span style={{ 
                            color: '#2D1B0E', 
                            fontWeight: 700,
                            fontSize: '1rem',
                            letterSpacing: isPassword ? '0.2rem' : 'normal'
                        }}>
                            {isPassword ? '•'.repeat(value.length) : value}
                        </span>
                    ) : (
                        <span style={{ color: '#9C8070', opacity: 0.5, fontStyle: 'italic' }}>{placeholder}</span>
                    )}
                </div>
                {!hideIcon && (
                    <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: '#FEF3EC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: '8px'
                    }}>
                        {icon || <Calculator size={16} style={{ color: '#d97757' }} />}
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
