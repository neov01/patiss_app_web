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
    style
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
                    ...style
                }}
            >
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                    {value ? (
                        <span style={{ color: '#2D1B0E', fontWeight: 600 }}>
                            {isPassword ? '•'.repeat(value.length) : value}
                        </span>
                    ) : (
                        <span style={{ color: '#9C8070', opacity: 0.6 }}>{placeholder}</span>
                    )}
                </div>
                <Calculator size={18} style={{ color: '#d97757', flexShrink: 0, marginLeft: '8px' }} />
            </div>

            {isOpen && (
                <NumPad
                    initialValue={value}
                    title={title}
                    isPassword={isPassword}
                    allowDecimal={allowDecimal}
                    maxLength={maxLength}
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
